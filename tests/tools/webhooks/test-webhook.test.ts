import { describe, it, expect } from "vitest";
import { createTestWebhookTool } from "../../../src/tools/webhooks/test-webhook.js";
import { createRateLimiter } from "../../../src/rate-limit.js";
import type { Client } from "../../../src/client.js";

function fakeClient(
  calls: Array<{ ok: boolean; httpStatus: number; body: unknown }>
): Client & { callCount: () => number } {
  let i = 0;
  return {
    request: async () => calls[i++]!,
    callCount: () => i,
  };
}

describe("test_webhook", () => {
  it("returns delivery id on 202", async () => {
    const client = fakeClient([
      {
        ok: true,
        httpStatus: 202,
        body: {
          delivery_id: "deliv_abc123",
          event: "webhook.test",
          queued_at: "2026-04-20T00:00:00Z",
        },
      },
    ]);
    const tool = createTestWebhookTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      id: "11111111-1111-1111-1111-111111111111",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.delivery_id).toBe("deliv_abc123");
    expect(parsed.event).toBe("webhook.test");
  });

  it("returns 404 canned message when webhook missing", async () => {
    const client = fakeClient([
      { ok: false, httpStatus: 404, body: {} },
    ]);
    const tool = createTestWebhookTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      id: "11111111-1111-1111-1111-111111111111",
    });
    expect(res.content[0].text).toMatch(/not found/i);
  });

  it("rejects non-uuid id", async () => {
    const client = fakeClient([]);
    const tool = createTestWebhookTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    await expect(tool.handler({ id: "nope" })).rejects.toThrow();
  });
});
