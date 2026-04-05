import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createNoopLogger, type Logger } from "@gnucash-ng/logging";
import { resolveAuthContext, type AuthIdentity } from "./auth";
import { ApiError, toErrorEnvelope } from "./errors";
import { createInMemoryApiMetrics, type ApiMetrics } from "./metrics";
import { createInMemoryRateLimiter, type RateLimiter, type RateLimitPolicy } from "./rate-limit";
import type { WorkspaceService } from "./service";
import {
  validateCloseSummaryQuery,
  validateApplyScheduledTransactionExceptionRequestBody,
  validateExecuteScheduledTransactionRequestBody,
  validateBaselineBudgetLineRequestBody,
  validateCsvImportRequestBody,
  validateReportQuery,
  validateQifExportQuery,
  validateQifImportRequestBody,
  validateEnvelopeAllocationRequestBody,
  validateEnvelopeRequestBody,
  validateReconciliationRequestBody,
  validateScheduledTransactionRequestBody,
  validateTransactionRequestBody,
} from "./validation";

export type HttpHandler = (request: Request) => Promise<Response>;

function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      "content-type": "application/json; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      ...extraHeaders,
    },
    status,
  });
}

function textResponse(
  status: number,
  body: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(body, {
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      ...extraHeaders,
    },
    status,
  });
}

function normalizeRouteLabel(method: string, path: string): string {
  if (method === "GET" && path === "/health/live") {
    return "/health/live";
  }

  if (method === "GET" && path === "/health/ready") {
    return "/health/ready";
  }

  if (method === "GET" && path === "/metrics") {
    return "/metrics";
  }

  if (/^\/api\/workspaces\/[^/]+$/.test(path)) {
    return "/api/workspaces/:workspaceId";
  }

  if (/^\/api\/workspaces\/[^/]+\/dashboard$/.test(path)) {
    return "/api/workspaces/:workspaceId/dashboard";
  }

  if (/^\/api\/workspaces\/[^/]+\/reports\/[^/]+$/.test(path)) {
    return "/api/workspaces/:workspaceId/reports/:kind";
  }

  if (/^\/api\/workspaces\/[^/]+\/close-summary$/.test(path)) {
    return "/api/workspaces/:workspaceId/close-summary";
  }

  if (/^\/api\/workspaces\/[^/]+\/transactions$/.test(path)) {
    return "/api/workspaces/:workspaceId/transactions";
  }

  if (/^\/api\/workspaces\/[^/]+\/transactions\/[^/]+$/.test(path)) {
    return "/api/workspaces/:workspaceId/transactions/:transactionId";
  }

  if (/^\/api\/workspaces\/[^/]+\/budget-lines$/.test(path)) {
    return "/api/workspaces/:workspaceId/budget-lines";
  }

  if (/^\/api\/workspaces\/[^/]+\/envelopes$/.test(path)) {
    return "/api/workspaces/:workspaceId/envelopes";
  }

  if (/^\/api\/workspaces\/[^/]+\/envelope-allocations$/.test(path)) {
    return "/api/workspaces/:workspaceId/envelope-allocations";
  }

  if (/^\/api\/workspaces\/[^/]+\/reconciliations$/.test(path)) {
    return "/api/workspaces/:workspaceId/reconciliations";
  }

  if (/^\/api\/workspaces\/[^/]+\/schedules$/.test(path)) {
    return "/api/workspaces/:workspaceId/schedules";
  }

  if (/^\/api\/workspaces\/[^/]+\/schedules\/[^/]+\/execute$/.test(path)) {
    return "/api/workspaces/:workspaceId/schedules/:scheduleId/execute";
  }

  if (/^\/api\/workspaces\/[^/]+\/schedules\/[^/]+\/exceptions$/.test(path)) {
    return "/api/workspaces/:workspaceId/schedules/:scheduleId/exceptions";
  }

  if (/^\/api\/workspaces\/[^/]+\/imports\/csv$/.test(path)) {
    return "/api/workspaces/:workspaceId/imports/csv";
  }

  if (/^\/api\/workspaces\/[^/]+\/imports\/qif$/.test(path)) {
    return "/api/workspaces/:workspaceId/imports/qif";
  }

  if (/^\/api\/workspaces\/[^/]+\/exports\/qif$/.test(path)) {
    return "/api/workspaces/:workspaceId/exports/qif";
  }

  return path;
}

async function parseJsonBody(request: Request, maxBodyBytes: number): Promise<unknown> {
  try {
    const text = await request.text();

    if (Buffer.byteLength(text, "utf8") > maxBodyBytes) {
      return Symbol.for("body-too-large");
    }

    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function createHttpHandler(params: {
  authIdentities?: AuthIdentity[];
  logger?: Logger;
  maxBodyBytes?: number;
  metrics?: ApiMetrics;
  rateLimiter?: RateLimiter;
  rateLimitPolicy?: {
    import: RateLimitPolicy;
    mutation: RateLimitPolicy;
    read: RateLimitPolicy;
  };
  service: WorkspaceService;
}): HttpHandler {
  const logger = (params.logger ?? createNoopLogger()).child({ component: "httpHandler" });
  const authIdentities = params.authIdentities ?? [];
  const maxBodyBytes = params.maxBodyBytes ?? 1048576;
  const authRequired = authIdentities.length > 0;
  const metrics = params.metrics ?? createInMemoryApiMetrics();
  const rateLimiter = params.rateLimiter ?? createInMemoryRateLimiter();
  const rateLimitPolicy = params.rateLimitPolicy ?? {
    import: { keyPrefix: "import", limit: 10, windowMs: 60000 },
    mutation: { keyPrefix: "mutation", limit: 30, windowMs: 60000 },
    read: { keyPrefix: "read", limit: 120, windowMs: 60000 },
  };

  function isSafeWorkspaceId(workspaceId: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(workspaceId);
  }

  function enforceRateLimit(requestKey: string, policy: RateLimitPolicy, requestLogger: Logger): Response | null {
    const decision = rateLimiter.consume(requestKey, policy);

    if (decision.allowed) {
      return null;
    }

    requestLogger.warn("http request rate limited", {
      rateLimitKey: requestKey,
      rateLimitLimit: decision.limit,
      rateLimitRemaining: decision.remaining,
      rateLimitResetAt: new Date(decision.resetAt).toISOString(),
    });

    return jsonResponse(
      429,
      toErrorEnvelope(
        new ApiError({
          code: "security.rate_limited",
          details: { retryAfterSeconds: decision.retryAfterSeconds },
          message: "Rate limit exceeded. Retry later.",
          status: 429,
        }),
      ),
      {
        "retry-after": String(decision.retryAfterSeconds),
        "x-ratelimit-limit": String(decision.limit),
        "x-ratelimit-remaining": String(decision.remaining),
        "x-ratelimit-reset": String(Math.floor(decision.resetAt / 1000)),
      },
    );
  }

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    const route = normalizeRouteLabel(request.method, path);
    const startedAt = Date.now();
    const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();
    const requestLogger = logger.child({
      method: request.method,
      path,
      requestId,
      route,
    });
    requestLogger.info("http request started");

    function complete(status: number): void {
      const durationMs = Date.now() - startedAt;

      metrics.recordRequest({
        durationMs,
        method: request.method,
        route,
        status,
      });

      requestLogger.info("http request completed", {
        durationMs,
        status,
      });
    }

    function completeJsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
      complete(status);

      return jsonResponse(status, body, {
        "x-request-id": requestId,
        ...extraHeaders,
      });
    }

    function completeTextResponse(status: number, body: string, extraHeaders: Record<string, string> = {}): Response {
      complete(status);

      return textResponse(status, body, {
        "x-request-id": requestId,
        ...extraHeaders,
      });
    }

    if (request.method === "GET" && path === "/health/live") {
      return completeJsonResponse(200, {
        service: "api",
        status: "ok",
      });
    }

    if (request.method === "GET" && path === "/health/ready") {
      return completeJsonResponse(200, {
        service: "api",
        status: "ready",
      });
    }

    if (request.method === "GET" && path === "/metrics") {
      return completeTextResponse(200, metrics.renderPrometheus());
    }

    const auth = resolveAuthContext({
      apiKeyHeader: request.headers.get("x-gnucash-ng-api-key"),
      authIdentities,
      authRequired,
      authorizationHeader: request.headers.get("authorization"),
    });

    if (!auth.ok || !auth.context) {
      requestLogger.warn("http request authentication failed");
      return completeJsonResponse(
        401,
        toErrorEnvelope(
          new ApiError({
            code: "auth.required",
            message: auth.error ?? "Authentication is required.",
            status: 401,
          }),
        ),
      );
    }

    const requestKey = auth.context.actor;

    if (request.method === "GET") {
      const workspaceMatch = path.match(/^\/api\/workspaces\/([^/]+)$/);
      const dashboardMatch = path.match(/^\/api\/workspaces\/([^/]+)\/dashboard$/);
      const reportMatch = path.match(/^\/api\/workspaces\/([^/]+)\/reports\/([^/]+)$/);
      const closeSummaryMatch = path.match(/^\/api\/workspaces\/([^/]+)\/close-summary$/);
      const qifExportMatch = path.match(/^\/api\/workspaces\/([^/]+)\/exports\/qif$/);

      if (workspaceMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.read, requestLogger);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent(workspaceMatch[1]);

        if (!isSafeWorkspaceId(workspaceId)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "repository.invalid_identifier",
                message: "Workspace identifier is invalid.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.getWorkspace({
          auth: auth.context,
          logger: requestLogger,
          workspaceId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (dashboardMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.read, requestLogger);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent(dashboardMatch[1]);
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");

        if (!isSafeWorkspaceId(workspaceId)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "repository.invalid_identifier",
                message: "Workspace identifier is invalid.",
                status: 400,
              }),
            ),
          );
        }

        if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
          requestLogger.warn("http request validation failed", {
            errors: ["Dashboard requests require valid ISO from and to query parameters."],
          });
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "request.invalid",
                message: "Dashboard requests require valid ISO from and to query parameters.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.getDashboard({
          auth: auth.context,
          from,
          logger: requestLogger,
          to,
          workspaceId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (reportMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.read, requestLogger);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent(reportMatch[1]);

        if (!isSafeWorkspaceId(workspaceId)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "repository.invalid_identifier",
                message: "Workspace identifier is invalid.",
                status: 400,
              }),
            ),
          );
        }

        const query = validateReportQuery({
          from: url.searchParams.get("from"),
          kind: decodeURIComponent(reportMatch[2]),
          to: url.searchParams.get("to"),
        });

        if (query.errors.length > 0 || !query.value) {
          requestLogger.warn("http request validation failed", { errors: query.errors });
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: query.errors },
                message: query.errors[0] ?? "Request validation failed.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.getReport({
          auth: auth.context,
          from: query.value.from,
          kind: query.value.kind,
          logger: requestLogger,
          to: query.value.to,
          workspaceId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (closeSummaryMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.read, requestLogger);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent(closeSummaryMatch[1]);

        if (!isSafeWorkspaceId(workspaceId)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "repository.invalid_identifier",
                message: "Workspace identifier is invalid.",
                status: 400,
              }),
            ),
          );
        }

        const query = validateCloseSummaryQuery({
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
        });

        if (query.errors.length > 0 || !query.value) {
          requestLogger.warn("http request validation failed", { errors: query.errors });
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: query.errors },
                message: query.errors[0] ?? "Request validation failed.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.getCloseSummary({
          auth: auth.context,
          from: query.value.from,
          logger: requestLogger,
          to: query.value.to,
          workspaceId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (qifExportMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.read, requestLogger);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent(qifExportMatch[1]);

        if (!isSafeWorkspaceId(workspaceId)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "repository.invalid_identifier",
                message: "Workspace identifier is invalid.",
                status: 400,
              }),
            ),
          );
        }

        const query = validateQifExportQuery({
          accountId: url.searchParams.get("accountId"),
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
        });

        if (query.errors.length > 0 || !query.value) {
          requestLogger.warn("http request validation failed", { errors: query.errors });
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: query.errors },
                message: query.errors[0] ?? "Request validation failed.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.getQifExport({
          accountId: query.value.accountId,
          auth: auth.context,
          from: query.value.from,
          logger: requestLogger,
          to: query.value.to,
          workspaceId,
        });
        return completeJsonResponse(response.status, response.body);
      }
    }

    if (request.method === "POST") {
      const budgetLineMatch = path.match(/^\/api\/workspaces\/([^/]+)\/budget-lines$/);
      const envelopeMatch = path.match(/^\/api\/workspaces\/([^/]+)\/envelopes$/);
      const envelopeAllocationMatch = path.match(/^\/api\/workspaces\/([^/]+)\/envelope-allocations$/);
      const scheduleMatch = path.match(/^\/api\/workspaces\/([^/]+)\/schedules$/);
      const executeScheduleMatch = path.match(/^\/api\/workspaces\/([^/]+)\/schedules\/([^/]+)\/execute$/);
      const exceptionScheduleMatch = path.match(/^\/api\/workspaces\/([^/]+)\/schedules\/([^/]+)\/exceptions$/);
      const transactionMatch = path.match(/^\/api\/workspaces\/([^/]+)\/transactions$/);
      const reconciliationMatch = path.match(/^\/api\/workspaces\/([^/]+)\/reconciliations$/);
      const csvImportMatch = path.match(/^\/api\/workspaces\/([^/]+)\/imports\/csv$/);
      const qifImportMatch = path.match(/^\/api\/workspaces\/([^/]+)\/imports\/qif$/);

      if (!request.headers.get("content-type")?.includes("application/json")) {
        requestLogger.warn("http request validation failed", {
          errors: ["POST requests must use application/json."],
        });
        return completeJsonResponse(
          415,
          toErrorEnvelope(
            new ApiError({
              code: "request.unsupported_media_type",
              message: "POST requests must use application/json.",
              status: 415,
            }),
          ),
        );
      }

      const body = await parseJsonBody(request, maxBodyBytes);

      if (body === Symbol.for("body-too-large")) {
        requestLogger.warn("http request rejected for size limit");
        return completeJsonResponse(
          413,
          toErrorEnvelope(
            new ApiError({
              code: "request.too_large",
              message: "Request body exceeds the configured size limit.",
              status: 413,
            }),
          ),
        );
      }

      if (body === undefined) {
        requestLogger.warn("http request validation failed", {
          errors: ["Request body must be valid JSON."],
        });
        return completeJsonResponse(
          400,
          toErrorEnvelope(
            new ApiError({
              code: "request.invalid",
              message: "Request body must be valid JSON.",
              status: 400,
            }),
          ),
        );
      }

      if (transactionMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.mutation, requestLogger);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent(transactionMatch[1]);

        if (!isSafeWorkspaceId(workspaceId)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "repository.invalid_identifier",
                message: "Workspace identifier is invalid.",
                status: 400,
              }),
            ),
          );
        }

        const payload = validateTransactionRequestBody(body);

        if (payload.errors.length > 0 || !payload.value) {
          requestLogger.warn("http request validation failed", { errors: payload.errors });
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: payload.errors },
                message: payload.errors[0] ?? "Request validation failed.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.postTransaction({
          auth: auth.context,
          logger: requestLogger,
          transaction: payload.value.transaction,
          workspaceId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (budgetLineMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.mutation, requestLogger);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent(budgetLineMatch[1]);

        if (!isSafeWorkspaceId(workspaceId)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "repository.invalid_identifier",
                message: "Workspace identifier is invalid.",
                status: 400,
              }),
            ),
          );
        }

        const payload = validateBaselineBudgetLineRequestBody(body);

        if (payload.errors.length > 0 || !payload.value) {
          requestLogger.warn("http request validation failed", { errors: payload.errors });
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: payload.errors },
                message: payload.errors[0] ?? "Request validation failed.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.postBaselineBudgetLine({
          auth: auth.context,
          line: payload.value.line,
          logger: requestLogger,
          workspaceId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (envelopeMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.mutation, requestLogger);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent(envelopeMatch[1]);

        if (!isSafeWorkspaceId(workspaceId)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "repository.invalid_identifier",
                message: "Workspace identifier is invalid.",
                status: 400,
              }),
            ),
          );
        }

        const payload = validateEnvelopeRequestBody(body);

        if (payload.errors.length > 0 || !payload.value) {
          requestLogger.warn("http request validation failed", { errors: payload.errors });
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: payload.errors },
                message: payload.errors[0] ?? "Request validation failed.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.postEnvelope({
          auth: auth.context,
          envelope: payload.value.envelope,
          logger: requestLogger,
          workspaceId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (envelopeAllocationMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.mutation, requestLogger);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent(envelopeAllocationMatch[1]);

        if (!isSafeWorkspaceId(workspaceId)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "repository.invalid_identifier",
                message: "Workspace identifier is invalid.",
                status: 400,
              }),
            ),
          );
        }

        const payload = validateEnvelopeAllocationRequestBody(body);

        if (payload.errors.length > 0 || !payload.value) {
          requestLogger.warn("http request validation failed", { errors: payload.errors });
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: payload.errors },
                message: payload.errors[0] ?? "Request validation failed.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.postEnvelopeAllocation({
          allocation: payload.value.allocation,
          auth: auth.context,
          logger: requestLogger,
          workspaceId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (reconciliationMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.mutation, requestLogger);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent(reconciliationMatch[1]);

        if (!isSafeWorkspaceId(workspaceId)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "repository.invalid_identifier",
                message: "Workspace identifier is invalid.",
                status: 400,
              }),
            ),
          );
        }

        const payload = validateReconciliationRequestBody(body);

        if (payload.errors.length > 0 || !payload.value) {
          requestLogger.warn("http request validation failed", { errors: payload.errors });
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: payload.errors },
                message: payload.errors[0] ?? "Request validation failed.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.postReconciliation({
          auth: auth.context,
          logger: requestLogger,
          payload: payload.value.payload,
          workspaceId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (scheduleMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.mutation, requestLogger);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent(scheduleMatch[1]);

        if (!isSafeWorkspaceId(workspaceId)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "repository.invalid_identifier",
                message: "Workspace identifier is invalid.",
                status: 400,
              }),
            ),
          );
        }

        const payload = validateScheduledTransactionRequestBody(body);

        if (payload.errors.length > 0 || !payload.value) {
          requestLogger.warn("http request validation failed", { errors: payload.errors });
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: payload.errors },
                message: payload.errors[0] ?? "Request validation failed.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.postScheduledTransaction({
          auth: auth.context,
          logger: requestLogger,
          schedule: payload.value.schedule,
          workspaceId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (executeScheduleMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.mutation, requestLogger);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent(executeScheduleMatch[1]);
        const scheduleId = decodeURIComponent(executeScheduleMatch[2]);

        if (!isSafeWorkspaceId(workspaceId) || !/^[a-zA-Z0-9:_-]+$/.test(scheduleId)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "repository.invalid_identifier",
                message: "Workspace or schedule identifier is invalid.",
                status: 400,
              }),
            ),
          );
        }

        const payload = validateExecuteScheduledTransactionRequestBody(body);

        if (!payload.value || payload.errors) {
          requestLogger.warn("http request validation failed", { errors: payload.errors });
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: payload.errors ?? [] },
                message: payload.errors?.[0] ?? "Request validation failed.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.executeScheduledTransaction({
          auth: auth.context,
          logger: requestLogger,
          payload: payload.value.payload,
          scheduleId,
          workspaceId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (exceptionScheduleMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.mutation, requestLogger);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent(exceptionScheduleMatch[1]);
        const scheduleId = decodeURIComponent(exceptionScheduleMatch[2]);

        if (!isSafeWorkspaceId(workspaceId) || !/^[a-zA-Z0-9:_-]+$/.test(scheduleId)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "repository.invalid_identifier",
                message: "Workspace or schedule identifier is invalid.",
                status: 400,
              }),
            ),
          );
        }

        const payload = validateApplyScheduledTransactionExceptionRequestBody(body);

        if (!payload.value || payload.errors) {
          requestLogger.warn("http request validation failed", { errors: payload.errors });
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: payload.errors ?? [] },
                message: payload.errors?.[0] ?? "Request validation failed.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.applyScheduledTransactionException({
          auth: auth.context,
          logger: requestLogger,
          payload: payload.value.payload,
          scheduleId,
          workspaceId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (csvImportMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.import, requestLogger);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent(csvImportMatch[1]);

        if (!isSafeWorkspaceId(workspaceId)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "repository.invalid_identifier",
                message: "Workspace identifier is invalid.",
                status: 400,
              }),
            ),
          );
        }

        const payload = validateCsvImportRequestBody(body);

        if (payload.errors.length > 0 || !payload.value) {
          requestLogger.warn("http request validation failed", { errors: payload.errors });
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: payload.errors },
                message: payload.errors[0] ?? "Request validation failed.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.postCsvImport({
          auth: auth.context,
          logger: requestLogger,
          payload: payload.value.payload,
          workspaceId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (qifImportMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.import, requestLogger);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent(qifImportMatch[1]);

        if (!isSafeWorkspaceId(workspaceId)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "repository.invalid_identifier",
                message: "Workspace identifier is invalid.",
                status: 400,
              }),
            ),
          );
        }

        const payload = validateQifImportRequestBody(body);

        if (payload.errors.length > 0 || !payload.value) {
          requestLogger.warn("http request validation failed", { errors: payload.errors });
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: payload.errors },
                message: payload.errors[0] ?? "Request validation failed.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.postQifImport({
          auth: auth.context,
          logger: requestLogger,
          payload: payload.value.payload,
          workspaceId,
        });
        return completeJsonResponse(response.status, response.body);
      }
    }

    if (request.method === "PUT") {
      const transactionMatch = path.match(/^\/api\/workspaces\/([^/]+)\/transactions\/([^/]+)$/);

      if (!request.headers.get("content-type")?.includes("application/json")) {
        requestLogger.warn("http request validation failed", {
          errors: ["PUT requests must use application/json."],
        });
        return completeJsonResponse(
          415,
          toErrorEnvelope(
            new ApiError({
              code: "request.unsupported_media_type",
              message: "PUT requests must use application/json.",
              status: 415,
            }),
          ),
        );
      }

      const body = await parseJsonBody(request, maxBodyBytes);

      if (body === Symbol.for("body-too-large")) {
        requestLogger.warn("http request rejected for size limit");
        return completeJsonResponse(
          413,
          toErrorEnvelope(
            new ApiError({
              code: "request.too_large",
              message: "Request body exceeds the configured size limit.",
              status: 413,
            }),
          ),
        );
      }

      if (body === undefined) {
        requestLogger.warn("http request validation failed", {
          errors: ["Request body must be valid JSON."],
        });
        return completeJsonResponse(
          400,
          toErrorEnvelope(
            new ApiError({
              code: "request.invalid",
              message: "Request body must be valid JSON.",
              status: 400,
            }),
          ),
        );
      }

      if (transactionMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.mutation, requestLogger);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent(transactionMatch[1]);
        const transactionId = decodeURIComponent(transactionMatch[2]);

        if (!isSafeWorkspaceId(workspaceId) || !/^[a-zA-Z0-9:_-]+$/.test(transactionId)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "repository.invalid_identifier",
                message: "Workspace or transaction identifier is invalid.",
                status: 400,
              }),
            ),
          );
        }

        const payload = validateTransactionRequestBody(body);

        if (payload.errors.length > 0 || !payload.value) {
          requestLogger.warn("http request validation failed", { errors: payload.errors });
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: payload.errors },
                message: payload.errors[0] ?? "Request validation failed.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.updateTransaction({
          auth: auth.context,
          logger: requestLogger,
          transaction: payload.value.transaction,
          transactionId,
          workspaceId,
        });
        return completeJsonResponse(response.status, response.body);
      }
    }

    requestLogger.warn("http request route not found");
    return completeJsonResponse(
      404,
      toErrorEnvelope(
        new ApiError({
          code: "request.not_found",
          message: "Route not found.",
          status: 404,
        }),
      ),
    );
  };
}

async function toFetchRequest(request: IncomingMessage): Promise<Request> {
  const origin = `http://${request.headers.host ?? "localhost"}`;
  const chunks: Uint8Array[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return new Request(new URL(request.url ?? "/", origin), {
    body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
    headers: request.headers as HeadersInit,
    method: request.method,
  });
}

async function sendFetchResponse(response: Response, serverResponse: ServerResponse): Promise<void> {
  serverResponse.statusCode = response.status;
  response.headers.forEach((value, key) => {
    serverResponse.setHeader(key, value);
  });

  const body = await response.arrayBuffer();
  serverResponse.end(Buffer.from(body));
}

export function createNodeHttpServer(params: {
  handler: HttpHandler;
  logger?: Logger;
}) {
  const logger = (params.logger ?? createNoopLogger()).child({ component: "nodeHttpServer" });

  return createServer(async (request, response) => {
    try {
      await sendFetchResponse(await params.handler(await toFetchRequest(request)), response);
    } catch (error) {
      logger.error("node http server request failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      response.statusCode = 500;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ errors: ["Internal server error."] }));
    }
  });
}
