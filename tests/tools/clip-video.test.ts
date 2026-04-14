import { describe, it, expect } from "vitest";
import { createClipVideoTool } from "../../src/tools/clip-video.js";
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

describe("clip_video", () => {
  it("returns job_id and structured message on 202", async () => {
    const client = fakeClient([
      {
        ok: true,
        httpStatus: 202,
        body: { job_id: "abc", status: "processing" },
      },
    ]);
    const tool = createClipVideoTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      video_url: "https://www.youtube.com/watch?v=xyz",
      aspect_ratio: "9:16",
      caption_style: "minimalist",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.job_id).toBe("abc");
    expect(parsed.status).toBe("processing");
    expect(parsed.estimated_minutes).toBeGreaterThan(0);
    expect(parsed.notification).toEqual({
      channel: "email",
      expected_within_minutes: 30,
    });
    expect(parsed.message).toMatch(/email/i);
    expect(parsed.next_action_hint).toMatch(/get_clip_status/);
  });

  it("returns 402 canned message on out-of-credits", async () => {
    const client = fakeClient([
      { ok: false, httpStatus: 402, body: {} },
    ]);
    const tool = createClipVideoTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      video_url: "https://www.youtube.com/watch?v=xyz",
      aspect_ratio: "9:16",
      caption_style: "minimalist",
    });
    expect(res.content[0].text).toMatch(/out of credits/i);
  });

  it("does NOT retry on 5xx (no duplicate POST)", async () => {
    const client = fakeClient([
      { ok: false, httpStatus: 502, body: {} },
      { ok: true, httpStatus: 202, body: { job_id: "should_not_reach" } },
    ]);
    const tool = createClipVideoTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      video_url: "https://www.youtube.com/watch?v=xyz",
      aspect_ratio: "9:16",
      caption_style: "minimalist",
    });
    expect(client.callCount()).toBe(1);
    expect(res.content[0].text).toMatch(/temporary/i);
  });

  it("rejects invalid aspect_ratio", async () => {
    const client = fakeClient([]);
    const tool = createClipVideoTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    await expect(
      tool.handler({
        video_url: "https://x.com",
        // @ts-expect-error intentional bad value
        aspect_ratio: "4:3",
        caption_style: "minimalist",
      })
    ).rejects.toThrow();
  });

  it("rejects video_url over 2048 chars", async () => {
    const client = fakeClient([]);
    const tool = createClipVideoTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    await expect(
      tool.handler({
        video_url: "https://x.com/" + "a".repeat(3000),
        aspect_ratio: "9:16",
        caption_style: "minimalist",
      })
    ).rejects.toThrow();
  });

  it("enforces rate limit", async () => {
    const client = fakeClient([
      { ok: true, httpStatus: 202, body: { job_id: "1" } },
    ]);
    const tool = createClipVideoTool({
      client,
      rateLimiter: createRateLimiter({
        clip_video: { max: 1, windowMs: 60_000 },
      }),
    });
    await tool.handler({
      video_url: "https://x.com/a",
      aspect_ratio: "9:16",
      caption_style: "minimalist",
    });
    const blocked = await tool.handler({
      video_url: "https://x.com/b",
      aspect_ratio: "9:16",
      caption_style: "minimalist",
    });
    expect(blocked.content[0].text).toMatch(/calling Vugola too quickly/i);
  });
});
