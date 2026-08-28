# Vugola MCP

Official [Vugola](https://www.vugolaai.com) connector and plugin package for ChatGPT, Codex, Cursor, Grok Bot, Claude, and any MCP client.

This repo contains the OpenAI plugin package, Cursor Marketplace package, and hosted MCP definition. Every surface points at the same **live hosted MCP** every Vugola customer can use:

`https://www.vugolaai.com/api/mcp`

Sign in with your Vugola account. No API key for Cursor / Grok Bot / Claude / ChatGPT.

Connecting is free. Clipping uses your Vugola credits. A $1 3-day trial is enough to start. Every paid plan includes MCP access.

Guide: [vugolaai.com/mcp](https://www.vugolaai.com/mcp)

---

## Install (ChatGPT and Codex)

The public Vugola listing will be submitted through OpenAI's Plugins Directory. Until it is approved, test the production MCP in ChatGPT Developer mode:

1. Turn on **Developer mode** under **Settings → Security and login**.
2. Open **Plugins**, click **+**, and add an MCP server named **Vugola**.
3. Enter `https://www.vugolaai.com/api/mcp`, then click **Scan Tools**.
4. Sign in at Vugola, create the plugin, and test it in a new chat.

The OpenAI package lives at `.codex-plugin/plugin.json` and uses `.mcp.json`. A platform-issued `.app.json` is added only after OpenAI registers the MCP connection; this repository never fabricates or publishes a placeholder app ID.

OpenAI's plugin bundle is distributed from this public repository. The optional npm artifact remains the local stdio server only and intentionally excludes the hosted OpenAI metadata and brand assets.

---

## Install (Claude Code and Cowork)

The Claude plugin package lives at `.claude-plugin/plugin.json`. It bundles the Vugola skill with the live OAuth tools, so users sign in to Vugola instead of pasting an API key.

Once this version is on the public repository, it can be added before directory approval from Claude's Plugins screen: choose **Add**, choose **Add from a repository**, and enter `VCoder25/vugola-mcp`.

Claude Code users can add the same repository marketplace directly:

```bash
claude plugin marketplace add VCoder25/vugola-mcp
claude plugin install vugola@vugola-plugins
```

To validate and test the package from a local checkout:

```bash
claude plugin validate --strict .
claude plugin validate --strict .claude-plugin/marketplace.json
claude --plugin-dir .
```

The package is intended for Claude's Plugin Directory, the same discovery surface used by plugins such as Postiz. It adds the Vugola workflow skill and Vugola's authenticated tools in Cowork and Claude Code.

Use `assets/logo.png` for the Claude listing icon. It is the approved 512×512 transparent **Vugola Product Mark** with the blue agent character. Do not substitute the compressed export, social portrait, wordmark, or character-world banner.

---

## Install (Cursor and Grok Bot)

1. Install this plugin from the Cursor Marketplace, or add the repo in a team marketplace.
2. Click **Add** / **Connect**.
3. Sign in at Vugola and click **Allow**.
4. In Grok Bot, type `@` and attach Vugola. Then ask it to clip a video.

Manual remote URL if you are not using the plugin yet:

```json
{
  "mcpServers": {
    "vugola": {
      "url": "https://www.vugolaai.com/api/mcp"
    }
  }
}
```

---

## What you can do

These tools run on the signed-in user's workspace. They are not an admin view.

| Tool | What it does |
| --- | --- |
| `clip_video` | Turn a long public video into short clips |
| `caption_video` | Burn captions on a video up to 20 minutes |
| `get_clip_status` | Check a job |
| `download_clip` | Fresh download links for finished clips |
| `get_usage` | Credits and plan |
| `schedule_post` | Schedule a post |
| `list_scheduled_posts` | See the calendar |
| `cancel_scheduled_post` | Cancel a scheduled post |
| `list_automation_destinations` | List connected accounts available to Automations |
| `resolve_automation_channel` | Resolve a YouTube channel before setup |
| `create_automation` | Watch a channel, clip new uploads, and schedule the clips |
| `list_automations` / `get_automation` | Review Automations and recent runs |
| `update_automation` | Change destinations, output, captions, or posting times |
| `pause_automation` / `resume_automation` | Control channel monitoring |
| `delete_automation` | Permanently delete an Automation and cancel pending posts |

**Sizes:** `9:16`, `16:9`, `1:1`

**Caption styles:** `none` (clip only), `highlighted`, `scale`, `minimalist`, `box`, `staticbox`, `glow`, `hormozi`

**Schedule live now:** TikTok, YouTube, X, LinkedIn, Bluesky. Instagram, Facebook, and Threads are temporarily unavailable.

---

## Local npm server (optional)

For Claude Desktop / Claude Code on your machine, you can still run the stdio server with an API key from [your dashboard](https://www.vugolaai.com/dashboard/api-key):

```bash
npx vugola-mcp@1.3.1 install
```

```bash
claude mcp add vugola -- npx -y vugola-mcp@1.3.1
export VUGOLA_API_KEY=vug_sk_your_key_here
```

Always pin the version. Never install `latest`.

Grok Bot cannot run this local server. Use the hosted URL above.

---

## Security

- Hosted connector: OAuth only. Do not put a `vug_sk_` key in the plugin repo.
- Local server: never commit `VUGOLA_API_KEY`. If a key leaks, regenerate it in the dashboard.
- Download links expire. Re-fetch status if a link dies.

---

## Links

- Product: https://www.vugolaai.com
- MCP guide: https://www.vugolaai.com/mcp
- Pricing: https://www.vugolaai.com/pricing
- Samples: https://www.vugolaai.com/samples

---

## License

MIT © 2026 Vugola LLC
