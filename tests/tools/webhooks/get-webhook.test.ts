import { describe, it, expect } from "vitest";
import { createGetWebhookTool } from "../../../src/tools/webhooks/get-webhook.js";
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

describe("get_webhook", () => {
  it("returns webhook on 200", async () => {
    const client = fakeClient([
      {
        ok: true,
        httpStatus: 200,
        body: {
          id: "11111111-1111-1111-1111-111111111111",
          url: "https://api.my-app.com/hook",
          events: ["clip.complete"],
          active: true,
        },
      },
    ]);
    const tool = createGetWebhookTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      id: "11111111-1111-1111-1111-111111111111",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(parsed.url).toBe("https://api.my-app.com/hook");
  });

  it("returns 404 canned message when webhook missing", async () => {
    const client = fakeClient([
      { ok: false, httpStatus: 404, body: {} },
    ]);
    const tool = createGetWebhookTool({
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
    const tool = createGetWebhookTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    await expect(tool.handler({ id: "not-a-uuid" })).rejects.toThrow();
  });
});
