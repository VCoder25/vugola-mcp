import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRateLimiter } from "../src/rate-limit.js";

describe("rate limiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows calls up to the limit", () => {
    const rl = createRateLimiter({ clip_video: { max: 3, windowMs: 60_000 } });
    expect(rl.check("clip_video")).toEqual({ allowed: true });
    expect(rl.check("clip_video")).toEqual({ allowed: true });
    expect(rl.check("clip_video")).toEqual({ allowed: true });
  });

  it("rejects the N+1 call within the window", () => {
    const rl = createRateLimiter({ clip_video: { max: 3, windowMs: 60_000 } });
    rl.check("clip_video"); rl.check("clip_video"); rl.check("clip_video");
    const result = rl.check("clip_video");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("re-allows calls after the window slides past old calls", () => {
    const rl = createRateLimiter({ clip_video: { max: 2, windowMs: 60_000 } });
    rl.check("clip_video");
    rl.check("clip_video");
    expect(rl.check("clip_video").allowed).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(rl.check("clip_video").allowed).toBe(true);
  });

  it("tracks tools independently", () => {
    const rl = createRateLimiter({
      clip_video: { max: 1, windowMs: 60_000 },
      get_usage: { max: 1, windowMs: 60_000 },
    });
    expect(rl.check("clip_video").allowed).toBe(true);
    expect(rl.check("get_usage").allowed).toBe(true);
    expect(rl.check("clip_video").allowed).toBe(false);
    expect(rl.check("get_usage").allowed).toBe(false);
  });

  it("returns allowed=true for unknown tool names (no config == unbounded)", () => {
    const rl = createRateLimiter({ clip_video: { max: 1, windowMs: 60_000 } });
    expect(rl.check("unknown_tool").allowed).toBe(true);
  });
});
