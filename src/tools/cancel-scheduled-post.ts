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
    post_id: z.string().min(1).max(64),
  })
  .strict();

const RATE_LIMIT_MSG =
  "You're calling Vugola too quickly. Wait a moment and try again.";

export function createCancelScheduledPostTool(deps: ToolDeps) {
  return {
    name: "cancel_scheduled_post",
    description:
      "Cancel a scheduled post before it goes live. Only works for posts with status 'scheduled' — posts that are already processing or posted can't be cancelled and will return an error. Get the post_id from list_scheduled_posts.",
    inputSchema: InputSchema,
    async handler(input: z.infer<typeof InputSchema>) {
      InputSchema.parse(input);
      const rl = deps.rateLimiter.check("cancel_scheduled_post");
      if (!rl.allowed) {
        return { content: [{ type: "text" as const, text: RATE_LIMIT_MSG }] };
      }
      try {
        const res = await deps.client.request(
          `/schedule/${encodeURIComponent(input.post_id)}`,
          {
            method: "DELETE",
            timeoutMs: 10_000,
            retryIdempotent: false,
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
          success?: boolean;
          id?: unknown;
          status?: unknown;
        };
        const payload = {
          success: body.success === true,
          id: sanitize(body.id, { maxLength: 64 }),
          status: sanitize(body.status, { maxLength: 32 }),
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
