import { describe, it, expect } from "vitest";
import { createRotateWebhookSecretTool } from "../../../src/tools/webhooks/rotate-webhook-secret.js";
import { createRateLimiter } from "../../../src/rate-limit.js";
import type { Client } from "../../../src/client.js";

function fakeClient(
  calls: Array<{ ok: boolean; httpStatus: number; body: unknown }>
): Client & { callCount: () => number } {
  let i = 0;
  return {
    request: async () => calls[i++]!,
    callCount: () => i,
  };
}

describe("rotate_webhook_secret", () => {
  it("returns new secret and rotation window on 200", async () => {
    const client = fakeClient([
      {
        ok: true,
        httpStatus: 200,
        body: {
          id: "11111111-1111-1111-1111-111111111111",
          new_secret: "whsec_newvalue0123",
          rotation_expires_at: "2026-04-22T00:00:00Z",
        },
      },
    ]);
    const tool = createRotateWebhookSecretTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      id: "11111111-1111-1111-1111-111111111111",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.new_secret).toBe("whsec_newvalue0123");
    expect(parsed.rotation_expires_at).toBe("2026-04-22T00:00:00Z");
    expect(parsed.message).toMatch(/OLD SECRET REMAINS VALID/);
  });

  it("returns 409 canned message when rotation in progress", async () => {
    const client = fakeClient([
      {
        ok: false,
        httpStatus: 409,
        body: { error: "rotation_in_progress" },
      },
    ]);
    const tool = createRotateWebhookSecretTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    const res = await tool.handler({
      id: "11111111-1111-1111-1111-111111111111",
    });
    expect(res.content[0].text).toMatch(/cancel|already|conflict|processing/i);
  });

  it("rejects non-uuid id", async () => {
    const client = fakeClient([]);
    const tool = createRotateWebhookSecretTool({
      client,
      rateLimiter: createRateLimiter({}),
    });
    await expect(tool.handler({ id: "bad" })).rejects.toThrow();
  });
});
