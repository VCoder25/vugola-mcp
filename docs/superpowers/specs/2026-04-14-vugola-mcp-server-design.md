# Vugola MCP Server — Design Spec (v2)

**Date:** 2026-04-14 (revised after security + API-contract review)
**Status:** Design approved, ready for implementation plan
**Owner:** V (vstriz) / Claude Code

---

## Context

Vugola's public REST API lives at `https://api.vugolaai.com`, authenticated with `vug_sk_` Bearer keys. The API is already live, paid-only, Creator plan or above, rate-limited server-side, and SSRF-protected on user-supplied URLs. Full reference: `~/Projects/vai-agency/.tmp_vugola_skill_build/vugola/references/api.md`.

This spec defines `@vugola/mcp` — a Model Context Protocol server that wraps that API so MCP-capable agents (Claude Desktop, Claude Code, Cursor, Cline) can clip videos, check credits, and schedule posts via tool calls. Zero backend changes. Pure client.

**Strategic fit.** V's 27.7K-follower X audience is AI builders — the exact users installing MCPs. Two existing SEO articles (`ai-video-clipping-for-agents`, `agentic-clipping-tool`) already position Vugola as "the agentic clipping tool." This MCP is the concrete product behind that positioning. No competitor (Opus Clip, Vizard, Submagic, Descript) has shipped one.

## Goals

1. Ship a public, paid-only MCP server, installable via `npx -y @vugola/mcp@1.0.0`.
2. Expose `clip_video`, `get_clip_status`, `get_usage`, `schedule_post` as MCP tools.
3. Zero changes to vai-agency. MCP is a client of the existing API.
4. Hardened against the risks surfaced in the review: prompt injection, duplicate charges, supply chain, silent failures, credit drain.
5. Error messages that turn every failed call into a funnel touch (link to `vugolaai.com/dashboard/api-key` or `/pricing`).
6. Ready for V to smoke-test end-to-end before posting on X + LinkedIn.

## Non-goals

- Free-tier clipping via the MCP. Paid key required. Free-plan work is separate.
- Dashboard or vai-agency changes.
- Full CI/CD beyond what's needed for signed npm publishes.
- Python version. TypeScript only for v1.
- Custom telemetry from the MCP. Server-side `last_used_at` on `api_keys` already covers usage tracking.
- Downloading clip bytes through the MCP (v2 feature). For v1, `get_clip_status` returns the API's download URLs with instructions that they require the same Bearer header.

## Architecture

```
 Claude Desktop / Code / Cursor / Cline
              │  (MCP protocol over stdio)
              ▼
     @vugola/mcp  (Node.js 20+, TypeScript)
              │  (HTTPS + Authorization: Bearer vug_sk_*, per-call AbortController)
              ▼
        api.vugolaai.com
              │
              ▼
  Existing Supabase edge functions + clipping pipeline
```

The MCP process:
- Loads `VUGOLA_API_KEY` from its environment once at startup.
- Speaks MCP on stdio to the agent client.
- Makes authenticated HTTPS calls using native `fetch` with per-tool `AbortController` timeouts.
- Holds minimal state: an in-memory token-bucket rate limiter (see Safety rails) and a startup-time timestamp for a heartbeat log.
- Sanitizes every string field in API responses before returning them to the agent (see Injection defense).

## Tools

Every tool shares the same auth-missing behavior: if `VUGOLA_API_KEY` is unset, tools return the same friendly "get a key" message without making a network request.

Tool descriptions explicitly tell the agent to ask the user for missing parameters, matching the "Agent-operable rules" in the official API reference. This keeps agent UX consistent with how Vugola expects to be called.

### `clip_video` — start a clipping job

**Description given to the agent (verbatim in tool schema):**
> Start a video-clipping job. Ask the user for aspect_ratio and caption_style if they're not given. If the user says "just pick," default to aspect_ratio "9:16" and caption_style "minimalist". Videos must be 2–180 minutes long. Jobs take 20–40 minutes; Vugola will email the user when done, and the agent can check status via get_clip_status.

**Input (zod, with bounds)**
- `video_url` — string, required, max 2048 chars.
- `aspect_ratio` — enum: `"9:16" | "16:9" | "1:1"`, required.
- `caption_style` — enum: `"none" | "highlighted" | "scale" | "minimalist" | "box"`, required.

**HTTP call:** `POST https://api.vugolaai.com/clip` with the body above. Timeout: 15s.

**Returns**
```json
{
  "job_id": "uuid",
  "status": "processing",
  "estimated_minutes": 30,
  "notification": { "channel": "email", "expected_within_minutes": 40 },
  "message": "Job started. Vugola will email you when the clips are ready (usually 20-40 minutes). You can also ask me to check the status.",
  "next_action_hint": "To check progress, call get_clip_status with this job_id."
}
```

The `notification` and `next_action_hint` fields are structured so the agent is more likely to surface them verbatim rather than paraphrasing away the email detail.

**Retry policy:** **NO retry on POST /clip** — even on 5xx. This endpoint spends credits and is not idempotent; retrying risks duplicate charges. Any error returns immediately.

### `get_clip_status` — poll a running job

**Description:**
> Check whether a clipping job is done. Call this when the user asks about a job they've already started.

**Input:** `job_id` — string, required, max 64 chars.

**HTTP call:** `GET https://api.vugolaai.com/clip/{job_id}`. Timeout: 10s. Idempotent — safe to retry once on 5xx with 3s delay.

**Returns (processing)**
```json
{
  "job_id": "uuid",
  "status": "processing",
  "progress_percent": 45,
  "clips_ready": 2,
  "clips_total": 5
}
```

**Returns (complete)**
```json
{
  "job_id": "uuid",
  "status": "complete",
  "credits_used": 8,
  "clips": [
    {
      "clip_id": "uuid",
      "title": "<sanitized, max 200 chars>",
      "duration_seconds": 42.5,
      "virality_score": 0.92,
      "download_url": "https://api.vugolaai.com/clip/<job_id>/download/1"
    }
  ],
  "download_note": "Download URLs require the same Authorization: Bearer header as other calls. They're valid for approximately 1 hour after completion — save clips promptly."
}
```

**Returns (failed)**
```json
{ "job_id": "uuid", "status": "failed", "error": "<mapped, sanitized reason>" }
```

### `get_usage` — check credits and plan

**Description:**
> Return how many credits the user has, their plan, and how many they've used this month.

**Input:** none.

**HTTP call:** `GET https://api.vugolaai.com/status`. Timeout: 8s. Idempotent.

**Returns**
```json
{
  "credits_remaining": 120,
  "credits_total": 500,
  "credits_used_this_month": 380,
  "plan": "creator",
  "as_of": "2026-04-14T18:12:34Z"
}
```

`as_of` signals to the agent (and user) that the value may be stale if read and then acted on after a delay.

### `schedule_post` — schedule one or more social posts

**Description:**
> Schedule clips or media to post on supported social platforms. Ask the user for platform, post_type, caption, and scheduled_at if missing. Instagram carousels need 2–10 items. YouTube, TikTok, and Instagram single posts require media.

**Input (zod, with bounds)**
- `posts` — array, 1–25 items. Each item:
  - `platform` — enum: `"x" | "instagram" | "tiktok" | "youtube" | "facebook" | "linkedin" | "threads" | "bluesky"`.
  - `post_type` — enum: `"single" | "carousel" | "text"`. Required.
  - `caption` — string, max 2200 chars.
  - `title` — string, max 200 chars, optional.
  - `scheduled_at` — ISO 8601 string, required, must be in the future.
  - `media_url` — string, max 2048 chars, optional (required for single posts on instagram/tiktok/youtube).
  - `asset_id` — string, max 64 chars, optional (alternative to `media_url`).
  - `carousel_items` — array, 2–10 items, each `{ asset_id? | media_url? }`. Required if `post_type="carousel"`. Carousel only supported on instagram.
  - `platform_settings` — object, optional, passed through as-is.

**HTTP call:** `POST https://api.vugolaai.com/schedule`. Timeout: 15s. **NO retry** on 5xx (scheduling is not idempotent — retry could double-schedule).

**Returns — critical partial-failure shape:**
```json
{
  "overall_status": "all_scheduled" | "partial_failure" | "all_failed",
  "summary": "Scheduled 2 of 3 posts. 1 failed: linkedin (LinkedIn not connected).",
  "scheduled": [
    { "id": "uuid", "platform": "tiktok", "scheduled_at": "2026-04-15T18:00:00Z" }
  ],
  "failed": [
    { "platform": "linkedin", "error": "LinkedIn not connected to this account" }
  ]
}
```

`overall_status` + `summary` at the top make it harder for the agent to say "posted!" when nothing actually posted. LLMs routinely paraphrase `{scheduled:[], failed:[...]}` incorrectly; a plain-language summary string forces honest reporting.

## Auth flow

```json
{
  "mcpServers": {
    "vugola": {
      "command": "npx",
      "args": ["-y", "@vugola/mcp@1.0.0"],
      "env": { "VUGOLA_API_KEY": "vug_sk_..." }
    }
  }
}
```

**Pinned version.** Users install a specific version (`@1.0.0`), not always-latest. This is the single biggest supply-chain mitigation: a compromised npm publish doesn't auto-deploy to every user. README shows the latest safe version to copy.

**On startup:**
- Read `VUGOLA_API_KEY` once. If missing, log one line to stderr (`[vugola-mcp] VUGOLA_API_KEY not set — tools will return a setup message.`) so the user sees it in their agent client's log.
- If present, emit `[vugola-mcp] ready — key loaded (last 4: ...XXXX)`. Never log the full key anywhere.

**Rotation:** user edits config, restarts the agent. No MCP-side refresh.

## Injection defense

This is the biggest non-obvious risk the review surfaced. Clip titles are AI-generated from video content; API error messages may echo user URLs and captions. All of that flows back into the agent's context, where the LLM may treat attacker-controlled text as instructions.

**Defense in depth — every string field in every response is passed through a `sanitize()` function before returning:**

1. **Truncate** to a per-field max length (titles 200, captions 2200, error messages 500, URLs 2048).
2. **Strip** lines that look like injected instructions — regex: `/^(ignore|forget|system:|assistant:|user:|new instructions?)/im`. On match, the whole field becomes `"<content-suppressed: possible injection>"`.
3. **HTML-escape** `<`, `>`, `&` defensively (defeats markdown/HTML tricks).
4. **Never** pass through raw API error bodies. Map known API error shapes to a small allow-list of canned strings (see Error handling). Raw bodies go to stderr logs only.

This does not prevent every possible injection — determined attackers can evade pattern matches. But it catches the standard vectors and signals to the LLM that the field is data, not an instruction. MCP `annotations` (`audience: "user"`, `priority`) are set on every tool response to reinforce this.

## Error handling

Every failure returns a `content: [{ type: "text", text: "<canned message>" }]`. Raw API messages are NEVER echoed to the agent; they go to stderr logs only.

| Condition | Canned message returned to agent |
|---|---|
| `VUGOLA_API_KEY` missing | `"Set VUGOLA_API_KEY in your MCP config. Get one at https://www.vugolaai.com/dashboard/api-key"` |
| API 401 (bad/revoked key) | `"Your API key was rejected. Check or regenerate it at https://www.vugolaai.com/dashboard/api-key"` |
| API 402 (out of credits) | `"Out of credits. They may have been used by another session. Upgrade or top up at https://www.vugolaai.com/pricing"` |
| API 403 (plan doesn't include this feature) | `"Your Vugola plan doesn't include this feature. See https://www.vugolaai.com/pricing for plans."` |
| API 404 (job_id / post_id unknown) | `"Job or post not found. The ID may be wrong or the job may have been deleted."` |
| API 429 (rate limited) | `"Vugola rate limit hit. Try again in about a minute."` Honors `Retry-After` header internally if implementing client-side wait (v1 just reports). |
| API 400 (bad input) | Map to canned strings by the API's error code field: `video_too_short` → `"Videos must be at least 2 minutes long."`; `video_too_long` → `"Videos must be 3 hours or shorter."`; `invalid_url` → `"That video URL isn't supported."`; `unknown` → `"Vugola rejected the request. Check the input and try again."` Raw API message is never passed through. |
| API 5xx | Idempotent GETs: retry once with 3s backoff. Both attempts fail → `"Vugola is having a temporary problem. Try again in a few minutes."` plus a `warning` field noting the attempt. POST `/clip` and POST `/schedule`: no retry; fail fast with the same message. |
| Timeout (AbortController fired) | `"Vugola took too long to respond. Try again shortly."` |
| DNS / TLS / network error | `"Couldn't reach Vugola. Check your internet connection."` |

## Safety rails

Added after the review. These live inside the MCP process — no persistence, no backend changes.

1. **Per-tool HTTP timeouts via AbortController.** `clip_video` 15s, `get_clip_status` 10s, `get_usage` 8s, `schedule_post` 15s. Native `fetch` has no default timeout — these are required.

2. **Client-side token bucket rate limit.** In-memory, per-MCP-process. Defaults:
   - `clip_video`: 5 calls per 60-second window.
   - `schedule_post`: 10 calls per 60-second window.
   - `get_clip_status` and `get_usage`: 30 calls per 60-second window.
   When exceeded, tool returns `"You're calling Vugola too quickly. Wait a moment and try again."` without hitting the API.
   This catches the "agent-in-a-retry-loop drains credits" failure mode seen in the review.

3. **Input-size bounds on every zod schema.** `video_url` 2048, `caption` 2200, `title` 200, `scheduled_at` validated as ISO, enum fields validated. Rejected inputs never reach the API.

4. **No retry on credit-spending POSTs.** `POST /clip` and `POST /schedule` never retry on 5xx. Idempotency on the server side would let us relax this later, but v1 errs on the side of "never double-charge."

5. **Pinned version install.** Users install `@vugola/mcp@1.0.0` — a compromised publish does not reach them until they opt in.

6. **npm publish hardening** (one-time setup, documented in repo):
   - 2FA required on all org members.
   - `npm publish --provenance` used for every release.
   - Short-lived publish tokens (no stored credentials after v1.0).
   - Once CI exists, publish via GitHub Actions OIDC, not from laptops.

7. **README warning block** on committing config files:
   > **Do not commit your `VUGOLA_API_KEY`.** Your agent's config file contains a secret. Add it to `.gitignore`, or use a secrets manager (1Password CLI, direnv) instead of inline env vars.

   Also register `vug_sk_` prefix with GitHub's secret-scanning partner program (one-time Vugola-side admin task).

## Distribution

- Published as `@vugola/mcp` on npm (scoped), or `vugola-mcp` unscoped if the org name is taken.
- Listed on the Smithery MCP registry.
- Submitted to the Anthropic MCP directory.
- Install via `npx -y @vugola/mcp@<version>` — always pinned in documentation, never always-latest.
- Public GitHub repo `vugola-mcp` under V's GitHub for social-proof stars and independent versioning.

## Testing strategy

No CI gating for v1 — faster iteration. CI publish-on-tag added at v1.1.

**Unit tests** (`vitest`, roughly 120 lines)
- Each of the 4 tool handlers: happy path + at least three error paths (401, 429, timeout).
- `errors.ts` translator: every row of the error table.
- `sanitize()` function: suppresses lines starting with "ignore", truncates correctly, escapes HTML.
- Rate limiter: lets N through, blocks N+1, re-allows after window.
- Retry logic: retries idempotent GET once on 5xx, never retries POST.

**Local dev loop**
- `npm run dev` runs the MCP over stdio.
- `scripts/test-client.ts` — tiny MCP client calling each tool once against a real dev key from `.env.local`. Prints results.
- `scripts/inject-probe.ts` — calls `clip_video` against a safely crafted fake-injection URL (via a local mock server) to verify `sanitize()` suppresses it.

**V's pre-launch smoke checklist** (what unblocks the X/LinkedIn post)
1. Install `@vugola/mcp@1.0.0` in Claude Desktop via the config block.
2. Tell Claude to clip one real video (long-form — exercises full pipeline).
3. Confirm `clip_video` returns `job_id` + estimated time + the email notification hint.
4. Wait for the Vugola email.
5. Ask Claude "is that clip done?" — verify `get_clip_status` returns `clips` with download URLs.
6. Download one clip via `curl -H "Authorization: Bearer ..." <download_url>` — confirm it plays.
7. Check `/dashboard/api-key` — credits deducted, `last_used_at` updated.
8. Call `schedule_post` with one platform — verify it appears on Vugola's schedule UI.
9. Revoke the test key, call any tool — verify the 401 canned message.
10. Unset `VUGOLA_API_KEY`, restart agent — verify the missing-key message.

Only after that passes does V write the announcement.

## Repo structure

```
vugola-mcp/                 (new public GitHub repo)
├── src/
│   ├── index.ts            — MCP server entry, tool registration
│   ├── client.ts           — HTTP client: fetch + AbortController + error mapping
│   ├── sanitize.ts         — string sanitizer for API response fields
│   ├── rate-limit.ts       — in-memory token bucket
│   ├── errors.ts           — API error → canned string translator
│   └── tools/
│       ├── clip-video.ts
│       ├── get-clip-status.ts
│       ├── get-usage.ts
│       └── schedule-post.ts
├── scripts/
│   ├── test-client.ts      — manual smoke-test driver
│   └── inject-probe.ts     — injection-defense smoke test
├── tests/                  — vitest unit tests, one file per src module
├── README.md               — install blocks (Desktop/Code/Cursor/Cline), tool reference, security warnings
├── package.json            — name "@vugola/mcp", bin entry, deps: @modelcontextprotocol/sdk, zod
├── tsconfig.json
├── .env.example            — VUGOLA_API_KEY=
├── .gitignore              — .env*, .env.local, dist/, node_modules/
└── LICENSE                 — MIT
```

Roughly 700–900 lines of TypeScript total (larger than v1 estimate because of sanitize, rate-limit, and error translator).

## Dependencies

- `@modelcontextprotocol/sdk` — first-party MCP SDK.
- `zod` — input validation with bounds.
- `vitest` (dev) — tests.
- `typescript`, `tsx` (dev) — type-check + dev runner.

No HTTP library — native `fetch` plus `AbortController` from Node 20.

## Prerequisites

- `/dashboard/api-key` page at vugolaai.com — already exists.
- npm org `vugola` — verify ownership or fall back to unscoped `vugola-mcp`.
- GitHub repo `vugola-mcp` — create before implementation starts.
- npm 2FA enabled on V's account and any org members.
- `vug_sk_` prefix registered with GitHub secret-scanning partner program (admin task on vai-agency side — file a request).
- Implementation plan's first step: re-read `~/Projects/vai-agency/.tmp_vugola_skill_build/vugola/references/api.md` and `supabase/functions/vugola-api/index.ts` line ranges noted in the review, confirm every tool contract matches reality before writing handlers. The contracts in this spec are aligned to the official reference but the reference could drift; always verify against live code.

## Out of scope (deferred to v1.1+)

- Free-tier clipping via the MCP (depends on free-plan work in other terminal).
- `download_clip(job_id, index)` tool that streams clip bytes through the MCP (v1 returns URLs with a "use Bearer header" note).
- `list_schedule` / `cancel_scheduled_post` tools (server-side endpoints exist — `GET /schedule`, `DELETE /schedule/:id` — but v1 ships with the 4-tool surface already agreed).
- Streaming progress updates via MCP notifications (Vugola email covers notification; optional nice-to-have for clients that support it).
- Python binding.
- Full CI/CD (add on v1.1: GitHub Actions publish-on-tag with OIDC).

## Launch plan

1. Ship `@vugola/mcp@1.0.0` to npm quietly with `--provenance`. No announcement.
2. V runs the smoke checklist above. If anything feels off, iterate.
3. Once V is satisfied:
   - V writes and posts the X thread (funny first, product second — per his established X rule).
   - V writes and posts the LinkedIn version (more professional framing, same story).
   - Update `ai-video-clipping-for-agents` and `agentic-clipping-tool` blog articles with install instructions.
   - Update `/resources` hub.

Launch timing is V's call; nothing in this spec blocks on it.

## What changed from v1 of this spec

For the record (so future reviewers see the evolution):

- **API contracts corrected:** base URL is `api.vugolaai.com` (no `/v1/`); credits endpoint is `/status`; schedule takes `posts[]` with `post_type`; caption_style is a required input; min video is 2 minutes (was incorrectly 1); clip response fields renamed to match reality (`virality_score`, `clip_id`, `progress_percent`, `clips_ready`, `clips_total`).
- **Duplicate-charge bug removed:** no retry on POST `/clip` or POST `/schedule`, ever.
- **Prompt injection defense added:** `sanitize()` on every response string, canned error messages only, never pass through raw API bodies.
- **Supply chain hardened:** pinned version in install instructions, npm 2FA required, `--provenance` on publish.
- **Timeouts added:** AbortController on every `fetch` (native `fetch` has none by default).
- **Client rate limits added:** token bucket prevents runaway agent loops from draining credits.
- **schedule_post shape fixed:** top-level `overall_status` + `summary` strings force honest reporting on partial failure.
- **Error table expanded:** 403, 404, 408, 429, DNS/TLS errors all explicitly handled.
- **Download URL expiry surfaced:** tool response includes a `download_note` telling the user URLs are short-lived.
- **Input bounds added:** zod `.max()` constraints on every string input.
- **Config-commit warning added:** README block + GitHub secret-scanning prefix registration.
