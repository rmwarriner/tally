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
  isReadinessRoute,
  matchHttpDeleteRoutes,
  matchHttpPostRoutes,
  matchHttpPutTransactionRoute,
  matchHttpReadRoutes,
  normalizeRouteLabel,
} from "./http-routes";
import { createInMemoryApiMetrics, type ApiMetrics } from "./metrics";
import { createInMemoryRateLimiter, type RateLimiter, type RateLimitPolicy } from "./rate-limit";
import type { WorkspaceService } from "./service";
import {
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
  validateStatementExportQuery,
  validateStatementImportRequestBody,
  validateEnvelopeAllocationRequestBody,
  validateEnvelopeRequestBody,
  validateReconciliationRequestBody,
  validateScheduledTransactionRequestBody,
  validateTransactionRequestBody,
} from "./validation";

export type HttpHandler = (request: Request) => Promise<Response>;

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
  service: WorkspaceService;
  trustedHeaderAuth?: {
    actorHeader: string;
    proxyKey: string;
    proxyKeyHeader: string;
    roleHeader: string;
  };
}): HttpHandler {
  const logger = (params.logger ?? createNoopLogger()).child({ component: "httpHandler" });
  const authIdentities = params.authIdentities ?? [];
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

  function isSafeWorkspaceId(workspaceId: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(workspaceId);
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
        ...extraHeaders,
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
        backupsMatch,
        closePeriodsMatch,
        closeSummaryMatch,
        dashboardMatch,
        gnucashXmlExportMatch,
        qifExportMatch,
        reportMatch,
        statementExportMatch,
        workspaceMatch,
      } = matchHttpReadRoutes(path);

      if (workspaceMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

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
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

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
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

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
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

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

      if (closePeriodsMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent(closePeriodsMatch[1]);

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

      if (qifExportMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

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

      if (statementExportMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent(statementExportMatch[1]);

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
          workspaceId,
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

        const workspaceId = decodeURIComponent(gnucashXmlExportMatch[1]);

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

        const response = await params.service.getGnuCashXmlExport({
          auth: auth.context,
          logger: requestLogger,
          workspaceId,
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

        const workspaceId = decodeURIComponent(backupsMatch[1]);

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

        const response = await params.service.getBackups({
          auth: auth.context,
          logger: requestLogger,
          workspaceId,
        });
        return completeJsonResponse(response.status, response.body);
      }
    }

    if (request.method === "POST") {
      const {
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

      if (backupsCreateMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent(backupsCreateMatch[1]);

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

        const response = await params.service.postBackup({
          auth: auth.context,
          logger: requestLogger,
          workspaceId,
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

        const workspaceId = decodeURIComponent(backupRestoreMatch[1]);
        const backupId = decodeURIComponent(backupRestoreMatch[2]);

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

        const response = await params.service.postBackupRestore({
          auth: auth.context,
          backupId,
          logger: requestLogger,
          workspaceId,
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

        const workspaceId = decodeURIComponent(closePeriodMatch[1]);

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
          workspaceId,
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
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

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

      if (statementImportMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.import);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent(statementImportMatch[1]);

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
          workspaceId,
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

        const workspaceId = decodeURIComponent(gnucashXmlImportMatch[1]);

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
          workspaceId,
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
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

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
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

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
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

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
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

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
        const rateLimited = enforceRateLimit(rateLimitPolicy.import);

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
        const rateLimited = enforceRateLimit(rateLimitPolicy.import);

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
      const transactionMatch = matchHttpPutTransactionRoute(path);

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

    if (request.method === "DELETE") {
      const { deleteTransactionMatch, destroyTransactionMatch } = matchHttpDeleteRoutes(path);

      if (destroyTransactionMatch || deleteTransactionMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const workspaceId = decodeURIComponent((destroyTransactionMatch ?? deleteTransactionMatch)?.[1] ?? "");
        const transactionId = decodeURIComponent((destroyTransactionMatch ?? deleteTransactionMatch)?.[2] ?? "");

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

        const response = destroyTransactionMatch
          ? await params.service.destroyTransaction({
              auth: auth.context,
              logger: requestLogger,
              transactionId,
              workspaceId,
            })
          : await params.service.deleteTransaction({
              auth: auth.context,
              logger: requestLogger,
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
