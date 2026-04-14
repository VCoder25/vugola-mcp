# vugola-mcp

Official MCP server for [Vugola](https://www.vugolaai.com) — the AI video clipping tool.

Let Claude (or any MCP-capable agent) clip videos, check your credits, and schedule posts on your Vugola account.

---

## Requires

- Node.js 20 or higher.
- A paid Vugola account. Generate a key at [vugolaai.com/dashboard/api-key](https://www.vugolaai.com/dashboard/api-key).

---

## Install

### Claude Desktop (one command, auto-configures)

```bash
npx -y vugola-mcp-install@1.1.1
```

You'll be prompted for your API key. It edits your Claude Desktop config for you — no JSON to hand-write. **Quit and reopen Claude Desktop** to pick up the change.

To skip the prompt: `npx -y vugola-mcp-install@1.1.1 --key vug_sk_yourkey`.

### Claude Code

```bash
claude mcp add vugola -- npx -y vugola-mcp@1.1.1
```

Then export your key in your shell or `.env`:

```bash
export VUGOLA_API_KEY=vug_sk_your_key_here
```

### Cursor / Cline / manual

If your MCP client isn't covered above, drop this block into its config file:

```json
{
  "mcpServers": {
    "vugola": {
      "command": "npx",
      "args": ["-y", "vugola-mcp@1.1.1"],
      "env": { "VUGOLA_API_KEY": "vug_sk_your_key_here" }
    }
  }
}
```

**Always pin the version** (`vugola-mcp@1.1.0`) — never install `latest`.

---

## Tools

### `clip_video`

Start a clipping job. Takes 10–30 minutes. Vugola emails you when it's done.

Inputs: `video_url`, `aspect_ratio` (`9:16` | `16:9` | `1:1`), `caption_style` (`none` | `highlighted` | `scale` | `minimalist` | `box`).

### `get_clip_status`

Check a running job. Agent calls this when you ask "is that clip done?"

Inputs: `job_id`.

### `get_usage`

Show credits remaining, monthly usage, and plan.

No inputs.

### `schedule_post`

Schedule one or more social posts. Supports x, instagram, tiktok, youtube, facebook, linkedin, threads, bluesky. Instagram carousels supported with 2–10 items.

Inputs: `posts[]` (max 25 per call). See the tool description for full fields.

---

## Security

- **Never commit your `VUGOLA_API_KEY`.** Your agent's config file contains a secret. Add it to `.gitignore`, or use a secrets manager (1Password CLI, direnv) instead of inline env vars.
- **Always pin the version** (`vugola-mcp@1.0.0`) in your install. Don't install "latest."
- If you accidentally leak your key, regenerate it at [vugolaai.com/dashboard/api-key](https://www.vugolaai.com/dashboard/api-key) immediately.
- Download URLs returned by `get_clip_status` require the same `Authorization: Bearer <key>` header and expire in ~1 hour. Save clips promptly or re-fetch the status before downloading.

---

## Pricing

This MCP requires a paid Vugola account (Creator plan or above). See [pricing](https://www.vugolaai.com/pricing).

---

## Links

- Vugola: https://www.vugolaai.com
- Dashboard: https://www.vugolaai.com/dashboard/api-key

---

## License

MIT © 2026 Vadim Strizheus
