import { z } from "zod";
import type { Client } from "../client.js";
import type { RateLimiter } from "../rate-limit.js";
import { translateHttpError, translateNetworkError } from "../errors.js";

export interface ToolDeps {
  client: Client;
  rateLimiter: RateLimiter;
}

const InputSchema = z.object({}).strict();

const RATE_LIMIT_MSG =
  "You're calling Vugola too quickly. Wait a moment and try again.";

export function createGetUsageTool(deps: ToolDeps) {
  return {
    name: "get_usage",
    description:
      "Return how many credits the user has, their plan, and how many they've used this month.",
    inputSchema: InputSchema,
    annotations: {
      title: "Check Vugola credits",
      readOnlyHint: true,
      openWorldHint: true,
    },
    async handler(_input: z.infer<typeof InputSchema>) {
      const rl = deps.rateLimiter.check("get_usage");
      if (!rl.allowed) {
        return { content: [{ type: "text" as const, text: RATE_LIMIT_MSG }] };
      }
      try {
        const res = await deps.client.request("/status", {
          method: "GET",
          timeoutMs: 8_000,
          retryIdempotent: true,
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
        const body = res.body as {
          credits_remaining?: number;
          credits_total?: number;
          credits_used_this_month?: number;
          plan?: string;
        };
        const payload = {
          credits_remaining: body.credits_remaining ?? 0,
          credits_total: body.credits_total ?? 0,
          credits_used_this_month: body.credits_used_this_month ?? 0,
          plan: body.plan ?? "unknown",
          as_of: new Date().toISOString(),
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
