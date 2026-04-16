import { describe, it, expect } from "vitest";
import { createCaptionVideoTool } from "../../src/tools/caption-video.js";
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

describe("caption_video", () => {
  it("returns job_id and structured message on 202", async () => {
    const client = fakeClient([
      {
        ok: true,
        httpStatus: 202,
        body: { job_id: "abc", status: "processing", mode: "captions" },
      },
    ]);
    const tool = createCaptionVideoTool({
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
    expect(parsed.mode).toBe("captions");
    expect(parsed.estimated_minutes).toBeGreaterThan(0);
    expect(parsed.notification).toEqual({
      channel: "email",
      expected_within_minutes: 8,
    });
    expect(parsed.message).toMatch(/caption/i);
    expect(parsed.next_action_hint).toMatch(/get_clip_status/);
  });

  it("returns 402 canned message on out-of-credits", async () => {
    const client = fakeClient([
      { ok: false, httpStatus: 402, body: {} },
    ]);
    const tool = createCaptionVideoTool({
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

  it("does NOT retry on 5xx", async () => {
    const client = fakeClient([
      { ok: false, httpStatus: 502, body: {} },
      { ok: true, httpStatus: 202, body: { job_id: "should_not_reach" } },
    ]);
    const tool = createCaptionVideoTool({
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

  it("rejects invalid caption_style", async () => {
    const client = fakeClient([]);
    const tool = createCaptionVideoTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    await expect(
      tool.handler({
        video_url: "https://x.com",
        aspect_ratio: "9:16",
        // @ts-expect-error intentional bad value
        caption_style: "comic_sans",
      })
    ).rejects.toThrow();
  });

  it("rejects invalid aspect_ratio", async () => {
    const client = fakeClient([]);
    const tool = createCaptionVideoTool({
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

  it("accepts optional caption_color", async () => {
    const client = fakeClient([
      {
        ok: true,
        httpStatus: 202,
        body: { job_id: "abc", status: "processing", mode: "captions" },
      },
    ]);
    const tool = createCaptionVideoTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      video_url: "https://x.com/v",
      aspect_ratio: "9:16",
      caption_style: "highlighted",
      caption_color: "#FFE600",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.job_id).toBe("abc");
  });

  it("accepts project_id and passes it through", async () => {
    const client = fakeClient([
      {
        ok: true,
        httpStatus: 202,
        body: { job_id: "p1", status: "processing", mode: "captions" },
      },
    ]);
    const tool = createCaptionVideoTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      project_id: "123e4567-e89b-12d3-a456-426614174000",
      aspect_ratio: "9:16",
      caption_style: "minimalist",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.job_id).toBe("p1");
  });

  it("rejects when both video_url and project_id provided", async () => {
    const client = fakeClient([]);
    const tool = createCaptionVideoTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    await expect(
      tool.handler({
        video_url: "https://x.com/v",
        project_id: "123e4567-e89b-12d3-a456-426614174000",
        aspect_ratio: "9:16",
        caption_style: "minimalist",
      })
    ).rejects.toThrow();
  });

  it("rejects when neither video_url nor project_id provided", async () => {
    const client = fakeClient([]);
    const tool = createCaptionVideoTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    await expect(
      tool.handler({
        aspect_ratio: "9:16",
        caption_style: "minimalist",
      } as never)
    ).rejects.toThrow();
  });

  it("enforces rate limit", async () => {
    const client = fakeClient([
      { ok: true, httpStatus: 202, body: { job_id: "1" } },
    ]);
    const tool = createCaptionVideoTool({
      client,
      rateLimiter: createRateLimiter({
        caption_video: { max: 1, windowMs: 60_000 },
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
