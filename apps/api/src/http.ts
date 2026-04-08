import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createNoopLogger, type Logger } from "@tally/logging";
import { type AuthIdentity } from "./auth";
import { ApiError, toErrorEnvelope } from "./errors";
import { evaluateHttpRateLimit, recordHttpCompletion, resolveHttpAuthentication } from "./http-middleware";
import { parsePostRequestBody, parsePutRequestBody } from "./http-request-parsing";
import {
  isLivenessRoute,
  isMetricsRoute,
  isOptionsRoute,
  isReadinessRoute,
  matchHttpDeleteRoutes,
  matchHttpPostRoutes,
  matchHttpPutRoutes,
  matchHttpReadRoutes,
  normalizeRouteLabel,
} from "./http-routes";
import { createInMemoryApiMetrics, type ApiMetrics } from "./metrics";
import { createInMemoryRateLimiter, type RateLimiter, type RateLimitPolicy } from "./rate-limit";
import type { BookService } from "./service";
import {
  validateAccountRequestBody,
  validateAddHouseholdMemberBody,
  validateRequestApprovalBody,
  validateCloseSummaryQuery,
  validateClosePeriodRequestBody,
  validateApplyScheduledTransactionExceptionRequestBody,
  validateExecuteScheduledTransactionRequestBody,
  validateBaselineBudgetLineRequestBody,
  validateCsvImportRequestBody,
  validateGnuCashXmlImportRequestBody,
  validateReportQuery,
  validateQifExportQuery,
  validateQifImportRequestBody,
  validateSetHouseholdMemberRoleBody,
  validateStatementExportQuery,
  validateStatementImportRequestBody,
  validateEnvelopeAllocationRequestBody,
  validateEnvelopeRequestBody,
  validateReconciliationRequestBody,
  validateScheduledTransactionRequestBody,
  validateTransactionRequestBody,
} from "./validation";

export type HttpHandler = (request: Request) => Promise<Response>;

const CORS_ALLOW_METHODS = "GET, POST, PUT, DELETE, OPTIONS";
const CORS_ALLOW_HEADERS =
  "authorization, content-type, x-tally-api-key, x-gnucash-ng-api-key, x-request-id";
const CORS_MAX_AGE = "86400";

function resolveCorsOriginHeaders(
  origin: string | null,
  corsAllowedOrigins: string[],
  runtimeMode: string,
): Record<string, string> {
  if (!origin) {
    return {};
  }

  if (corsAllowedOrigins.length > 0) {
    if (corsAllowedOrigins.includes(origin)) {
      return { "access-control-allow-origin": origin, "vary": "Origin" };
    }

    return {};
  }

  if (runtimeMode !== "production") {
    return { "access-control-allow-origin": "*" };
  }

  return {};
}

export interface ReadinessProbeResult {
  details?: Record<string, unknown>;
  ok: boolean;
}

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

export function createHttpHandler(params: {
  authRequired?: boolean;
  authIdentities?: AuthIdentity[];
  corsAllowedOrigins?: string[];
  logger?: Logger;
  maxBodyBytes?: number;
  metrics?: ApiMetrics;
  readinessProbe?: (input: { logger: Logger }) => Promise<ReadinessProbeResult>;
  rateLimiter?: RateLimiter;
  rateLimitPolicy?: {
    import: RateLimitPolicy;
    mutation: RateLimitPolicy;
    read: RateLimitPolicy;
  };
  runtimeMode?: string;
  service: BookService;
  trustedHeaderAuth?: {
    actorHeader: string;
    proxyKey: string;
    proxyKeyHeader: string;
    roleHeader: string;
  };
}): HttpHandler {
  const logger = (params.logger ?? createNoopLogger()).child({ component: "httpHandler" });
  const authIdentities = params.authIdentities ?? [];
  const corsAllowedOrigins = params.corsAllowedOrigins ?? [];
  const runtimeMode = params.runtimeMode ?? "production";
  const maxBodyBytes = params.maxBodyBytes ?? 1048576;
  const authRequired =
    params.authRequired ?? (authIdentities.length > 0 || params.trustedHeaderAuth !== undefined);
  const metrics = params.metrics ?? createInMemoryApiMetrics();
  const rateLimiter = params.rateLimiter ?? createInMemoryRateLimiter();
  const rateLimitPolicy = params.rateLimitPolicy ?? {
    import: { keyPrefix: "import", limit: 10, windowMs: 60000 },
    mutation: { keyPrefix: "mutation", limit: 30, windowMs: 60000 },
    read: { keyPrefix: "read", limit: 120, windowMs: 60000 },
  };
  const readinessProbe =
    params.readinessProbe ??
    (async (): Promise<ReadinessProbeResult> => ({
      ok: true,
    }));

  function isSafeBookId(bookId: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(bookId);
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

    const origin = request.headers.get("origin");
    const corsHeaders = resolveCorsOriginHeaders(origin, corsAllowedOrigins, runtimeMode);

    function completeJsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
      recordHttpCompletion({
        method: request.method,
        metrics,
        requestLogger,
        route,
        startedAt,
        status,
      });

      return jsonResponse(status, body, {
        "x-request-id": requestId,
        ...corsHeaders,
        ...extraHeaders,
      });
    }

    function completeTextResponse(status: number, body: string, extraHeaders: Record<string, string> = {}): Response {
      recordHttpCompletion({
        method: request.method,
        metrics,
        requestLogger,
        route,
        startedAt,
        status,
      });

      return textResponse(status, body, {
        "x-request-id": requestId,
        ...corsHeaders,
        ...extraHeaders,
      });
    }

    if (isOptionsRoute(request.method, path)) {
      recordHttpCompletion({
        method: request.method,
        metrics,
        requestLogger,
        route,
        startedAt,
        status: 204,
      });

      return new Response(null, {
        headers: {
          "x-request-id": requestId,
          ...corsHeaders,
          "access-control-allow-headers": CORS_ALLOW_HEADERS,
          "access-control-allow-methods": CORS_ALLOW_METHODS,
          "access-control-max-age": CORS_MAX_AGE,
        },
        status: 204,
      });
    }

    if (isLivenessRoute(request.method, path)) {
      return completeJsonResponse(200, {
        service: "api",
        status: "ok",
      });
    }

    if (isReadinessRoute(request.method, path)) {
      const probeResult = await readinessProbe({
        logger: requestLogger.child({
          probe: "readiness",
        }),
      });

      if (probeResult.ok) {
        return completeJsonResponse(200, {
          ...probeResult.details,
          service: "api",
          status: "ready",
        });
      }

      return completeJsonResponse(503, {
        ...probeResult.details,
        service: "api",
        status: "not_ready",
      });
    }

    if (isMetricsRoute(request.method, path)) {
      return completeTextResponse(200, metrics.renderPrometheus());
    }

    const auth = resolveHttpAuthentication({
      authIdentities,
      authRequired,
      request,
      requestLogger,
      trustedHeaderAuth: params.trustedHeaderAuth,
    });

    if (!auth.context || auth.status || auth.errorBody) {
      return completeJsonResponse(auth.status ?? 401, auth.errorBody ?? toErrorEnvelope(new ApiError({
        code: "auth.required",
        message: "Authentication is required.",
        status: 401,
      })));
    }

    const requestKey = auth.context.actor;

    function enforceRateLimit(policy: RateLimitPolicy): Response | null {
      const rateLimit = evaluateHttpRateLimit({
        policy,
        rateLimiter,
        requestKey,
        requestLogger,
      });

      if (!rateLimit.status || !rateLimit.body) {
        return null;
      }

      return completeJsonResponse(rateLimit.status, rateLimit.body, rateLimit.headers ?? {});
    }

    if (request.method === "GET") {
      const {
        accountsMatch,
        approvalsMatch,
        auditEventsMatch,
        backupsMatch,
        closePeriodsMatch,
        closeSummaryMatch,
        dashboardMatch,
        gnucashXmlExportMatch,
        householdMembersMatch,
        qifExportMatch,
        reportMatch,
        statementExportMatch,
        bookMatch,
      } = matchHttpReadRoutes(path);

      if (bookMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(bookMatch[1]);

        if (!isSafeBookId(bookId)) {
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

        const response = await params.service.getBook({
          auth: auth.context,
          logger: requestLogger,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (dashboardMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(dashboardMatch[1]);
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");

        if (!isSafeBookId(bookId)) {
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
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (reportMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(reportMatch[1]);

        if (!isSafeBookId(bookId)) {
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
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (closeSummaryMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(closeSummaryMatch[1]);

        if (!isSafeBookId(bookId)) {
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
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (closePeriodsMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(closePeriodsMatch[1]);

        if (!isSafeBookId(bookId)) {
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

        const response = await params.service.getBook({
          auth: auth.context,
          logger: requestLogger,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (qifExportMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(qifExportMatch[1]);

        if (!isSafeBookId(bookId)) {
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
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (statementExportMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(statementExportMatch[1]);

        if (!isSafeBookId(bookId)) {
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

        const query = validateStatementExportQuery({
          accountId: url.searchParams.get("accountId"),
          format: decodeURIComponent(statementExportMatch[2]),
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

        const response = await params.service.getStatementExport({
          accountId: query.value.accountId,
          auth: auth.context,
          format: query.value.format,
          from: query.value.from,
          logger: requestLogger,
          to: query.value.to,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (gnucashXmlExportMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(gnucashXmlExportMatch[1]);

        if (!isSafeBookId(bookId)) {
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

        const response = await params.service.getGnuCashXmlExport({
          auth: auth.context,
          logger: requestLogger,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (backupsMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(backupsMatch[1]);

        if (!isSafeBookId(bookId)) {
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

        const response = await params.service.getBackups({
          auth: auth.context,
          logger: requestLogger,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (householdMembersMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(householdMembersMatch[1]);

        if (!isSafeBookId(bookId)) {
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

        const response = await params.service.getHouseholdMembers({
          auth: auth.context,
          logger: requestLogger,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (accountsMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(accountsMatch[1]);

        if (!isSafeBookId(bookId)) {
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

        const includeArchived = url.searchParams.get("includeArchived") === "true";

        const response = await params.service.getAccounts({
          auth: auth.context,
          includeArchived,
          logger: requestLogger,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (approvalsMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(approvalsMatch[1]);

        if (!isSafeBookId(bookId)) {
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

        const response = await params.service.getApprovals({
          auth: auth.context,
          logger: requestLogger,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (auditEventsMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(auditEventsMatch[1]);

        if (!isSafeBookId(bookId)) {
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

        const rawLimit = url.searchParams.get("limit");
        const limit = rawLimit !== null ? parseInt(rawLimit, 10) : undefined;

        if (limit !== undefined && (isNaN(limit) || limit < 1)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "request.invalid",
                message: "limit must be a positive integer.",
                status: 400,
              }),
            ),
          );
        }

        const since = url.searchParams.get("since") ?? undefined;
        const eventType = url.searchParams.get("eventType") ?? undefined;

        const response = await params.service.getAuditEvents({
          auth: auth.context,
          eventType,
          limit,
          logger: requestLogger,
          since,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }
    }

    if (request.method === "POST") {
      const {
        accountMatch,
        approvalGrantMatch,
        approvalDenyMatch,
        approvalRequestMatch,
        backupRestoreMatch,
        backupsCreateMatch,
        bodylessPostRoute,
        budgetLineMatch,
        closePeriodMatch,
        csvImportMatch,
        envelopeAllocationMatch,
        envelopeMatch,
        exceptionScheduleMatch,
        executeScheduleMatch,
        gnucashXmlImportMatch,
        householdMemberMatch,
        qifImportMatch,
        reconciliationMatch,
        scheduleMatch,
        statementImportMatch,
        transactionMatch,
      } = matchHttpPostRoutes(path);

      const parsedPostBody = await parsePostRequestBody({
        bodylessPostRoute,
        maxBodyBytes,
        request,
        requestLogger,
      });
      const body = parsedPostBody.body;

      if (parsedPostBody.errorCode && parsedPostBody.errorMessage && parsedPostBody.status) {
        return completeJsonResponse(
          parsedPostBody.status,
          toErrorEnvelope(
            new ApiError({
              code: parsedPostBody.errorCode,
              message: parsedPostBody.errorMessage,
              status: parsedPostBody.status,
            }),
          ),
        );
      }

      if (transactionMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(transactionMatch[1]);

        if (!isSafeBookId(bookId)) {
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
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (backupsCreateMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(backupsCreateMatch[1]);

        if (!isSafeBookId(bookId)) {
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

        const response = await params.service.postBackup({
          auth: auth.context,
          logger: requestLogger,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (backupRestoreMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(backupRestoreMatch[1]);
        const backupId = decodeURIComponent(backupRestoreMatch[2]);

        if (!isSafeBookId(bookId)) {
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

        const response = await params.service.postBackupRestore({
          auth: auth.context,
          backupId,
          logger: requestLogger,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (closePeriodMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(closePeriodMatch[1]);

        if (!isSafeBookId(bookId)) {
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

        const payload = validateClosePeriodRequestBody(body);

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

        const response = await params.service.postClosePeriod({
          auth: auth.context,
          logger: requestLogger,
          payload: payload.value.payload,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (budgetLineMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(budgetLineMatch[1]);

        if (!isSafeBookId(bookId)) {
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
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (envelopeMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(envelopeMatch[1]);

        if (!isSafeBookId(bookId)) {
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
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (statementImportMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.import);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(statementImportMatch[1]);

        if (!isSafeBookId(bookId)) {
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

        const payload = validateStatementImportRequestBody(body);

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

        const response = await params.service.postStatementImport({
          auth: auth.context,
          logger: requestLogger,
          payload: {
            ...payload.value.payload,
            format: decodeURIComponent(statementImportMatch[2]) as "ofx" | "qfx",
          },
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (gnucashXmlImportMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.import);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(gnucashXmlImportMatch[1]);

        if (!isSafeBookId(bookId)) {
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

        const payload = validateGnuCashXmlImportRequestBody(body);

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

        const response = await params.service.postGnuCashXmlImport({
          auth: auth.context,
          logger: requestLogger,
          payload: payload.value.payload,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (envelopeAllocationMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(envelopeAllocationMatch[1]);

        if (!isSafeBookId(bookId)) {
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
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (reconciliationMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(reconciliationMatch[1]);

        if (!isSafeBookId(bookId)) {
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
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (scheduleMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(scheduleMatch[1]);

        if (!isSafeBookId(bookId)) {
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
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (executeScheduleMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(executeScheduleMatch[1]);
        const scheduleId = decodeURIComponent(executeScheduleMatch[2]);

        if (!isSafeBookId(bookId) || !/^[a-zA-Z0-9:_-]+$/.test(scheduleId)) {
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
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (exceptionScheduleMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(exceptionScheduleMatch[1]);
        const scheduleId = decodeURIComponent(exceptionScheduleMatch[2]);

        if (!isSafeBookId(bookId) || !/^[a-zA-Z0-9:_-]+$/.test(scheduleId)) {
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
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (csvImportMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.import);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(csvImportMatch[1]);

        if (!isSafeBookId(bookId)) {
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
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (qifImportMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.import);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(qifImportMatch[1]);

        if (!isSafeBookId(bookId)) {
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
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (accountMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(accountMatch[1]);

        if (!isSafeBookId(bookId)) {
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

        const parsed = validateAccountRequestBody(body);

        if ("errors" in parsed) {
          requestLogger.warn("http request validation failed", { errors: parsed.errors });
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: parsed.errors },
                message: parsed.errors[0] ?? "Request validation failed.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.postAccount({
          account: parsed.value.account,
          auth: auth.context,
          logger: requestLogger,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (householdMemberMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(householdMemberMatch[1]);

        if (!isSafeBookId(bookId)) {
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

        const parsed = validateAddHouseholdMemberBody(body);

        if ("errors" in parsed) {
          requestLogger.warn("http request validation failed", { errors: parsed.errors });
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: parsed.errors },
                message: parsed.errors[0] ?? "Request validation failed.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.addHouseholdMember({
          auth: auth.context,
          logger: requestLogger,
          payload: parsed.value.payload,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (approvalRequestMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(approvalRequestMatch[1]);

        if (!isSafeBookId(bookId)) {
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

        const parsed = validateRequestApprovalBody(body);

        if ("errors" in parsed) {
          requestLogger.warn("http request validation failed", { errors: parsed.errors });
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: parsed.errors },
                message: parsed.errors[0] ?? "Request validation failed.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.requestApproval({
          auth: auth.context,
          logger: requestLogger,
          payload: parsed.value.payload,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (approvalGrantMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(approvalGrantMatch[1]);
        const approvalId = decodeURIComponent(approvalGrantMatch[2]);

        if (!isSafeBookId(bookId)) {
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

        const response = await params.service.grantApproval({
          approvalId,
          auth: auth.context,
          logger: requestLogger,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (approvalDenyMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(approvalDenyMatch[1]);
        const approvalId = decodeURIComponent(approvalDenyMatch[2]);

        if (!isSafeBookId(bookId)) {
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

        const response = await params.service.denyApproval({
          approvalId,
          auth: auth.context,
          logger: requestLogger,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }
    }

    if (request.method === "PUT") {
      const { putTransactionMatch, setHouseholdMemberRoleMatch } = matchHttpPutRoutes(path);
      const transactionMatch = putTransactionMatch;

      const parsedPutBody = await parsePutRequestBody({
        maxBodyBytes,
        request,
        requestLogger,
      });
      const body = parsedPutBody.body;

      if (parsedPutBody.errorCode && parsedPutBody.errorMessage && parsedPutBody.status) {
        return completeJsonResponse(
          parsedPutBody.status,
          toErrorEnvelope(
            new ApiError({
              code: parsedPutBody.errorCode,
              message: parsedPutBody.errorMessage,
              status: parsedPutBody.status,
            }),
          ),
        );
      }

      if (transactionMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(transactionMatch[1]);
        const transactionId = decodeURIComponent(transactionMatch[2]);

        if (!isSafeBookId(bookId) || !/^[a-zA-Z0-9:_-]+$/.test(transactionId)) {
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
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (setHouseholdMemberRoleMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(setHouseholdMemberRoleMatch[1]);
        const actor = decodeURIComponent(setHouseholdMemberRoleMatch[2]);

        if (!isSafeBookId(bookId)) {
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

        const parsed = validateSetHouseholdMemberRoleBody(body);

        if ("errors" in parsed) {
          requestLogger.warn("http request validation failed", { errors: parsed.errors });
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: parsed.errors },
                message: parsed.errors[0] ?? "Request validation failed.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.setHouseholdMemberRole({
          actor,
          auth: auth.context,
          logger: requestLogger,
          payload: parsed.value.payload,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }
    }

    if (request.method === "DELETE") {
      const { archiveAccountMatch, deleteTransactionMatch, destroyTransactionMatch, removeHouseholdMemberMatch } = matchHttpDeleteRoutes(path);

      if (archiveAccountMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(archiveAccountMatch[1]);
        const accountId = decodeURIComponent(archiveAccountMatch[2]);

        if (!isSafeBookId(bookId)) {
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

        const response = await params.service.archiveAccount({
          accountId,
          auth: auth.context,
          logger: requestLogger,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (removeHouseholdMemberMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(removeHouseholdMemberMatch[1]);
        const actor = decodeURIComponent(removeHouseholdMemberMatch[2]);

        if (!isSafeBookId(bookId)) {
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

        const response = await params.service.removeHouseholdMember({
          actor,
          auth: auth.context,
          logger: requestLogger,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (destroyTransactionMatch || deleteTransactionMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent((destroyTransactionMatch ?? deleteTransactionMatch)?.[1] ?? "");
        const transactionId = decodeURIComponent((destroyTransactionMatch ?? deleteTransactionMatch)?.[2] ?? "");

        if (!isSafeBookId(bookId) || !/^[a-zA-Z0-9:_-]+$/.test(transactionId)) {
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

        const response = destroyTransactionMatch
          ? await params.service.destroyTransaction({
              auth: auth.context,
              logger: requestLogger,
              transactionId,
              bookId,
            })
          : await params.service.deleteTransaction({
              auth: auth.context,
              logger: requestLogger,
              transactionId,
              bookId,
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
