import { z } from "zod";
import type { Client } from "../../client.js";
import type { RateLimiter } from "../../rate-limit.js";
import { translateHttpError, translateNetworkError } from "../../errors.js";

const InputSchema = z.object({ id: z.string().uuid() }).strict();
const RATE_LIMIT_MSG = "You're calling Vugola too quickly. Wait a moment and try again.";

export function createRotateWebhookSecretTool(deps: { client: Client; rateLimiter: RateLimiter }) {
  return {
    name: "rotate_webhook_secret",
    description: "Rotate the signing secret for a webhook. Returns the new secret ONCE. Both old and new secrets remain valid for 24 hours — update your verifier within that window.",
    inputSchema: InputSchema,
    async handler(input: z.infer<typeof InputSchema>) {
      InputSchema.parse(input);
      if (!deps.rateLimiter.check("rotate_webhook_secret").allowed) {
        return { content: [{ type: "text" as const, text: RATE_LIMIT_MSG }] };
      }
      try {
        const res = await deps.client.request(`/webhooks/${input.id}`, {
          method: "PATCH",
          body: { rotate_secret: true },
          timeoutMs: 15_000,
          retryIdempotent: false,
        });
        if (!res.ok) {
          return { content: [{ type: "text" as const, text: translateHttpError(res.httpStatus, res.body) }] };
        }
        const body = res.body as Record<string, unknown>;
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              id: body.id,
              new_secret: String(body.new_secret),
              rotation_expires_at: body.rotation_expires_at,
              message: "New secret generated. OLD SECRET REMAINS VALID FOR 24H. Update your verifier to accept both during the rotation window.",
            }),
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: translateNetworkError(err) }] };
      }
    },
  };
}
