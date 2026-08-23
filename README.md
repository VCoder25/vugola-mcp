# Vugola MCP

Official [Vugola](https://www.vugolaai.com) connector for Cursor, Grok Bot, Claude, ChatGPT, and any MCP client.

This repo is the public plugin Cursor Marketplace and Grok Bot install. It points at the **live hosted MCP** every Vugola customer can use:

`https://www.vugolaai.com/api/mcp`

Sign in with your Vugola account. No API key for Cursor / Grok Bot / Claude / ChatGPT.

Connecting is free. Clipping uses your Vugola credits. A $1 3-day trial is enough to start. Every paid plan includes MCP access.

Guide: [vugolaai.com/mcp](https://www.vugolaai.com/mcp)

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
| `caption_video` | Burn captions on a video up to 5 minutes |
| `get_clip_status` | Check a job |
| `download_clip` | Fresh download links for finished clips |
| `get_usage` | Credits and plan |
| `schedule_post` | Schedule a post |
| `list_scheduled_posts` | See the calendar |
| `cancel_scheduled_post` | Cancel a scheduled post |

**Sizes:** `9:16`, `16:9`, `1:1`

**Caption styles:** `none` (clip only), `highlighted`, `scale`, `minimalist`, `box`, `staticbox`, `glow`, `hormozi`

**Schedule live now:** TikTok, YouTube, X, LinkedIn, Bluesky. Instagram, Facebook, and Threads are temporarily unavailable.

---

## Local npm server (optional)

For Claude Desktop / Claude Code on your machine, you can still run the stdio server with an API key from [your dashboard](https://www.vugolaai.com/dashboard/api-key):

```bash
npx vugola-mcp@1.4.0 install
```

```bash
claude mcp add vugola -- npx -y vugola-mcp@1.4.0
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
