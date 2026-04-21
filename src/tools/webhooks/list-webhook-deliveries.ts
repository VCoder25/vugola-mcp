import { z } from "zod";
import type { Client } from "../../client.js";
import type { RateLimiter } from "../../rate-limit.js";
import { translateHttpError, translateNetworkError } from "../../errors.js";

const InputSchema = z.object({
  webhook_id: z.string().uuid(),
  limit: z.number().int().min(1).max(100).optional(),
  status: z.enum(["pending", "delivering", "delivered", "failed"]).optional(),
  cursor: z.string().optional(),
}).strict();
const RATE_LIMIT_MSG = "You're calling Vugola too quickly. Wait a moment and try again.";

export function createListWebhookDeliveriesTool(deps: { client: Client; rateLimiter: RateLimiter }) {
  return {
    name: "list_webhook_deliveries",
    description: "Paginated list of webhook deliveries for debugging. Filter by status to find failed attempts.",
    inputSchema: InputSchema,
    async handler(input: z.infer<typeof InputSchema>) {
      InputSchema.parse(input);
      if (!deps.rateLimiter.check("list_webhook_deliveries").allowed) {
        return { content: [{ type: "text" as const, text: RATE_LIMIT_MSG }] };
      }
      try {
        const qs = new URLSearchParams();
        if (input.limit !== undefined) qs.set("limit", String(input.limit));
        if (input.status !== undefined) qs.set("status", input.status);
        if (input.cursor !== undefined) qs.set("cursor", input.cursor);
        const path = `/webhooks/${input.webhook_id}/deliveries${qs.toString() ? `?${qs.toString()}` : ""}`;
        const res = await deps.client.request(path, {
          method: "GET",
          timeoutMs: 10_000,
          retryIdempotent: true,
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
