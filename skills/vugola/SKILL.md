---
name: vugola
description: Clip long videos, add captions, check credits, schedule posts, and manage channel automations with the user's Vugola account.
---

# Vugola

Use the Vugola MCP tools for the signed-in user's own account. This is the public product, not an admin console.

## Auth

The hosted connector uses OAuth. The user signs in at Vugola and clicks Allow. No API key.

Any paid plan works for clipping, captions, and scheduled posts, including the $1 3-day trial. Connecting is free. Clipping and captioning spend that user's credits.

Channel automations require a Creator or Agency workspace owner.

If a tool says they need a plan or trial, send them to https://www.vugolaai.com/dashboard/subscription.

If a tool says they are out of credits, send them to https://www.vugolaai.com/pricing.

## Tools

Clips and captions:

- `clip_video`: turn a public video URL into short clips. Default `aspect_ratio` to `9:16` and `caption_style` to `highlighted` when the user asks Vugola to choose.
- `caption_video`: burn captions onto a video up to 20 minutes long without clipping it.
- `get_clip_status`: check a clipping or caption job by `job_id`. Jobs often take 10 to 30 minutes.
- `download_clip`: get fresh download links for finished clips.
- `get_usage`: show the connected workspace's plan and remaining credits.

Scheduled posts:

- `schedule_post`: schedule one post. Live destinations are TikTok, YouTube, X, LinkedIn, and Bluesky. Instagram, Facebook, and Threads are temporarily unavailable.
- `list_scheduled_posts`: show scheduled posts.
- `cancel_scheduled_post`: cancel a post that is still scheduled.

Channel automations:

- `list_automation_destinations`: list connected social accounts that can receive automated clips.
- `resolve_automation_channel`: resolve a YouTube channel, handle, or video URL before setup.
- `create_automation`: watch a YouTube channel, clip new uploads, and schedule the clips.
- `list_automations`: list the workspace's channel automations.
- `get_automation`: inspect one automation, its recent source videos, and its runs.
- `update_automation`: change destinations, output settings, captions, posting times, or timezone.
- `pause_automation`: stop monitoring for new uploads without canceling posts already scheduled.
- `resume_automation`: resume monitoring a paused automation.
- `delete_automation`: permanently delete an automation and cancel its draft or scheduled posts.

## Caption styles

`none` (clip only), `highlighted`, `scale`, `minimalist`, `box`, `staticbox`, `glow`, `hormozi`.

Previews: https://www.vugolaai.com/samples

## Rules

- Act only on the signed-in user's Vugola workspace.
- Never ask for a `vug_sk_` key when the hosted connector is connected.
- Never invent job IDs. Use the id returned by `clip_video` or `caption_video`.
- Use only video sources the user owns or is authorized to process.
- If a tool error names a reason (credits, plan, bad URL, missing job), relay that reason. Do not hide it behind a generic failure.
- Do not claim Instagram, Facebook, or Threads posting works until the tool says otherwise.
- Before calling `schedule_post`, show the final preview and confirm the platform, final caption and title, selected authorized media, and exact date, time, and timezone with the user.
- Before creating or changing an automation, list the available destinations and resolve the channel. Confirm the exact channel, accounts, output settings, posting times, and timezone with the user.
- Confirm the exact scheduled post or automation immediately before canceling or deleting it.
