import type { Logger } from "@tally/logging";
import { resolveAuthContext, type AuthContext, type AuthIdentity } from "./auth";
import { ApiError, toErrorEnvelope } from "./errors";
import type { ManagedAuthStore } from "./managed-auth-store";
import type { ApiMetrics } from "./metrics";
import type { RateLimiter, RateLimitPolicy } from "./rate-limit";

export interface AuthResolutionResult {
  context?: AuthContext;
  errorBody?: unknown;
  status?: 401;
}

export interface RateLimitDecisionResult {
  body?: unknown;
  headers?: Record<string, string>;
  status?: 429;
}

export async function resolveHttpAuthentication(params: {
  authIdentities: AuthIdentity[];
  authRequired: boolean;
  managedAuthStore?: ManagedAuthStore;
  request: Request;
  requestLogger: Logger;
  trustedHeaderAuth?: {
    actorHeader: string;
    proxyKey: string;
    proxyKeyHeader: string;
    roleHeader: string;
  };
}): Promise<AuthResolutionResult> {
  const apiKeyHeader =
    params.request.headers.get("x-tally-api-key") ??
    params.request.headers.get("x-gnucash-ng-api-key");

  const auth = resolveAuthContext({
    apiKeyHeader,
    authIdentities: params.authIdentities,
    authRequired: params.authRequired,
    authorizationHeader: params.request.headers.get("authorization"),
    trustedHeaderAuth: params.trustedHeaderAuth,
    trustedHeaders: params.request.headers,
  });

  if (!auth.ok || !auth.context) {
    const bearerToken =
      params.request.headers.get("authorization")?.startsWith("Bearer ")
        ? params.request.headers.get("authorization")?.slice("Bearer ".length)
        : apiKeyHeader ?? undefined;

    if (bearerToken && params.managedAuthStore) {
      const managedCredential = await params.managedAuthStore.verifyBearer(bearerToken, {
        logger: params.requestLogger,
      });
      if (managedCredential) {
        if (managedCredential.kind === "managed-token") {
          return {
            context: {
              actor: managedCredential.actor,
              kind: "managed-token",
              role: managedCredential.role,
              tokenId: managedCredential.tokenId,
            },
          };
        }

        return {
          context: {
            actor: managedCredential.actor,
            kind: "session",
            role: managedCredential.role,
            sessionId: managedCredential.sessionId,
            tokenId: managedCredential.tokenId,
          },
        };
      }
    }

    params.requestLogger.warn("http request authentication failed");
    return {
      errorBody: toErrorEnvelope(
        new ApiError({
          code: "auth.required",
          message: auth.error ?? "Authentication is required.",
          status: 401,
        }),
      ),
      status: 401,
    };
  }

  return { context: auth.context };
}

export function evaluateHttpRateLimit(params: {
  policy: RateLimitPolicy;
  rateLimiter: RateLimiter;
  requestKey: string;
  requestLogger: Logger;
}): RateLimitDecisionResult {
  const decision = params.rateLimiter.consume(params.requestKey, params.policy);

  if (decision.allowed) {
    return {};
  }

  params.requestLogger.warn("http request rate limited", {
    rateLimitKey: params.requestKey,
    rateLimitLimit: decision.limit,
    rateLimitRemaining: decision.remaining,
    rateLimitResetAt: new Date(decision.resetAt).toISOString(),
  });

  return {
    body: toErrorEnvelope(
      new ApiError({
        code: "security.rate_limited",
        details: { retryAfterSeconds: decision.retryAfterSeconds },
        message: "Rate limit exceeded. Retry later.",
        status: 429,
      }),
    ),
    headers: {
      "retry-after": String(decision.retryAfterSeconds),
      "x-ratelimit-limit": String(decision.limit),
      "x-ratelimit-remaining": String(decision.remaining),
      "x-ratelimit-reset": String(Math.floor(decision.resetAt / 1000)),
    },
    status: 429,
  };
}

export function recordHttpCompletion(params: {
  metrics: ApiMetrics;
  method: string;
  requestLogger: Logger;
  route: string;
  startedAt: number;
  status: number;
}): void {
  const durationMs = Date.now() - params.startedAt;

  params.metrics.recordRequest({
    durationMs,
    method: params.method,
    route: params.route,
    status: params.status,
  });

  params.requestLogger.info("http request completed", {
    durationMs,
    status: params.status,
  });
}
