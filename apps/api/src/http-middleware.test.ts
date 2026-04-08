import { describe, expect, it } from "vitest";
import { createNoopLogger } from "@tally/logging";
import { createInMemoryApiMetrics } from "./metrics";
import { resolveHttpAuthentication, evaluateHttpRateLimit, recordHttpCompletion } from "./http-middleware";
import { createInMemoryRateLimiter } from "./rate-limit";

describe("http middleware", () => {
  it("resolves default local auth when auth is not required", async () => {
    const result = await resolveHttpAuthentication({
      authIdentities: [],
      authRequired: false,
      request: new Request("http://localhost/api/books/demo"),
      requestLogger: createNoopLogger(),
    });

    expect(result.context?.kind).toBe("local");
    expect(result.status).toBeUndefined();
  });

  it("returns auth.required envelope when auth fails", async () => {
    const result = await resolveHttpAuthentication({
      authIdentities: [],
      authRequired: true,
      request: new Request("http://localhost/api/books/demo"),
      requestLogger: createNoopLogger(),
    });

    expect(result.context).toBeUndefined();
    expect(result.status).toBe(401);
    expect(result.errorBody).toMatchObject({
      error: {
        code: "auth.required",
        message: "Authentication is required.",
      },
    });
  });

  it("accepts legacy api key header during transition", async () => {
    const headers = new Headers();
    headers.set("x-gnucash-ng-api-key", "legacy-token");

    const result = await resolveHttpAuthentication({
      authIdentities: [{ actor: "legacy", role: "admin", token: "legacy-token" }],
      authRequired: true,
      request: new Request("http://localhost/api/books/demo", { headers }),
      requestLogger: createNoopLogger(),
    });

    expect(result.context?.actor).toBe("legacy");
    expect(result.status).toBeUndefined();
  });

  it("returns rate limit decision details when limit is exceeded", () => {
    const rateLimiter = createInMemoryRateLimiter();
    const logger = createNoopLogger();
    const policy = { keyPrefix: "read", limit: 1, windowMs: 60000 };

    const first = evaluateHttpRateLimit({
      policy,
      rateLimiter,
      requestKey: "actor-1",
      requestLogger: logger,
    });
    const second = evaluateHttpRateLimit({
      policy,
      rateLimiter,
      requestKey: "actor-1",
      requestLogger: logger,
    });

    expect(first.status).toBeUndefined();
    expect(second.status).toBe(429);
    expect(second.headers?.["retry-after"]).toBeDefined();
    expect(second.body).toMatchObject({
      error: {
        code: "security.rate_limited",
        details: { retryAfterSeconds: expect.any(Number) },
        message: "Rate limit exceeded. Retry later.",
      },
    });
  });

  it("records request completion metrics", () => {
    const metrics = createInMemoryApiMetrics();
    const startedAt = Date.now() - 5;
    recordHttpCompletion({
      method: "GET",
      metrics,
      requestLogger: createNoopLogger(),
      route: "/api/books/:bookId",
      startedAt,
      status: 200,
    });

    const output = metrics.renderPrometheus();
    expect(output).toContain(
      'gnucash_ng_http_requests_total{method="GET",route="/api/books/:bookId",status="200"} 1',
    );
  });
});
