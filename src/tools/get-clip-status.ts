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
    job_id: z.string().min(1).max(64),
  })
  .strict();

const RATE_LIMIT_MSG =
  "You're calling Vugola too quickly. Wait a moment and try again.";

const DOWNLOAD_NOTE =
  "Download URLs require the same Authorization: Bearer header as other calls. They're valid for approximately 1 hour after completion — save clips promptly.";

export function createGetClipStatusTool(deps: ToolDeps) {
  return {
    name: "get_clip_status",
    description:
      "Check whether a clipping job is done. Call this when the user asks about a job they've already started.",
    inputSchema: InputSchema,
    async handler(input: z.infer<typeof InputSchema>) {
      InputSchema.parse(input);
      const rl = deps.rateLimiter.check("get_clip_status");
      if (!rl.allowed) {
        return { content: [{ type: "text" as const, text: RATE_LIMIT_MSG }] };
      }
      try {
        const res = await deps.client.request(
          `/clip/${encodeURIComponent(input.job_id)}`,
          {
            method: "GET",
            timeoutMs: 10_000,
            retryIdempotent: true,
          }
        );
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
        const body = res.body as Record<string, unknown>;
        const status = body.status;

        if (status === "processing") {
          const out = {
            job_id: sanitize(body.job_id, { maxLength: 64 }),
            status: "processing" as const,
            progress_percent:
              typeof body.progress === "number" ? body.progress : 0,
            clips_ready:
              typeof body.clips_ready === "number" ? body.clips_ready : 0,
            clips_total:
              typeof body.clips_total === "number" ? body.clips_total : 0,
          };
          return {
            content: [{ type: "text" as const, text: JSON.stringify(out) }],
          };
        }

        if (status === "complete") {
          const rawClips = Array.isArray(body.clips) ? body.clips : [];
          const clips = rawClips.map((c) => {
            const clip = c as Record<string, unknown>;
            return {
              clip_id: sanitize(clip.clip_id, { maxLength: 64 }),
              title: sanitize(clip.title, { maxLength: 200 }),
              duration_seconds:
                typeof clip.duration === "number" ? clip.duration : 0,
              virality_score:
                typeof clip.virality_score === "number"
                  ? clip.virality_score
                  : 0,
              download_url: sanitize(clip.download_url, { maxLength: 2048 }),
            };
          });
          const out = {
            job_id: sanitize(body.job_id, { maxLength: 64 }),
            status: "complete" as const,
            credits_used:
              typeof body.credits_used === "number" ? body.credits_used : 0,
            clips,
            download_note: DOWNLOAD_NOTE,
          };
          return {
            content: [{ type: "text" as const, text: JSON.stringify(out) }],
          };
        }

        // failed or unexpected
        const out = {
          job_id: sanitize(body.job_id, { maxLength: 64 }),
          status: "failed" as const,
          error: sanitize(body.error, { maxLength: 500 }),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(out) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: translateNetworkError(err) }],
        };
      }
    },
  };
}
