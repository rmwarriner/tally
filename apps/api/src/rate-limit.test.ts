import { describe, expect, it } from "vitest";
import { createInMemoryRateLimiter } from "./rate-limit";

describe("in-memory rate limiter", () => {
  it("allows requests until the configured limit is exceeded", () => {
    const limiter = createInMemoryRateLimiter({ now: () => 1000 });
    const policy = { keyPrefix: "read", limit: 2, windowMs: 60000 };

    const first = limiter.consume("Primary", policy);
    const second = limiter.consume("Primary", policy);
    const third = limiter.consume("Primary", policy);

    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBe(60);
  });

  it("resets counters after the window expires", () => {
    let now = 1000;
    const limiter = createInMemoryRateLimiter({ now: () => now });
    const policy = { keyPrefix: "mutation", limit: 1, windowMs: 1000 };

    expect(limiter.consume("Primary", policy).allowed).toBe(true);
    expect(limiter.consume("Primary", policy).allowed).toBe(false);

    now = 2001;

    const afterReset = limiter.consume("Primary", policy);

    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(0);
  });
});
