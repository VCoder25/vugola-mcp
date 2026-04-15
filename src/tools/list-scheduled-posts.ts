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
    status: z
      .enum(["scheduled", "processing", "posted", "failed"])
      .optional(),
    platform: z
      .enum([
        "x",
        "instagram",
        "tiktok",
        "youtube",
        "facebook",
        "linkedin",
        "threads",
        "bluesky",
      ])
      .optional(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .strict();

const RATE_LIMIT_MSG =
  "You're calling Vugola too quickly. Wait a moment and try again.";

function buildQueryString(input: z.infer<typeof InputSchema>): string {
  const params: string[] = [];
  if (input.status) params.push(`status=${input.status}`);
  if (input.platform) params.push(`platform=${input.platform}`);
  if (typeof input.limit === "number") params.push(`limit=${input.limit}`);
  if (typeof input.offset === "number") params.push(`offset=${input.offset}`);
  return params.length === 0 ? "" : `?${params.join("&")}`;
}

export function createListScheduledPostsTool(deps: ToolDeps) {
  return {
    name: "list_scheduled_posts",
    description:
      "List scheduled social posts. Optional filters: status ('scheduled' | 'processing' | 'posted' | 'failed'), platform, limit (default 20, max 100), offset. Use this when the user asks about their calendar, queue, or upcoming posts.",
    inputSchema: InputSchema,
    annotations: {
      title: "List scheduled posts",
      readOnlyHint: true,
      openWorldHint: true,
    },
    async handler(input: z.infer<typeof InputSchema>) {
      InputSchema.parse(input);
      const rl = deps.rateLimiter.check("list_scheduled_posts");
      if (!rl.allowed) {
        return { content: [{ type: "text" as const, text: RATE_LIMIT_MSG }] };
      }
      try {
        const res = await deps.client.request(
          `/schedule${buildQueryString(input)}`,
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
        const body = res.body as {
          posts?: Array<Record<string, unknown>>;
          total?: number;
          limit?: number;
          offset?: number;
        };
        const posts = Array.isArray(body.posts)
          ? body.posts.map((p) => {
              const post = p as Record<string, unknown>;
              return {
                id: sanitize(post.id, { maxLength: 64 }),
                platform: sanitize(post.platform, { maxLength: 32 }),
                caption: sanitize(post.caption, { maxLength: 2200 }),
                title: post.title === null ? null : sanitize(post.title, { maxLength: 200 }),
                status: sanitize(post.status, { maxLength: 32 }),
                scheduled_at: sanitize(post.scheduled_at, { maxLength: 64 }),
                posted_at:
                  post.posted_at === null
                    ? null
                    : sanitize(post.posted_at, { maxLength: 64 }),
                failure_reason:
                  post.failure_reason === null
                    ? null
                    : sanitize(post.failure_reason, { maxLength: 500 }),
              };
            })
          : [];
        const payload = {
          posts,
          total: typeof body.total === "number" ? body.total : posts.length,
          limit: typeof body.limit === "number" ? body.limit : 20,
          offset: typeof body.offset === "number" ? body.offset : 0,
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
