import { z } from "zod";
import type { Client } from "../client.js";
import type { RateLimiter } from "../rate-limit.js";
import { sanitize } from "../sanitize.js";
import { translateHttpError, translateNetworkError } from "../errors.js";

export interface ToolDeps {
  client: Client;
  rateLimiter: RateLimiter;
}

const InputSchema = z
  .object({
    video_url: z.string().min(1).max(2048).optional(),
    project_id: z.string().uuid().optional(),
    aspect_ratio: z.enum(["9:16", "16:9", "1:1"]),
    caption_style: z.enum([
      "none",
      "highlighted",
      "scale",
      "minimalist",
      "box",
    ]),
  })
  .strict()
  .refine(
    (v) => (v.video_url ? !v.project_id : !!v.project_id),
    { message: "Provide exactly one of video_url or project_id." }
  );

const RATE_LIMIT_MSG =
  "You're calling Vugola too quickly. Wait a moment and try again.";

export function createClipVideoTool(deps: ToolDeps) {
  return {
    name: "clip_video",
    description:
      "Start a video-clipping job. Provide either video_url (YouTube link, direct MP4 URL) OR project_id (from a prior upload_video call). Ask the user for aspect_ratio and caption_style if they're not given. If the user says 'just pick,' default to aspect_ratio '9:16' and caption_style 'minimalist'. Videos must be 2–180 minutes long. Jobs take 10–30 minutes; Vugola will email the user when done, and the agent can check status via get_clip_status.",
    inputSchema: InputSchema,
    async handler(input: z.infer<typeof InputSchema>) {
      InputSchema.parse(input);
      const rl = deps.rateLimiter.check("clip_video");
      if (!rl.allowed) {
        return { content: [{ type: "text" as const, text: RATE_LIMIT_MSG }] };
      }
      try {
        const body: Record<string, unknown> = {
          aspect_ratio: input.aspect_ratio,
          caption_style: input.caption_style,
        };
        if (input.video_url) body.video_url = input.video_url;
        if (input.project_id) body.project_id = input.project_id;
        const res = await deps.client.request("/clip", {
          method: "POST",
          body,
          timeoutMs: 15_000,
          retryIdempotent: false, // explicit: POST /clip never retries
        });
        if (!res.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: translateHttpError(res.httpStatus, res.body),
              },
            ],
          };
        }
        const resBody = res.body as { job_id?: unknown };
        const jobId = sanitize(resBody.job_id, { maxLength: 64 });
        const payload = {
          job_id: jobId,
          status: "processing" as const,
          estimated_minutes: 20,
          notification: {
            channel: "email" as const,
            expected_within_minutes: 30,
          },
          message:
            "Job started. Vugola will email you when the clips are ready (usually 10-30 minutes). You can also ask me to check the status.",
          next_action_hint: `To check progress, call get_clip_status with job_id "${jobId}".`,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: translateNetworkError(err) }],
        };
      }
    },
  };
}
