#!/usr/bin/env node
import { runInstall } from "./install.js";

runInstall(process.argv.slice(2)).catch((err) => {
  process.stderr.write(
    `[vugola-mcp] fatal error: ${
      err instanceof Error ? err.message : String(err)
    }\n`
  );
  process.exit(1);
});
