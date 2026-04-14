export interface BucketConfig {
  max: number;
  windowMs: number;
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

export interface RateLimiter {
  check(tool: string): RateLimitResult;
}

export function createRateLimiter(
  config: Record<string, BucketConfig>
): RateLimiter {
  const history: Record<string, number[]> = {};

  return {
    check(tool: string): RateLimitResult {
      const cfg = config[tool];
      if (!cfg) return { allowed: true };
      const now = Date.now();
      const cutoff = now - cfg.windowMs;
      const calls = (history[tool] ??= []);
      while (calls.length > 0 && calls[0]! < cutoff) calls.shift();
      if (calls.length >= cfg.max) {
        const oldest = calls[0]!;
        return { allowed: false, retryAfterMs: oldest + cfg.windowMs - now };
      }
      calls.push(now);
      return { allowed: true };
    },
  };
}
