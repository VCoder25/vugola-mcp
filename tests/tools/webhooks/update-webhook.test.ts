import { describe, it, expect } from "vitest";
import { createUpdateWebhookTool } from "../../../src/tools/webhooks/update-webhook.js";
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

describe("update_webhook", () => {
  it("returns updated webhook on 200", async () => {
    const client = fakeClient([
      {
        ok: true,
        httpStatus: 200,
        body: {
          id: "11111111-1111-1111-1111-111111111111",
          url: "https://api.my-app.com/hook",
          events: ["clip.complete", "clip.failed"],
          active: false,
        },
      },
    ]);
    const tool = createUpdateWebhookTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      id: "11111111-1111-1111-1111-111111111111",
      active: false,
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.active).toBe(false);
    expect(parsed.id).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("returns 404 canned message when webhook missing", async () => {
    const client = fakeClient([
      { ok: false, httpStatus: 404, body: {} },
    ]);
    const tool = createUpdateWebhookTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      id: "11111111-1111-1111-1111-111111111111",
      url: "https://api.my-app.com/new",
    });
    expect(res.content[0].text).toMatch(/not found/i);
  });

  it("rejects when no fields provided to update", async () => {
    const client = fakeClient([]);
    const tool = createUpdateWebhookTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    await expect(
      tool.handler({ id: "11111111-1111-1111-1111-111111111111" })
    ).rejects.toThrow();
  });

  it("accepts description-only update", async () => {
    const client = fakeClient([
      {
        ok: true,
        httpStatus: 200,
        body: {
          id: "11111111-1111-1111-1111-111111111111",
          description: "new desc",
        },
      },
    ]);
    const tool = createUpdateWebhookTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      id: "11111111-1111-1111-1111-111111111111",
      description: "new desc",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.description).toBe("new desc");
  });
});
