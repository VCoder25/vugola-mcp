import { describe, it, expect } from "vitest";
import { createListWebhookDeliveriesTool } from "../../../src/tools/webhooks/list-webhook-deliveries.js";
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

describe("list_webhook_deliveries", () => {
  it("returns paginated delivery list on 200", async () => {
    const client = fakeClient([
      {
        ok: true,
        httpStatus: 200,
        body: {
          deliveries: [
            {
              id: "deliv_1",
              status: "delivered",
              event: "clip.complete",
              attempts: 1,
            },
          ],
          next_cursor: "cursor_xyz",
        },
      },
    ]);
    const tool = createListWebhookDeliveriesTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      webhook_id: "11111111-1111-1111-1111-111111111111",
      limit: 25,
      status: "delivered",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.deliveries).toHaveLength(1);
    expect(parsed.deliveries[0].id).toBe("deliv_1");
    expect(parsed.next_cursor).toBe("cursor_xyz");
  });

  it("returns 404 canned message when webhook missing", async () => {
    const client = fakeClient([
      { ok: false, httpStatus: 404, body: {} },
    ]);
    const tool = createListWebhookDeliveriesTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      webhook_id: "11111111-1111-1111-1111-111111111111",
    });
    expect(res.content[0].text).toMatch(/not found/i);
  });

  it("rejects invalid status filter", async () => {
    const client = fakeClient([]);
    const tool = createListWebhookDeliveriesTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    await expect(
      tool.handler({
        webhook_id: "11111111-1111-1111-1111-111111111111",
        // @ts-expect-error intentional bad value
        status: "expired",
      })
    ).rejects.toThrow();
  });

  it("accepts cursor pagination", async () => {
    const client = fakeClient([
      {
        ok: true,
        httpStatus: 200,
        body: { deliveries: [], next_cursor: null },
      },
    ]);
    const tool = createListWebhookDeliveriesTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      webhook_id: "11111111-1111-1111-1111-111111111111",
      cursor: "cursor_prev",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.deliveries).toEqual([]);
  });
});
