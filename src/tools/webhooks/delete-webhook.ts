import { z } from "zod";
import type { Client } from "../../client.js";
import type { RateLimiter } from "../../rate-limit.js";
import { translateHttpError, translateNetworkError } from "../../errors.js";

const InputSchema = z.object({ id: z.string().uuid() }).strict();
const RATE_LIMIT_MSG = "You're calling Vugola too quickly. Wait a moment and try again.";

export function createDeleteWebhookTool(deps: { client: Client; rateLimiter: RateLimiter }) {
  return {
    name: "delete_webhook",
    description: "Delete a webhook endpoint. Cascades to its delivery log. Irreversible.",
    inputSchema: InputSchema,
    async handler(input: z.infer<typeof InputSchema>) {
      InputSchema.parse(input);
      if (!deps.rateLimiter.check("delete_webhook").allowed) {
        return { content: [{ type: "text" as const, text: RATE_LIMIT_MSG }] };
      }
      try {
        const res = await deps.client.request(`/webhooks/${input.id}`, {
          method: "DELETE",
          timeoutMs: 10_000,
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
