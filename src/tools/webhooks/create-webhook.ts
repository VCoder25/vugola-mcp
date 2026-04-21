import { z } from "zod";
import type { Client } from "../../client.js";
import type { RateLimiter } from "../../rate-limit.js";
import { sanitize } from "../../sanitize.js";
import { translateHttpError, translateNetworkError } from "../../errors.js";

export interface ToolDeps {
  client: Client;
  rateLimiter: RateLimiter;
}

const InputSchema = z.object({
  url: z.string().min(1).max(2048),
  events: z.array(z.enum(["*", "clip.complete", "clip.failed", "caption.complete", "caption.failed"])).optional(),
  description: z.string().max(500).optional(),
}).strict();

const RATE_LIMIT_MSG = "You're calling Vugola too quickly. Wait a moment and try again.";

export function createCreateWebhookTool(deps: ToolDeps) {
  return {
    name: "create_webhook",
    description:
      "Register a webhook endpoint to receive clip/caption completion events. " +
      "URL must be https:// and resolve to a public IP. Requires a paid plan. " +
      "The signing secret is returned ONCE — store it immediately. Rotate via rotate_webhook_secret.",
    inputSchema: InputSchema,
    async handler(input: z.infer<typeof InputSchema>) {
      InputSchema.parse(input);
      if (!deps.rateLimiter.check("create_webhook").allowed) {
        return { content: [{ type: "text" as const, text: RATE_LIMIT_MSG }] };
      }
      try {
        const res = await deps.client.request("/webhooks", {
          method: "POST",
          body: {
            url: input.url,
            events: input.events,
            description: input.description,
          },
          timeoutMs: 15_000,
          retryIdempotent: false,
        });
        if (!res.ok) {
          return { content: [{ type: "text" as const, text: translateHttpError(res.httpStatus, res.body) }] };
        }
        const body = res.body as Record<string, unknown>;
        const payload = {
          id: sanitize(body.id, { maxLength: 64 }),
          url: sanitize(body.url, { maxLength: 2048 }),
          events: body.events,
          secret: String(body.secret), // NOT sanitized — customer needs exact bytes
          description: body.description ?? null,
          active: body.active,
          created_at: body.created_at,
          warning: body.warning,
          message: "Webhook created. SAVE THE SECRET NOW — it cannot be retrieved later.",
        };
        return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: translateNetworkError(err) }] };
      }
    },
  };
}
