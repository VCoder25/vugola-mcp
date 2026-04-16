import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUploadVideoTool } from "../../src/tools/upload-video.js";
import { createRateLimiter } from "../../src/rate-limit.js";
import type { Client } from "../../src/client.js";

function fakeClient(
  calls: Array<{ path?: string | RegExp; ok: boolean; httpStatus: number; body: unknown }>
): Client & { callCount: () => number; paths: () => string[] } {
  const paths: string[] = [];
  let i = 0;
  return {
    request: async (path: string, _opts) => {
      paths.push(path);
      const call = calls[i++];
      if (!call) {
        throw new Error(`Unexpected call #${i} to ${path}`);
      }
      if (call.path && typeof call.path === "string" && call.path !== path) {
        throw new Error(`Expected ${call.path}, got ${path}`);
      }
      return { ok: call.ok, httpStatus: call.httpStatus, body: call.body } as never;
    },
    callCount: () => i,
    paths: () => paths,
  } as Client & { callCount: () => number; paths: () => string[] };
}

// Valid 16-byte mp4 header: size(4) + 'ftyp' + brand(4) + minor(4)
// The magic-byte check only inspects bytes 4-8 for 'ftyp'.
function mp4Header(): Buffer {
  const buf = Buffer.alloc(16);
  buf.writeUInt32BE(16, 0); // box size
  buf.write("ftyp", 4, "ascii");
  buf.write("isom", 8, "ascii");
  buf.writeUInt32BE(512, 12); // minor version
  return buf;
}

describe("upload_video", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "upload-video-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects missing file", async () => {
    const client = fakeClient([]);
    const tool = createUploadVideoTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      file_path: join(dir, "does-not-exist.mp4"),
    });
    expect(res.content[0].text).toMatch(/not found|does not exist/i);
    expect(client.callCount()).toBe(0);
  });

  it("rejects unsupported extension", async () => {
    const p = join(dir, "notes.txt");
    writeFileSync(p, "hello");
    const client = fakeClient([]);
    const tool = createUploadVideoTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({ file_path: p });
    expect(res.content[0].text).toMatch(/extension|Use \.mp4/i);
    expect(client.callCount()).toBe(0);
  });

  it("rejects magic-byte mismatch", async () => {
    const p = join(dir, "fake.mp4");
    writeFileSync(p, Buffer.alloc(64)); // all zeros, no ftyp
    const client = fakeClient([]);
    const tool = createUploadVideoTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({ file_path: p });
    expect(res.content[0].text).toMatch(/video|magic|container/i);
    expect(client.callCount()).toBe(0);
  });

  it("rejects empty file", async () => {
    const p = join(dir, "empty.mp4");
    writeFileSync(p, Buffer.alloc(0));
    const client = fakeClient([]);
    const tool = createUploadVideoTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({ file_path: p });
    expect(res.content[0].text).toMatch(/empty/i);
    expect(client.callCount()).toBe(0);
  });

  it("rate limit triggers canned message", async () => {
    const p = join(dir, "ok.mp4");
    writeFileSync(p, mp4Header());
    const client = fakeClient([]);
    const tool = createUploadVideoTool({
      client,
      rateLimiter: {
        check: () => ({ allowed: false, retryAfterMs: 10_000 }),
      },
    });
    const res = await tool.handler({ file_path: p });
    expect(res.content[0].text).toMatch(/calling Vugola too quickly/i);
    expect(client.callCount()).toBe(0);
  });

  it("small file happy path uploads and returns project_id", async () => {
    const p = join(dir, "tiny.mp4");
    const fileBuf = mp4Header();
    writeFileSync(p, fileBuf);

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (k: string) => (k.toLowerCase() === "etag" ? '"fake-1"' : null),
      },
    }) as unknown as typeof fetch;

    try {
      const client = fakeClient([
        {
          path: "/upload/initiate",
          ok: true,
          httpStatus: 200,
          body: {
            upload_id: "u1",
            project_id: "p1",
            part_size: 32 * 1024 * 1024,
            total_parts: 1,
            part_urls: [{ part_number: 1, url: "https://r2.example/part1" }],
            next_batch_start_part: null,
          },
        },
        {
          path: "/upload/complete",
          ok: true,
          httpStatus: 200,
          body: {
            project_id: "p1",
            size_bytes: fileBuf.length,
            expires_at: "2026-04-17T00:00:00Z",
          },
        },
      ]);
      const tool = createUploadVideoTool({
        client,
        rateLimiter: createRateLimiter({}),
      });
      const res = await tool.handler({ file_path: p });
      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.project_id).toBe("p1");
      expect(parsed.total_parts).toBe(1);
      expect(parsed.expires_at).toBe("2026-04-17T00:00:00Z");
      expect(client.paths()).toEqual(["/upload/initiate", "/upload/complete"]);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("aborts upload when initiate succeeds but part PUT fails", async () => {
    const p = join(dir, "bad.mp4");
    writeFileSync(p, mp4Header());

    const originalFetch = global.fetch;
    // Always fail the PUT so all 3 retry attempts fail
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => null },
    }) as unknown as typeof fetch;

    try {
      const client = fakeClient([
        {
          path: "/upload/initiate",
          ok: true,
          httpStatus: 200,
          body: {
            upload_id: "u1",
            project_id: "p1",
            part_size: 32 * 1024 * 1024,
            total_parts: 1,
            part_urls: [{ part_number: 1, url: "https://r2.example/part1" }],
            next_batch_start_part: null,
          },
        },
        {
          path: "/upload/abort",
          ok: true,
          httpStatus: 200,
          body: {},
        },
      ]);
      const tool = createUploadVideoTool({
        client,
        rateLimiter: createRateLimiter({}),
      });
      const res = await tool.handler({ file_path: p });
      expect(res.content[0].text).toMatch(/upload failed/i);
      expect(client.paths()).toEqual(["/upload/initiate", "/upload/abort"]);
    } finally {
      global.fetch = originalFetch;
    }
  }, 30_000);
});
