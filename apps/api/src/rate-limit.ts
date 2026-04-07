export interface RateLimitPolicy {
  keyPrefix: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(key: string, policy: RateLimitPolicy): RateLimitDecision;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface CreateInMemoryRateLimiterParams {
  now?: () => number;
}

export function createInMemoryRateLimiter(
  params: CreateInMemoryRateLimiterParams = {},
): RateLimiter {
  const now = params.now ?? (() => Date.now());
  const entries = new Map<string, RateLimitEntry>();

  return {
    consume(key: string, policy: RateLimitPolicy): RateLimitDecision {
      const currentTime = now();
      const entryKey = `${policy.keyPrefix}:${key}`;
      const existing = entries.get(entryKey);
      const active =
        existing && existing.resetAt > currentTime
          ? existing
          : {
              count: 0,
              resetAt: currentTime + policy.windowMs,
            };

      active.count += 1;
      entries.set(entryKey, active);

      return {
        allowed: active.count <= policy.limit,
        limit: policy.limit,
        remaining: Math.max(0, policy.limit - active.count),
        resetAt: active.resetAt,
        retryAfterSeconds: Math.max(1, Math.ceil((active.resetAt - currentTime) / 1000)),
      };
    },
  };
}
