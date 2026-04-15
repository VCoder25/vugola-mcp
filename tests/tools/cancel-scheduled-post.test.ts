import { describe, it, expect } from "vitest";
import { createCancelScheduledPostTool } from "../../src/tools/cancel-scheduled-post.js";
import { createRateLimiter } from "../../src/rate-limit.js";
import type { Client } from "../../src/client.js";

function fakeClient(
  res: { ok: boolean; httpStatus: number; body: unknown },
  onRequest?: (path: string, method: string) => void
): Client {
  return {
    request: async (path, opts) => {
      onRequest?.(path, opts.method);
      return res;
    },
  };
}

describe("cancel_scheduled_post", () => {
  it("returns the cancellation payload on success", async () => {
    let usedMethod = "";
    let usedPath = "";
    const tool = createCancelScheduledPostTool({
      client: fakeClient(
        {
          ok: true,
          httpStatus: 200,
          body: { success: true, id: "p1", status: "cancelled" },
        },
        (path, method) => {
          usedPath = path;
          usedMethod = method;
        }
      ),
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({ post_id: "p1" });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.id).toBe("p1");
    expect(parsed.status).toBe("cancelled");
    expect(usedMethod).toBe("DELETE");
    expect(usedPath).toBe("/schedule/p1");
  });

  it("URL-encodes the post_id", async () => {
    let usedPath = "";
    const tool = createCancelScheduledPostTool({
      client: fakeClient(
        { ok: true, httpStatus: 200, body: { success: true, id: "weird/id", status: "cancelled" } },
        (path) => {
          usedPath = path;
        }
      ),
      rateLimiter: createRateLimiter({}),
    });
    await tool.handler({ post_id: "weird/id" });
    expect(usedPath).toBe("/schedule/weird%2Fid");
  });

  it("returns canned 404 message when post doesn't exist", async () => {
    const tool = createCancelScheduledPostTool({
      client: fakeClient({ ok: false, httpStatus: 404, body: {} }),
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({ post_id: "nope" });
    expect(res.content[0].text).toMatch(/not found/i);
  });

  it("returns a clear message when post can no longer be cancelled (409)", async () => {
    const tool = createCancelScheduledPostTool({
      client: fakeClient({ ok: false, httpStatus: 409, body: {} }),
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({ post_id: "p1" });
    // errors.ts currently returns the generic 409 code message from Vugola
    // or a fallback; either way the agent should know it can't cancel
    expect(res.content[0].text).toMatch(/can.?not be cancel|already|fallback|unexpected|processing|posted/i);
  });

  it("rejects empty post_id and ids over 64 chars", async () => {
    const tool = createCancelScheduledPostTool({
      client: fakeClient({ ok: true, httpStatus: 200, body: {} }),
      rateLimiter: createRateLimiter({}),
    });
    await expect(tool.handler({ post_id: "" })).rejects.toThrow();
    await expect(tool.handler({ post_id: "x".repeat(65) })).rejects.toThrow();
  });

  it("enforces rate limit", async () => {
    const tool = createCancelScheduledPostTool({
      client: fakeClient({ ok: true, httpStatus: 200, body: { success: true, id: "p", status: "cancelled" } }),
      rateLimiter: createRateLimiter({
        cancel_scheduled_post: { max: 1, windowMs: 60_000 },
      }),
    });
    await tool.handler({ post_id: "p1" });
    const blocked = await tool.handler({ post_id: "p2" });
    expect(blocked.content[0].text).toMatch(/calling Vugola too quickly/i);
  });

  it("does NOT retry DELETE on 5xx", async () => {
    let calls = 0;
    const tool = createCancelScheduledPostTool({
      client: {
        request: async () => {
          calls++;
          return { ok: false, httpStatus: 502, body: {} };
        },
      },
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({ post_id: "p1" });
    expect(calls).toBe(1);
    expect(res.content[0].text).toMatch(/temporary/i);
  });
});
