import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";

type SupportedClient = "claude-desktop";

interface McpServerBlock {
  command: string;
  args: string[];
  env: Record<string, string>;
}

interface McpConfig {
  mcpServers?: Record<string, McpServerBlock>;
  [key: string]: unknown;
}

const VERSION = "1.1.1";

function configPathFor(client: SupportedClient): string {
  if (client !== "claude-desktop") {
    throw new Error(`Unsupported client: ${client}`);
  }
  const home = homedir();
  switch (process.platform) {
    case "darwin":
      return join(
        home,
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json"
      );
    case "win32":
      return join(
        process.env["APPDATA"] ?? join(home, "AppData", "Roaming"),
        "Claude",
        "claude_desktop_config.json"
      );
    case "linux":
      return join(home, ".config", "Claude", "claude_desktop_config.json");
    default:
      throw new Error(
        `Unsupported platform: ${process.platform}. Edit your Claude Desktop config manually.`
      );
  }
}

function readConfig(path: string): McpConfig {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf-8").trim();
  if (raw.length === 0) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as McpConfig)
      : {};
  } catch {
    throw new Error(
      `Could not parse ${path} as JSON. Fix it manually or delete it, then re-run.`
    );
  }
}

function writeConfig(path: string, config: McpConfig): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

function isValidApiKey(key: string): boolean {
  return /^vug_sk_[A-Za-z0-9]{20,}$/.test(key.trim());
}

async function promptApiKey(): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(
      "This terminal is not interactive. Re-run with --key vug_sk_... or set VUGOLA_API_KEY in the environment."
    );
  }
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  try {
    const answer = await rl.question(
      "Paste your Vugola API key (starts with vug_sk_): "
    );
    return answer.trim();
  } finally {
    rl.close();
  }
}

function parseArgs(argv: string[]): {
  client: SupportedClient;
  key: string | undefined;
} {
  let client: SupportedClient = "claude-desktop";
  let key: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--client" && argv[i + 1]) {
      const next = argv[i + 1]!;
      if (next !== "claude-desktop") {
        throw new Error(
          `Unsupported client "${next}". Only "claude-desktop" is supported in this version.`
        );
      }
      client = next;
      i++;
    } else if (arg === "--key" && argv[i + 1]) {
      key = argv[i + 1];
      i++;
    }
  }
  return { client, key };
}

export async function runInstall(argv: string[]): Promise<void> {
  const { client, key: keyFromFlag } = parseArgs(argv);
  const path = configPathFor(client);

  process.stderr.write(`[vugola-mcp] configuring ${client} at ${path}\n`);

  let apiKey = keyFromFlag ?? process.env["VUGOLA_API_KEY"] ?? "";
  if (!apiKey) {
    apiKey = await promptApiKey();
  }
  if (!isValidApiKey(apiKey)) {
    throw new Error(
      `That doesn't look like a Vugola API key (expected vug_sk_...). Get one at https://www.vugolaai.com/dashboard/api-key`
    );
  }

  const config = readConfig(path);
  const existingServers = config.mcpServers ?? {};
  const hadExistingEntry = Object.prototype.hasOwnProperty.call(
    existingServers,
    "vugola"
  );

  const updated: McpConfig = {
    ...config,
    mcpServers: {
      ...existingServers,
      vugola: {
        command: "npx",
        args: ["-y", `vugola-mcp@${VERSION}`],
        env: { VUGOLA_API_KEY: apiKey },
      },
    },
  };

  writeConfig(path, updated);

  const action = hadExistingEntry ? "updated" : "added";
  process.stderr.write(
    `[vugola-mcp] ${action} Vugola in ${client} config.\n`
  );
  process.stderr.write(
    `[vugola-mcp] Fully quit Claude Desktop (Cmd+Q on macOS) and reopen it to pick up the change.\n`
  );
}
