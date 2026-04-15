import { z } from "zod";
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RateLimiter } from "../rate-limit.js";
import { translateHttpError, translateNetworkError } from "../errors.js";

export interface ToolDeps {
  apiKey: string;
  rateLimiter: RateLimiter;
  baseUrl: string;
  downloadDir?: string;
  maxBytes?: number;
  fetch?: typeof fetch;
}

const DEFAULT_MAX_BYTES = 500 * 1024 * 1024; // 500 MB
const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes for large clips

const InputSchema = z
  .object({
    job_id: z.string().min(1).max(64),
    clip_index: z.number().int().positive(),
  })
  .strict();

const RATE_LIMIT_MSG =
  "You're calling Vugola too quickly. Wait a moment and try again.";

function safeSlug(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
}

export function createDownloadClipTool(deps: ToolDeps) {
  const fetchFn = deps.fetch ?? fetch;
  const dir = deps.downloadDir ?? join(homedir(), "Downloads");
  const maxBytes = deps.maxBytes ?? DEFAULT_MAX_BYTES;

  return {
    name: "download_clip",
    description:
      "Download a rendered clip to the user's local Downloads folder (or a configured directory). Returns the saved file path and size in bytes. Use this after get_clip_status reports a job is complete, with the clip_index (1-based) matching the clip the user wants. Don't call this for jobs that are still processing.",
    inputSchema: InputSchema,
    async handler(input: z.infer<typeof InputSchema>) {
      InputSchema.parse(input);
      const rl = deps.rateLimiter.check("download_clip");
      if (!rl.allowed) {
        return { content: [{ type: "text" as const, text: RATE_LIMIT_MSG }] };
      }
      if (!deps.apiKey) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Set VUGOLA_API_KEY in your MCP config. Get one at https://www.vugolaai.com/dashboard/api-key",
            },
          ],
        };
      }

      const url = `${deps.baseUrl}/clip/${encodeURIComponent(
        input.job_id
      )}/download/${input.clip_index}`;
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        DEFAULT_TIMEOUT_MS
      );

      try {
        const res = await fetchFn(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${deps.apiKey}` },
          signal: controller.signal,
        });

        if (!res.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: translateHttpError(res.status, {}),
              },
            ],
          };
        }

        const lengthHeader = res.headers.get("content-length");
        if (lengthHeader !== null) {
          const advertised = Number(lengthHeader);
          if (Number.isFinite(advertised) && advertised > maxBytes) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `That clip is too large to download through the MCP (${advertised} bytes, limit ${maxBytes}). Grab it from the Vugola dashboard instead.`,
                },
              ],
            };
          }
        }

        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.byteLength > maxBytes) {
          return {
            content: [
              {
                type: "text" as const,
                text: `That clip is too large to download through the MCP (${buffer.byteLength} bytes, limit ${maxBytes}). Grab it from the Vugola dashboard instead.`,
              },
            ],
          };
        }

        mkdirSync(dir, { recursive: true });
        const filename = `vugola-${safeSlug(input.job_id)}-${input.clip_index}.mp4`;
        const savedTo = join(dir, filename);
        writeFileSync(savedTo, buffer);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                saved_to: savedTo,
                bytes: buffer.byteLength,
                clip_index: input.clip_index,
                job_id: input.job_id,
              }),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: translateNetworkError(err),
            },
          ],
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
