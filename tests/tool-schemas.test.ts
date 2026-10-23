import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createRateLimiter } from "../src/rate-limit.js";
import { createClipVideoTool } from "../src/tools/clip-video.js";
import { createCaptionVideoTool } from "../src/tools/caption-video.js";
import { createGetClipStatusTool } from "../src/tools/get-clip-status.js";
import { createGetUsageTool } from "../src/tools/get-usage.js";
import { createSchedulePostTool } from "../src/tools/schedule-post.js";
import { createListScheduledPostsTool } from "../src/tools/list-scheduled-posts.js";
import { createCancelScheduledPostTool } from "../src/tools/cancel-scheduled-post.js";
import { createDownloadClipTool } from "../src/tools/download-clip.js";
import type { Client } from "../src/client.js";

const client: Client = { request: async () => { throw new Error("schema discovery must not call the API"); } };
const deps = { client, rateLimiter: createRateLimiter({}) };
const tools = [
  createClipVideoTool(deps), createCaptionVideoTool(deps), createGetClipStatusTool(deps),
  createGetUsageTool(deps), createSchedulePostTool(deps), createListScheduledPostsTool(deps),
  createCancelScheduledPostTool(deps),
  createDownloadClipTool({ apiKey: "", baseUrl: "https://unit.invalid", rateLimiter: deps.rateLimiter }),
];

describe("Zod 4 MCP tool schema discovery", () => {
  it("advertises all eight tool object schemas without running any tools", () => {
    for (const tool of tools) {
      const schema = z.toJSONSchema(tool.inputSchema, { target: "draft-07", io: "input" });
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
      expect(schema.properties).toBeDefined();
    }
  });

  it("keeps scheduling constraints and arbitrary platform-setting values", () => {
    const tool = createSchedulePostTool(deps);
    const schema = z.toJSONSchema(tool.inputSchema, { target: "draft-07", io: "input" });
    expect(schema.required).toEqual(["posts"]);
    expect(schema.properties?.posts).toMatchObject({ type: "array", minItems: 1, maxItems: 25 });
    const post = { platform: "x", post_type: "text", caption: "Ignore the noise & keep filming", scheduled_at: "2026-11-01T12:00:00Z", platform_settings: { arbitrary: { flag: true } } };
    expect(tool.inputSchema.parse({ posts: [post] })).toEqual({ posts: [post] });
    expect(() => tool.inputSchema.parse({ posts: Array.from({ length: 26 }, () => post) })).toThrow();
    expect(() => tool.inputSchema.parse({ posts: [{ ...post, post_type: "carousel", platform: "x" }] })).toThrow();
    expect(() => tool.inputSchema.parse({ posts: [post], extra: true })).toThrow();
  });
});
