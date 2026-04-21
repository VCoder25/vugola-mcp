import { describe, it, expect } from "vitest";
import { createCreateWebhookTool } from "../../../src/tools/webhooks/create-webhook.js";
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

describe("create_webhook", () => {
  it("returns id, url, events, secret on 201", async () => {
    const client = fakeClient([
      {
        ok: true,
        httpStatus: 201,
        body: {
          id: "11111111-1111-1111-1111-111111111111",
          url: "https://api.my-app.com/hook",
          events: ["clip.complete"],
          secret: "whsec_abcdef0123456789",
          description: null,
          active: true,
          created_at: "2026-04-20T00:00:00Z",
          warning: "Show once",
        },
      },
    ]);
    const tool = createCreateWebhookTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      url: "https://api.my-app.com/hook",
      events: ["clip.complete"],
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(parsed.secret).toBe("whsec_abcdef0123456789");
    expect(parsed.message).toMatch(/SAVE THE SECRET NOW/);
  });

  it("returns 403 canned message when plan doesn't allow webhooks", async () => {
    const client = fakeClient([
      { ok: false, httpStatus: 403, body: { error: "subscription_required" } },
    ]);
    const tool = createCreateWebhookTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({ url: "https://api.my-app.com/hook" });
    expect(res.content[0].text).toMatch(/plan/i);
  });

  it("returns 409 endpoint cap message", async () => {
    const client = fakeClient([
      { ok: false, httpStatus: 409, body: { error: "endpoint_cap" } },
    ]);
    const tool = createCreateWebhookTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({ url: "https://api.my-app.com/hook" });
    expect(res.content[0].text).toMatch(/cancel|already|conflict|cap|processing/i);
  });

  it("enforces rate limit", async () => {
    const client = fakeClient([
      {
        ok: true,
        httpStatus: 201,
        body: {
          id: "11111111-1111-1111-1111-111111111111",
          url: "https://api.my-app.com/hook",
          events: ["clip.complete"],
          secret: "whsec_x",
          active: true,
          created_at: "2026-04-20T00:00:00Z",
        },
      },
    ]);
    const tool = createCreateWebhookTool({
      client,
      rateLimiter: createRateLimiter({
        create_webhook: { max: 1, windowMs: 60_000 },
      }),
    });
    await tool.handler({ url: "https://api.my-app.com/hook" });
    const blocked = await tool.handler({ url: "https://api.my-app.com/hook" });
    expect(blocked.content[0].text).toMatch(/calling Vugola too quickly/i);
  });
});
