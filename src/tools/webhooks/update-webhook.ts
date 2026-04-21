import { z } from "zod";
import type { Client } from "../../client.js";
import type { RateLimiter } from "../../rate-limit.js";
import { translateHttpError, translateNetworkError } from "../../errors.js";

const InputSchema = z.object({
  id: z.string().uuid(),
  url: z.string().min(1).max(2048).optional(),
  events: z.array(z.enum(["*", "clip.complete", "clip.failed", "caption.complete", "caption.failed"])).optional(),
  active: z.boolean().optional(),
  description: z.string().max(500).optional(),
}).strict().refine(
  v => v.url !== undefined || v.events !== undefined || v.active !== undefined || v.description !== undefined,
  { message: "At least one field must be provided to update." },
);
const RATE_LIMIT_MSG = "You're calling Vugola too quickly. Wait a moment and try again.";

export function createUpdateWebhookTool(deps: { client: Client; rateLimiter: RateLimiter }) {
  return {
    name: "update_webhook",
    description: "Update a webhook endpoint's url, events, active flag, or description. For secret rotation, use rotate_webhook_secret.",
    inputSchema: InputSchema,
    async handler(input: z.infer<typeof InputSchema>) {
      InputSchema.parse(input);
      if (!deps.rateLimiter.check("update_webhook").allowed) {
        return { content: [{ type: "text" as const, text: RATE_LIMIT_MSG }] };
      }
      try {
        const body: Record<string, unknown> = {};
        if (input.url !== undefined) body.url = input.url;
        if (input.events !== undefined) body.events = input.events;
        if (input.active !== undefined) body.active = input.active;
        if (input.description !== undefined) body.description = input.description;
        const res = await deps.client.request(`/webhooks/${input.id}`, {
          method: "PATCH",
          body,
          timeoutMs: 15_000,
          retryIdempotent: false,
        });
        if (!res.ok) {
          return { content: [{ type: "text" as const, text: translateHttpError(res.httpStatus, res.body) }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(res.body) }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: translateNetworkError(err) }] };
      }
    },
  };
}
