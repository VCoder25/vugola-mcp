import { z } from "zod";
import type { Client } from "../../client.js";
import type { RateLimiter } from "../../rate-limit.js";
import { translateHttpError, translateNetworkError } from "../../errors.js";

const InputSchema = z.object({}).strict();
const RATE_LIMIT_MSG = "You're calling Vugola too quickly. Wait a moment and try again.";

export function createListWebhooksTool(deps: { client: Client; rateLimiter: RateLimiter }) {
  return {
    name: "list_webhooks",
    description: "List all webhook endpoints for this account. Secrets are never returned — use rotate_webhook_secret to generate a new one.",
    inputSchema: InputSchema,
    async handler() {
      if (!deps.rateLimiter.check("list_webhooks").allowed) {
        return { content: [{ type: "text" as const, text: RATE_LIMIT_MSG }] };
      }
      try {
        const res = await deps.client.request("/webhooks", {
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
