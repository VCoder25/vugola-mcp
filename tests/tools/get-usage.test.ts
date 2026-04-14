import { describe, it, expect } from "vitest";
import { createGetUsageTool } from "../../src/tools/get-usage.js";
import { createRateLimiter } from "../../src/rate-limit.js";
import type { Client } from "../../src/client.js";

function fakeClient(res: { ok: boolean; httpStatus: number; body: unknown }): Client {
  return { request: async () => res };
}

describe("get_usage", () => {
  it("returns shaped payload on 200", async () => {
    const tool = createGetUsageTool({
      client: fakeClient({
        ok: true,
        httpStatus: 200,
        body: {
          credits_remaining: 120,
          credits_total: 500,
          credits_used_this_month: 380,
          plan: "creator",
        },
      }),
      rateLimiter: createRateLimiter({}),
    });
    const result = await tool.handler({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.credits_remaining).toBe(120);
    expect(parsed.credits_total).toBe(500);
    expect(parsed.credits_used_this_month).toBe(380);
    expect(parsed.plan).toBe("creator");
    expect(parsed.as_of).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("returns canned 401 message on bad key", async () => {
    const tool = createGetUsageTool({
      client: fakeClient({ ok: false, httpStatus: 401, body: {} }),
      rateLimiter: createRateLimiter({}),
    });
    const result = await tool.handler({});
    expect(result.content[0].text).toMatch(/API key was rejected/i);
  });

  it("returns rate-limit message when bucket is empty", async () => {
    const tool = createGetUsageTool({
      client: fakeClient({ ok: true, httpStatus: 200, body: {} }),
      rateLimiter: createRateLimiter({
        get_usage: { max: 1, windowMs: 60_000 },
      }),
    });
    await tool.handler({});
    const blocked = await tool.handler({});
    expect(blocked.content[0].text).toMatch(/calling Vugola too quickly/i);
  });
});
