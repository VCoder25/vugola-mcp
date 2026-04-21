import { describe, it, expect } from "vitest";
import { createListWebhooksTool } from "../../../src/tools/webhooks/list-webhooks.js";
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

describe("list_webhooks", () => {
  it("returns list body on 200", async () => {
    const client = fakeClient([
      {
        ok: true,
        httpStatus: 200,
        body: {
          webhooks: [
            {
              id: "11111111-1111-1111-1111-111111111111",
              url: "https://api.my-app.com/hook",
              events: ["clip.complete"],
              active: true,
            },
          ],
        },
      },
    ]);
    const tool = createListWebhooksTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.webhooks).toHaveLength(1);
    expect(parsed.webhooks[0].id).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("returns 401 canned message when key is bad", async () => {
    const client = fakeClient([
      { ok: false, httpStatus: 401, body: {} },
    ]);
    const tool = createListWebhooksTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler();
    expect(res.content[0].text).toMatch(/api key/i);
  });
});
