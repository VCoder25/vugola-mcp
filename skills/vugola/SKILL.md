---
name: vugola
description: Clip long videos, add captions, check credits, and schedule posts with the user's Vugola account.
---

# Vugola

Use the Vugola MCP tools for the signed-in user's own account. This is the public product, not an admin console.

## Auth

The hosted connector uses OAuth. The user signs in at Vugola and clicks Allow. No API key.

Any paid plan works, including the $1 3-day trial. Connecting is free. Clipping and captioning spend that user's credits.

If a tool says they need a plan or trial, send them to https://www.vugolaai.com/dashboard/subscription.

If a tool says they are out of credits, send them to https://www.vugolaai.com/pricing.

## Tools

- `clip_video` — turn a public video URL (YouTube, TikTok, etc.) into short clips. Default `aspect_ratio` to `9:16` and `caption_style` to `highlighted` if they say "just pick."
- `caption_video` — burn captions on a short video (5 minutes or less). No clipping.
- `get_clip_status` — poll a job by `job_id`. Jobs often take 10–30 minutes. Tell the user Vugola also emails them when it is done.
- `download_clip` — get fresh download links for finished clips.
- `get_usage` — remaining credits and plan.
- `schedule_post` — schedule one post. Live destinations: TikTok, YouTube, X, LinkedIn, Bluesky. Instagram, Facebook, and Threads are temporarily unavailable.
- `list_scheduled_posts` — show the calendar.
- `cancel_scheduled_post` — cancel a post that is still `scheduled`.

## Caption styles

`none` (clip only), `highlighted`, `scale`, `minimalist`, `box`, `staticbox`, `glow`, `hormozi`.

Previews: https://www.vugolaai.com/samples

## Rules

- Act only on the signed-in user's Vugola workspace.
- Never ask for a `vug_sk_` key when the hosted connector is connected.
- Never invent job IDs. Use the id returned by `clip_video` or `caption_video`.
- If a tool error names a reason (credits, plan, bad URL, missing job), relay that reason. Do not hide it behind a generic failure.
- Do not claim Instagram, Facebook, or Threads posting works until the tool says otherwise.
