import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDownloadClipTool } from "../../src/tools/download-clip.js";
import { createRateLimiter } from "../../src/rate-limit.js";

function fakeOkFetch(bytes: Uint8Array): typeof fetch {
  return async () =>
    new Response(new Blob([new Uint8Array(bytes)]), {
      status: 200,
      headers: { "content-type": "video/mp4" },
    });
}

describe("download_clip", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "vugola-download-"));
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("saves clip bytes to disk and returns the local path + size", async () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
    const tool = createDownloadClipTool({
      apiKey: "vug_sk_test",
      rateLimiter: createRateLimiter({}),
      baseUrl: "https://www.vugolaai.com/api/v1",
      downloadDir: tmpDir,
      fetch: fakeOkFetch(bytes),
    });
    const res = await tool.handler({ job_id: "abc123", clip_index: 1 });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.bytes).toBe(5);
    expect(parsed.saved_to).toContain(tmpDir);
    expect(parsed.saved_to.endsWith(".mp4")).toBe(true);
    expect(existsSync(parsed.saved_to)).toBe(true);
    const onDisk = readFileSync(parsed.saved_to);
    expect(Array.from(onDisk)).toEqual([0x00, 0x01, 0x02, 0x03, 0x04]);
  });

  it("builds the correct URL with job_id + clip_index", async () => {
    let capturedUrl = "";
    const tool = createDownloadClipTool({
      apiKey: "vug_sk_test",
      rateLimiter: createRateLimiter({}),
      baseUrl: "https://www.vugolaai.com/api/v1",
      downloadDir: tmpDir,
      fetch: async (url) => {
        capturedUrl = typeof url === "string" ? url : url.toString();
        return new Response(new Blob([new Uint8Array([0x00])]), { status: 200 });
      },
    });
    await tool.handler({ job_id: "abc123", clip_index: 3 });
    expect(capturedUrl).toBe(
      "https://www.vugolaai.com/api/v1/clip/abc123/download/3"
    );
  });

  it("sends Bearer auth header", async () => {
    let authHeader = "";
    const tool = createDownloadClipTool({
      apiKey: "vug_sk_live_12345",
      rateLimiter: createRateLimiter({}),
      baseUrl: "https://www.vugolaai.com/api/v1",
      downloadDir: tmpDir,
      fetch: async (_url, init) => {
        authHeader = (init?.headers as Record<string, string>).Authorization;
        return new Response(new Blob([new Uint8Array([0x00])]), { status: 200 });
      },
    });
    await tool.handler({ job_id: "abc", clip_index: 1 });
    expect(authHeader).toBe("Bearer vug_sk_live_12345");
  });

  it("returns canned 404 message when clip doesn't exist", async () => {
    const tool = createDownloadClipTool({
      apiKey: "vug_sk_test",
      rateLimiter: createRateLimiter({}),
      baseUrl: "https://www.vugolaai.com/api/v1",
      downloadDir: tmpDir,
      fetch: async () => new Response("", { status: 404 }),
    });
    const res = await tool.handler({ job_id: "bad", clip_index: 99 });
    expect(res.content[0].text).toMatch(/not found/i);
  });

  it("rejects clips exceeding max size (Content-Length check)", async () => {
    const tool = createDownloadClipTool({
      apiKey: "vug_sk_test",
      rateLimiter: createRateLimiter({}),
      baseUrl: "https://www.vugolaai.com/api/v1",
      downloadDir: tmpDir,
      maxBytes: 100,
      fetch: async () =>
        new Response(new Blob([new Uint8Array([0x00])]), {
          status: 200,
          headers: { "content-length": "999999999" },
        }),
    });
    const res = await tool.handler({ job_id: "big", clip_index: 1 });
    expect(res.content[0].text).toMatch(/too large/i);
  });

  it("rejects clip_index that isn't a positive integer", async () => {
    const tool = createDownloadClipTool({
      apiKey: "vug_sk_test",
      rateLimiter: createRateLimiter({}),
      baseUrl: "https://www.vugolaai.com/api/v1",
      downloadDir: tmpDir,
      fetch: fakeOkFetch(new Uint8Array([0x00])),
    });
    await expect(
      tool.handler({ job_id: "abc", clip_index: 0 })
    ).rejects.toThrow();
    await expect(
      tool.handler({ job_id: "abc", clip_index: -1 })
    ).rejects.toThrow();
    await expect(
      tool.handler({ job_id: "abc", clip_index: 1.5 })
    ).rejects.toThrow();
  });

  it("enforces rate limit", async () => {
    const tool = createDownloadClipTool({
      apiKey: "vug_sk_test",
      rateLimiter: createRateLimiter({
        download_clip: { max: 1, windowMs: 60_000 },
      }),
      baseUrl: "https://www.vugolaai.com/api/v1",
      downloadDir: tmpDir,
      fetch: fakeOkFetch(new Uint8Array([0x00])),
    });
    await tool.handler({ job_id: "a", clip_index: 1 });
    const blocked = await tool.handler({ job_id: "b", clip_index: 1 });
    expect(blocked.content[0].text).toMatch(/calling Vugola too quickly/i);
  });

  it("does NOT save the file if the server returns non-2xx", async () => {
    const tool = createDownloadClipTool({
      apiKey: "vug_sk_test",
      rateLimiter: createRateLimiter({}),
      baseUrl: "https://www.vugolaai.com/api/v1",
      downloadDir: tmpDir,
      fetch: async () => new Response("", { status: 500 }),
    });
    await tool.handler({ job_id: "abc", clip_index: 1 });
    // Dir should be empty — no file created on error
    const { readdirSync } = await import("node:fs");
    expect(readdirSync(tmpDir).length).toBe(0);
  });
});
