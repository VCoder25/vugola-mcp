import { z } from "zod";
import type { Client } from "../client.js";
import type { RateLimiter } from "../rate-limit.js";
import { sanitize } from "../sanitize.js";
import { translateHttpError, translateNetworkError } from "../errors.js";

export interface ToolDeps {
  client: Client;
  rateLimiter: RateLimiter;
}

const PlatformEnum = z.enum([
  "x",
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "linkedin",
  "threads",
  "bluesky",
]);

const PostSchema = z
  .object({
    platform: PlatformEnum,
    post_type: z.enum(["single", "carousel", "text"]),
    caption: z.string().max(2200),
    title: z.string().max(200).optional(),
    scheduled_at: z.string().min(1).max(64),
    media_url: z.string().max(2048).optional(),
    asset_id: z.string().max(64).optional(),
    carousel_items: z
      .array(
        z.object({
          media_url: z.string().max(2048).optional(),
          asset_id: z.string().max(64).optional(),
        })
      )
      .min(2)
      .max(10)
      .optional(),
    platform_settings: z.record(z.unknown()).optional(),
  })
  .strict()
  .refine(
    (p) => p.post_type !== "carousel" || p.platform === "instagram",
    { message: "carousel post_type is only supported on instagram" }
  )
  .refine(
    (p) =>
      p.post_type !== "carousel" ||
      (p.carousel_items && p.carousel_items.length >= 2),
    { message: "carousel requires 2-10 carousel_items" }
  );

const InputSchema = z
  .object({
    posts: z.array(PostSchema).min(1).max(25),
  })
  .strict();

const RATE_LIMIT_MSG =
  "You're calling Vugola too quickly. Wait a moment and try again.";

export function createSchedulePostTool(deps: ToolDeps) {
  return {
    name: "schedule_post",
    description:
      "Schedule clips or media to post on supported social platforms. Ask the user for platform, post_type, caption, and scheduled_at if missing. Instagram carousels need 2-10 items. YouTube, TikTok, and Instagram single posts require media.",
    inputSchema: InputSchema,
    async handler(input: z.infer<typeof InputSchema>) {
      InputSchema.parse(input);
      const rl = deps.rateLimiter.check("schedule_post");
      if (!rl.allowed) {
        return { content: [{ type: "text" as const, text: RATE_LIMIT_MSG }] };
      }
      try {
        const res = await deps.client.request("/schedule", {
          method: "POST",
          body: { posts: input.posts },
          timeoutMs: 15_000,
          retryIdempotent: false,
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
        const body = res.body as { posts?: Array<Record<string, unknown>> };
        const posts = Array.isArray(body.posts) ? body.posts : [];
        const scheduled: Array<{
          id: string;
          platform: string;
          scheduled_at: string;
        }> = [];
        const failed: Array<{ platform: string; error: string }> = [];
        for (const p of posts) {
          const status = p.status;
          const platform = sanitize(p.platform, { maxLength: 32 });
          if (status === "scheduled" || status === "processing") {
            scheduled.push({
              id: sanitize(p.id, { maxLength: 64 }),
              platform,
              scheduled_at: sanitize(p.scheduled_at, { maxLength: 64 }),
            });
          } else {
            failed.push({
              platform,
              error: sanitize(
                p.failure_reason ?? p.error ?? "unknown error",
                { maxLength: 500 }
              ),
            });
          }
        }
        const total = scheduled.length + failed.length;
        const overall_status =
          failed.length === 0
            ? "all_scheduled"
            : scheduled.length === 0
              ? "all_failed"
              : "partial_failure";
        const failedSummary =
          failed.length === 0
            ? ""
            : ` Failed: ${failed
                .map((f) => `${f.platform} (${f.error})`)
                .join(", ")}.`;
        const summary = `Scheduled ${scheduled.length} of ${total} posts.${failedSummary}`;
        const payload = {
          overall_status,
          summary,
          scheduled,
          failed,
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
