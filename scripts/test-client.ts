// scripts/test-client.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m) process.env[m[1]!] = m[2]!.replace(/^"|"$/g, "");
    }
  } catch {
    // .env.local is optional
  }
}

async function main() {
  loadEnvLocal();
  if (!process.env["VUGOLA_API_KEY"]) {
    console.error("VUGOLA_API_KEY not set. Add it to .env.local first.");
    process.exit(1);
  }

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    env: { ...process.env } as Record<string, string>,
  });
  const client = new Client(
    { name: "smoke-test", version: "0.0.1" },
    { capabilities: {} }
  );
  await client.connect(transport);

  console.log("--- list tools ---");
  const tools = await client.listTools();
  console.log(tools.tools.map((t) => t.name));

  console.log("\n--- get_usage ---");
  const usage = await client.callTool({ name: "get_usage", arguments: {} });
  console.log(usage);

  const videoUrl = process.env["SMOKE_VIDEO_URL"];
  if (videoUrl) {
    console.log("\n--- clip_video ---");
    const clip = await client.callTool({
      name: "clip_video",
      arguments: {
        video_url: videoUrl,
        aspect_ratio: "9:16",
        caption_style: "minimalist",
      },
    });
    console.log(clip);

    const first = (clip.content as Array<{ text?: string }> | undefined)?.[0];
    const parsed = JSON.parse(first?.text ?? "{}");
    if (parsed.job_id) {
      console.log("\n--- get_clip_status (immediately) ---");
      const status = await client.callTool({
        name: "get_clip_status",
        arguments: { job_id: parsed.job_id },
      });
      console.log(status);
      console.log(
        `\nCheck your email in ~25-40 minutes, then run get_clip_status with job_id=${parsed.job_id}\n`
      );
    }
  } else {
    console.log(
      "\nSkipping clip_video/get_clip_status — set SMOKE_VIDEO_URL in .env.local to exercise them."
    );
  }

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
