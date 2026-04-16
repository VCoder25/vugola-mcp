import { z } from "zod";
import { promises as fs } from "node:fs";
import { basename, extname, resolve } from "node:path";
import type { Client } from "../client.js";
import type { RateLimiter } from "../rate-limit.js";
import { translateNetworkError } from "../errors.js";

const InputSchema = z.object({
  file_path: z.string().min(1).max(4096),
}).strict();

const ALLOWED_EXT = new Set([".mp4", ".mov", ".avi", ".mkv"]);
const MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
};
const MAX_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
const PART_URL_BATCH = 16;
const RATE_LIMIT_MSG = "You're calling Vugola too quickly. Wait a moment and try again.";

export interface ToolDeps {
  client: Client;
  rateLimiter: RateLimiter;
}

function textResponse(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function expandTilde(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    return p.replace(/^~/, home);
  }
  return p;
}

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / (1024 ** 3)).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / (1024 ** 2)).toFixed(1)} MB`;
  return `${n} bytes`;
}

// Magic-byte heuristic. UX only — server verifies real integrity.
function looksLikeVideoContainer(head: Buffer, ext: string): boolean {
  if (ext === ".mp4" || ext === ".mov") {
    if (head.length < 8) return false;
    return head.slice(4, 8).toString("ascii") === "ftyp";
  }
  if (ext === ".mkv") {
    if (head.length < 4) return false;
    return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
  }
  if (ext === ".avi") {
    if (head.length < 12) return false;
    return head.slice(0, 4).toString("ascii") === "RIFF" &&
           head.slice(8, 12).toString("ascii") === "AVI ";
  }
  return false;
}

async function uploadPartWithRetry(
  url: string,
  body: Buffer,
  contentType: string,
  maxAttempts: number,
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Slice the underlying ArrayBuffer — `BodyInit` accepts ArrayBuffer but not
      // Node's Buffer directly in our TS lib version.
      const ab = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
      const res = await fetch(url, {
        method: "PUT",
        body: ab,
        headers: {
          // R2 presigned URLs DO NOT sign Content-Type — we must send it explicitly
          // or R2 stores the object with application/octet-stream.
          "Content-Type": contentType,
        },
      });
      if (!res.ok) throw new Error(`Part upload failed with ${res.status}`);
      const etag = res.headers.get("etag");
      if (!etag) throw new Error("No ETag returned by R2");
      return etag; // preserve R2's ETag string verbatim (quotes and all)
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1))); // 1s, 2s, 4s
      }
    }
  }
  throw lastErr;
}

export function createUploadVideoTool(deps: ToolDeps) {
  return {
    name: "upload_video",
    description:
      "Upload a local video file to Vugola so it can be captioned or clipped. " +
      "File must be .mp4, .mov, .avi, or .mkv under 10 GB. Returns a project_id that " +
      "expires in 24 hours — pass to caption_video or clip_video in the same session. " +
      "Large files (>500 MB) take several minutes with no progress updates.",
    inputSchema: InputSchema,
    async handler(input: z.infer<typeof InputSchema>) {
      InputSchema.parse(input);

      // 1. Resolve, stat, validate extension + size
      const abs = resolve(expandTilde(input.file_path));
      let stat;
      try {
        stat = await fs.stat(abs);
      } catch {
        return textResponse(`File not found: ${abs}`);
      }
      if (!stat.isFile()) return textResponse(`Not a regular file: ${abs}`);
      if (stat.size > MAX_BYTES) {
        return textResponse(
          `File is ${formatBytes(stat.size)}. Maximum allowed is 10 GB.`,
        );
      }
      if (stat.size === 0) return textResponse("File is empty.");

      const ext = extname(abs).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        return textResponse(
          `Extension ${ext || "(none)"} not supported. Use .mp4, .mov, .avi, or .mkv.`,
        );
      }
      const mimeByExt = MIME_BY_EXT[ext]!;

      // 2. Magic-byte sanity check
      const fhCheck = await fs.open(abs, "r");
      const head = Buffer.alloc(16);
      await fhCheck.read(head, 0, 16, 0);
      await fhCheck.close();
      if (!looksLikeVideoContainer(head, ext)) {
        return textResponse(
          `File at ${abs} claims ${ext} but does not match ${ext} magic bytes. Is this really a video?`,
        );
      }

      // 3. Rate limit
      if (!deps.rateLimiter.check("upload_video").allowed) {
        return textResponse(RATE_LIMIT_MSG);
      }

      try {
        // 4. Initiate
        const initRes = await deps.client.request("/upload/initiate", {
          method: "POST",
          body: {
            filename: basename(abs),
            size_bytes: stat.size,
            content_type: mimeByExt,
          },
          timeoutMs: 30_000,
          retryIdempotent: false,
        });
        if (!initRes.ok) {
          const msg = (initRes.body as any)?.message || "";
          return textResponse(`Upload initiate failed (${initRes.httpStatus}). ${msg}`);
        }
        const init = initRes.body as {
          upload_id: string;
          project_id: string;
          part_size: number;
          total_parts: number;
          part_urls: Array<{ part_number: number; url: string }>;
          next_batch_start_part: number | null;
        };

        const urlMap = new Map<number, string>();
        for (const p of init.part_urls) urlMap.set(p.part_number, p.url);

        // 5. Fetch remaining batches if needed
        let cursor = init.next_batch_start_part;
        while (cursor !== null && cursor <= init.total_parts) {
          const count = Math.min(PART_URL_BATCH, init.total_parts - cursor + 1);
          const batchRes = await deps.client.request("/upload/parts", {
            method: "POST",
            body: {
              upload_id: init.upload_id,
              project_id: init.project_id,
              start_part: cursor,
              count,
            },
            timeoutMs: 15_000,
            retryIdempotent: false,
          });
          if (!batchRes.ok) {
            await deps.client.request("/upload/abort", {
              method: "POST",
              body: { upload_id: init.upload_id, project_id: init.project_id },
              timeoutMs: 10_000,
              retryIdempotent: false,
            }).catch(() => {});
            return textResponse(`Failed to fetch part URLs (${batchRes.httpStatus}).`);
          }
          const batch = batchRes.body as {
            part_urls: Array<{ part_number: number; url: string }>;
            next_batch_start_part: number | null;
          };
          for (const p of batch.part_urls) urlMap.set(p.part_number, p.url);
          cursor = batch.next_batch_start_part;
        }

        // 6. Upload each part sequentially with per-part retry
        const etags: Array<{ part_number: number; etag: string }> = [];
        const fhUpload = await fs.open(abs, "r");
        try {
          for (let n = 1; n <= init.total_parts; n++) {
            const start = (n - 1) * init.part_size;
            const end = Math.min(start + init.part_size, stat.size);
            const buf = Buffer.alloc(end - start);
            await fhUpload.read(buf, 0, end - start, start);
            const url = urlMap.get(n);
            if (!url) throw new Error(`Missing URL for part ${n}`);
            const etag = await uploadPartWithRetry(url, buf, mimeByExt, 3);
            etags.push({ part_number: n, etag });
          }
        } catch (err) {
          await fhUpload.close();
          await deps.client.request("/upload/abort", {
            method: "POST",
            body: { upload_id: init.upload_id, project_id: init.project_id },
            timeoutMs: 10_000,
            retryIdempotent: false,
          }).catch(() => {});
          return textResponse(`Upload failed: ${(err as Error).message}`);
        }
        await fhUpload.close();

        // 7. Complete
        const doneRes = await deps.client.request("/upload/complete", {
          method: "POST",
          body: {
            upload_id: init.upload_id,
            project_id: init.project_id,
            parts: etags,
          },
          timeoutMs: 30_000,
          retryIdempotent: false,
        });
        if (!doneRes.ok) {
          await deps.client.request("/upload/abort", {
            method: "POST",
            body: { upload_id: init.upload_id, project_id: init.project_id },
            timeoutMs: 10_000,
            retryIdempotent: false,
          }).catch(() => {});
          const msg = (doneRes.body as any)?.message || "";
          return textResponse(`Upload completion failed (${doneRes.httpStatus}). ${msg}`);
        }
        const done = doneRes.body as { project_id: string; size_bytes: number; expires_at: string };

        return textResponse(JSON.stringify({
          project_id: done.project_id,
          size_bytes: done.size_bytes,
          total_parts: init.total_parts,
          expires_at: done.expires_at,
          message: `Uploaded ${formatBytes(done.size_bytes)} in ${init.total_parts} parts. Pass project_id to caption_video or clip_video. Expires ${done.expires_at}.`,
        }));
      } catch (err) {
        return textResponse(translateNetworkError(err));
      }
    },
  };
}
