#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";

import { createClient } from "./client.js";
import { createRateLimiter } from "./rate-limit.js";
import { createClipVideoTool } from "./tools/clip-video.js";
import { createGetClipStatusTool } from "./tools/get-clip-status.js";
import { createGetUsageTool } from "./tools/get-usage.js";
import { createSchedulePostTool } from "./tools/schedule-post.js";
import { runInstall } from "./install.js";

const MISSING_KEY_MSG =
  "Set VUGOLA_API_KEY in your MCP config. Get one at https://www.vugolaai.com/dashboard/api-key";

function lastFour(s: string): string {
  return s.slice(-4);
}

async function main() {
  const apiKey = process.env["VUGOLA_API_KEY"] ?? "";
  if (!apiKey) {
    process.stderr.write(
      "[vugola-mcp] VUGOLA_API_KEY not set — tools will return a setup message.\n"
    );
  } else {
    process.stderr.write(
      `[vugola-mcp] ready — key loaded (last 4: ...${lastFour(apiKey)})\n`
    );
  }

  const client = createClient({
    baseUrl: "https://www.vugolaai.com/api/v1",
    apiKey,
  });
  const rateLimiter = createRateLimiter({
    clip_video: { max: 5, windowMs: 60_000 },
    schedule_post: { max: 10, windowMs: 60_000 },
    get_clip_status: { max: 30, windowMs: 60_000 },
    get_usage: { max: 30, windowMs: 60_000 },
  });

  const tools = [
    createClipVideoTool({ client, rateLimiter }),
    createGetClipStatusTool({ client, rateLimiter }),
    createGetUsageTool({ client, rateLimiter }),
    createSchedulePostTool({ client, rateLimiter }),
  ];
  const byName = new Map(tools.map((t) => [t.name, t]));

  const server = new Server(
    {
      name: "vugola-mcp",
      version: "1.1.4",
      title: "Vugola",
      icons: [
        {
          src: "https://www.vugolaai.com/favicon.ico",
          mimeType: "image/x-icon",
        },
      ],
    } as unknown as { name: string; version: string },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => {
      const withAnnotations = t as typeof t & {
        annotations?: Record<string, unknown>;
      };
      const base: Record<string, unknown> = {
        name: t.name,
        description: t.description,
        inputSchema: zodToJsonSchema(t.inputSchema) as Record<string, unknown>,
      };
      if (withAnnotations.annotations) {
        base["annotations"] = withAnnotations.annotations;
      }
      return base;
    }),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (!apiKey) {
      return { content: [{ type: "text", text: MISSING_KEY_MSG }] };
    }
    const tool = byName.get(req.params.name);
    if (!tool) {
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${req.params.name}`,
          },
        ],
      };
    }
    try {
      return await tool.handler((req.params.arguments ?? {}) as never);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Invalid arguments for this tool.";
      return {
        content: [
          {
            type: "text",
            text: `Invalid input: ${msg}`,
          },
        ],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function entry() {
  const args = process.argv.slice(2);
  if (args[0] === "install") {
    return runInstall(args.slice(1));
  }
  return main();
}

entry().catch((err) => {
  process.stderr.write(
    `[vugola-mcp] fatal error: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
