import { describe, it, expect } from "vitest";
import { createDeleteWebhookTool } from "../../../src/tools/webhooks/delete-webhook.js";
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

describe("delete_webhook", () => {
  it("returns body on 200 delete", async () => {
    const client = fakeClient([
      {
        ok: true,
        httpStatus: 200,
        body: { deleted: true, id: "11111111-1111-1111-1111-111111111111" },
      },
    ]);
    const tool = createDeleteWebhookTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      id: "11111111-1111-1111-1111-111111111111",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.deleted).toBe(true);
    expect(parsed.id).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("returns 404 canned message when webhook missing", async () => {
    const client = fakeClient([
      { ok: false, httpStatus: 404, body: {} },
    ]);
    const tool = createDeleteWebhookTool({
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
    const tool = createDeleteWebhookTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    await expect(tool.handler({ id: "xyz" })).rejects.toThrow();
  });
});
