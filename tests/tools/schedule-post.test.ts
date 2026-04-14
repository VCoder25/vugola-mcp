import { describe, it, expect } from "vitest";
import { createSchedulePostTool } from "../../src/tools/schedule-post.js";
import { createRateLimiter } from "../../src/rate-limit.js";
import type { Client } from "../../src/client.js";

function fakeClient(
  calls: Array<{ ok: boolean; httpStatus: number; body: unknown }>
): Client & { callCount: () => number } {
  let i = 0;
  return {
    request: async () => calls[i++]!,
    callCount: () => i,
  };
}

const validPost = {
  platform: "tiktok" as const,
  post_type: "single" as const,
  caption: "hi",
  scheduled_at: "2027-01-01T00:00:00Z",
  media_url: "https://cdn.example.com/a.mp4",
};

describe("schedule_post", () => {
  it("returns all_scheduled when every post succeeds", async () => {
    const client = fakeClient([
      {
        ok: true,
        httpStatus: 201,
        body: {
          posts: [
            {
              id: "p1",
              platform: "tiktok",
              status: "scheduled",
              scheduled_at: "2027-01-01T00:00:00Z",
            },
          ],
        },
      },
    ]);
    const tool = createSchedulePostTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({ posts: [validPost] });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.overall_status).toBe("all_scheduled");
    expect(parsed.summary).toMatch(/scheduled 1/i);
    expect(parsed.scheduled.length).toBe(1);
    expect(parsed.failed.length).toBe(0);
  });

  it("returns partial_failure when some posts fail", async () => {
    const client = fakeClient([
      {
        ok: true,
        httpStatus: 201,
        body: {
          posts: [
            {
              id: "p1",
              platform: "tiktok",
              status: "scheduled",
              scheduled_at: "2027-01-01T00:00:00Z",
            },
            {
              platform: "linkedin",
              status: "failed",
              failure_reason: "LinkedIn not connected",
            },
          ],
        },
      },
    ]);
    const tool = createSchedulePostTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      posts: [validPost, { ...validPost, platform: "linkedin" }],
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.overall_status).toBe("partial_failure");
    expect(parsed.summary).toMatch(/1 of 2/i);
    expect(parsed.summary).toMatch(/linkedin/i);
    expect(parsed.scheduled.length).toBe(1);
    expect(parsed.failed.length).toBe(1);
  });

  it("returns all_failed when every post fails", async () => {
    const client = fakeClient([
      {
        ok: true,
        httpStatus: 201,
        body: {
          posts: [
            {
              platform: "linkedin",
              status: "failed",
              failure_reason: "Not connected",
            },
          ],
        },
      },
    ]);
    const tool = createSchedulePostTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      posts: [{ ...validPost, platform: "linkedin" }],
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.overall_status).toBe("all_failed");
    expect(parsed.summary).toMatch(/0 of 1/i);
  });

  it("does NOT retry on 5xx", async () => {
    const client = fakeClient([
      { ok: false, httpStatus: 502, body: {} },
      { ok: true, httpStatus: 201, body: { posts: [] } },
    ]);
    const tool = createSchedulePostTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({ posts: [validPost] });
    expect(client.callCount()).toBe(1);
    expect(res.content[0].text).toMatch(/temporary/i);
  });

  it("rejects empty posts array", async () => {
    const client = fakeClient([]);
    const tool = createSchedulePostTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    await expect(tool.handler({ posts: [] })).rejects.toThrow();
  });

  it("rejects more than 25 posts", async () => {
    const client = fakeClient([]);
    const tool = createSchedulePostTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const many = Array.from({ length: 26 }, () => validPost);
    await expect(tool.handler({ posts: many })).rejects.toThrow();
  });

  it("rejects carousel on non-instagram", async () => {
    const client = fakeClient([]);
    const tool = createSchedulePostTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    await expect(
      tool.handler({
        posts: [
          {
            ...validPost,
            platform: "tiktok",
            post_type: "carousel",
            carousel_items: [
              { media_url: "a" },
              { media_url: "b" },
            ],
          },
        ],
      })
    ).rejects.toThrow();
  });

  it("rejects caption over 2200 chars", async () => {
    const client = fakeClient([]);
    const tool = createSchedulePostTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    await expect(
      tool.handler({
        posts: [{ ...validPost, caption: "x".repeat(2201) }],
      })
    ).rejects.toThrow();
  });
});
