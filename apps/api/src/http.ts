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
import type { IdempotencyStore } from "./idempotency-store";
import { buildIdempotencyRequestHash } from "./idempotency-store";
import type { ManagedAuthStore } from "./managed-auth-store";
import { createInMemoryRateLimiter, type RateLimiter, type RateLimitPolicy } from "./rate-limit";
import type { BookService } from "./service";
import {
  validateAccountRequestBody,
  validateAddHouseholdMemberBody,
  validateRequestApprovalBody,
  validateCloseSummaryQuery,
  validateClosePeriodRequestBody,
  validateGetTransactionsQuery,
  validateApplyScheduledTransactionExceptionRequestBody,
  validateExecuteScheduledTransactionRequestBody,
  validateBaselineBudgetLineRequestBody,
  validatePostBookRequestBody,
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
  validateLinkTransactionAttachmentBody,
  validateTransactionRequestBody,
} from "./validation";

export type HttpHandler = (request: Request) => Promise<Response>;

const CORS_ALLOW_METHODS = "GET, POST, PUT, DELETE, OPTIONS";
const CORS_ALLOW_HEADERS =
  "authorization, content-type, if-match, idempotency-key, x-tally-api-key, x-gnucash-ng-api-key, x-request-id";
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

function binaryResponse(
  status: number,
  body: Uint8Array,
  extraHeaders: Record<string, string> = {},
): Response {
  const normalizedBody = new Uint8Array(body.byteLength);
  normalizedBody.set(body);
  return new Response(normalizedBody.buffer, {
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
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
  idempotencyStore?: IdempotencyStore;
  managedAuthStore?: ManagedAuthStore;
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
    const rawPath = url.pathname.replace(/\/+$/, "") || "/";
    const path = rawPath.replace(/^\/api\/v1(?=\/|$)/, "/api");
    const route = normalizeRouteLabel(request.method, path);
    const startedAt = Date.now();
    const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();
    const requestLogger = logger.child({
      method: request.method,
      path: rawPath,
      canonicalPath: path,
      requestId,
      route,
    });
    requestLogger.info("http request started");

    const origin = request.headers.get("origin");
    const corsHeaders = resolveCorsOriginHeaders(origin, corsAllowedOrigins, runtimeMode);
    let activeIdempotencyScopeKey: string | undefined;

    function versionHeadersForBody(body: unknown): Record<string, string> {
      if (!body || typeof body !== "object" || !("book" in (body as Record<string, unknown>))) {
        return {};
      }

      const book = (body as { book?: { version?: unknown } }).book;
      if (!book || typeof book.version !== "number") {
        return {};
      }

      return {
        etag: `"book-${book.version}"`,
        "x-book-version": String(book.version),
      };
    }

    async function completeJsonResponse(
      status: number,
      body: unknown,
      extraHeaders: Record<string, string> = {},
    ): Promise<Response> {
      recordHttpCompletion({
        method: request.method,
        metrics,
        requestLogger,
        route,
        startedAt,
        status,
      });

      const responseHeaders = {
        "x-request-id": requestId,
        ...corsHeaders,
        ...versionHeadersForBody(body),
        ...extraHeaders,
      };

      if (activeIdempotencyScopeKey && params.idempotencyStore) {
        await params.idempotencyStore.complete({
          response: {
            body,
            headers: responseHeaders,
            status,
          },
          scopeKey: activeIdempotencyScopeKey,
        });
      }

      return jsonResponse(status, body, responseHeaders);
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

    function completeBinaryResponse(status: number, body: Uint8Array, extraHeaders: Record<string, string> = {}): Response {
      recordHttpCompletion({
        method: request.method,
        metrics,
        requestLogger,
        route,
        startedAt,
        status,
      });

      return binaryResponse(status, body, {
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

    const auth = await resolveHttpAuthentication({
      authIdentities,
      authRequired,
      managedAuthStore: params.managedAuthStore,
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

      return jsonResponse(rateLimit.status, rateLimit.body, rateLimit.headers ?? {});
    }

    function parseIfMatchVersion(headerValue: string | null): number | undefined {
      if (!headerValue) {
        return undefined;
      }

      const trimmed = headerValue.trim();
      const match = /^"book-(\d+)"$/.exec(trimmed);
      if (!match) {
        throw new ApiError({
          code: "validation.failed",
          details: { issues: ["If-Match must use the format \"book-<version>\"."] },
          message: "If-Match must use the format \"book-<version>\".",
          status: 400,
        });
      }

      return Number.parseInt(match[1], 10);
    }

    const requiresBookPrecondition =
      (request.method === "POST" || request.method === "PUT" || request.method === "DELETE") &&
      /^\/api\/books\/[^/]+/.test(path);
    const isBookCreateRoute = request.method === "POST" && path === "/api/books";

    let ifMatchVersion: number | undefined;
    if (requiresBookPrecondition && !isBookCreateRoute) {
      try {
        ifMatchVersion = parseIfMatchVersion(request.headers.get("if-match"));
      } catch (error) {
        return completeJsonResponse(
          400,
          toErrorEnvelope(
            error instanceof ApiError
              ? error
              : new ApiError({
                  code: "validation.failed",
                  message: "If-Match must use the format \"book-<version>\".",
                  status: 400,
                }),
          ),
        );
      }

      if (ifMatchVersion === undefined) {
        return completeJsonResponse(
          428,
          toErrorEnvelope(
            new ApiError({
              code: "request.precondition_required",
              message: "If-Match is required for book write routes.",
              status: 428,
            }),
          ),
        );
      }
    }
    const mutationPrecondition = ifMatchVersion !== undefined ? { ifMatchVersion } : {};

    if (request.method === "GET") {
      const {
        accountsMatch,
        approvalsMatch,
        auditEventsMatch,
        backupsMatch,
        booksMatch,
        closePeriodsMatch,
        closeSummaryMatch,
        dashboardMatch,
        gnucashXmlExportMatch,
        householdMembersMatch,
        qifExportMatch,
        reportMatch,
        statementExportMatch,
        transactionsMatch,
        attachmentDownloadMatch,
        tokensMatch,
        bookMatch,
      } = matchHttpReadRoutes(path);

      if (tokensMatch) {
        if (!params.managedAuthStore) {
          return completeJsonResponse(
            503,
            toErrorEnvelope(
              new ApiError({
                code: "repository.unavailable",
                message: "Managed auth store is unavailable.",
                status: 503,
              }),
            ),
          );
        }

        if (!(auth.context.role === "admin" || auth.context.role === "local-admin")) {
          return completeJsonResponse(
            403,
            toErrorEnvelope(
              new ApiError({
                code: "auth.forbidden",
                message: "Admin authority is required.",
                status: 403,
              }),
            ),
          );
        }

        const tokens = await params.managedAuthStore.listTokens({ logger: requestLogger });
        return completeJsonResponse(200, { tokens });
      }

      if (booksMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const response = await params.service.getBooks({
          auth: auth.context,
          logger: requestLogger,
        });
        return completeJsonResponse(response.status, response.body);
      }

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
          ...mutationPrecondition,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (transactionsMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(transactionsMatch[1]);

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

        const query = validateGetTransactionsQuery({
          accountId: url.searchParams.get("accountId"),
          cursor: url.searchParams.get("cursor"),
          from: url.searchParams.get("from"),
          limit: url.searchParams.get("limit"),
          status: url.searchParams.get("status"),
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

        const response = await params.service.getTransactions({
          auth: auth.context,
          logger: requestLogger,
          payload: query.value,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (attachmentDownloadMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.read);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(attachmentDownloadMatch[1]);
        const attachmentId = decodeURIComponent(attachmentDownloadMatch[2]);

        if (!isSafeBookId(bookId) || !/^[a-zA-Z0-9:_-]+$/.test(attachmentId)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "repository.invalid_identifier",
                message: "Workspace or attachment identifier is invalid.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.getAttachment({
          attachmentId,
          auth: auth.context,
          logger: requestLogger,
          ...mutationPrecondition,
          bookId,
        });

        if ("error" in response.body) {
          return completeJsonResponse(response.status, response.body);
        }

        return completeBinaryResponse(response.status, response.body.bytes, {
          "content-disposition": `attachment; filename="${response.body.attachment.fileName.replace(/"/g, "")}"`,
          "content-type": response.body.attachment.contentType,
        });
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
        booksCreateMatch,
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
        restoreTransactionMatch,
        scheduleMatch,
        statementImportMatch,
        attachmentUploadMatch,
        transactionAttachmentLinkMatch,
        transactionMatch,
        tokensCreateMatch,
        sessionsExchangeMatch,
      } = matchHttpPostRoutes(path);

      const idempotencyKey = request.headers.get("idempotency-key")?.trim();
      const idempotencyEligibleRoute =
        booksCreateMatch !== null ||
        accountMatch !== null ||
        approvalGrantMatch !== null ||
        approvalDenyMatch !== null ||
        approvalRequestMatch !== null ||
        backupRestoreMatch !== null ||
        backupsCreateMatch !== null ||
        budgetLineMatch !== null ||
        closePeriodMatch !== null ||
        csvImportMatch !== null ||
        envelopeAllocationMatch !== null ||
        envelopeMatch !== null ||
        exceptionScheduleMatch !== null ||
        executeScheduleMatch !== null ||
        gnucashXmlImportMatch !== null ||
        householdMemberMatch !== null ||
        qifImportMatch !== null ||
        reconciliationMatch !== null ||
        restoreTransactionMatch !== null ||
        scheduleMatch !== null ||
        statementImportMatch !== null ||
        attachmentUploadMatch !== null ||
        transactionAttachmentLinkMatch !== null ||
        transactionMatch !== null ||
        tokensCreateMatch !== null ||
        sessionsExchangeMatch !== null;
      if (idempotencyKey && params.idempotencyStore && idempotencyEligibleRoute) {
        const requestBodyBytes = new Uint8Array(await request.clone().arrayBuffer());
        const requestHash = buildIdempotencyRequestHash({
          contentType: request.headers.get("content-type"),
          method: request.method,
          path: route,
          requestBodyBytes,
        });
        const scopedBookId =
          booksCreateMatch?.[1] ??
          accountMatch?.[1] ??
          approvalGrantMatch?.[1] ??
          approvalDenyMatch?.[1] ??
          approvalRequestMatch?.[1] ??
          backupRestoreMatch?.[1] ??
          backupsCreateMatch?.[1] ??
          budgetLineMatch?.[1] ??
          closePeriodMatch?.[1] ??
          csvImportMatch?.[1] ??
          envelopeAllocationMatch?.[1] ??
          envelopeMatch?.[1] ??
          exceptionScheduleMatch?.[1] ??
          executeScheduleMatch?.[1] ??
          gnucashXmlImportMatch?.[1] ??
          householdMemberMatch?.[1] ??
          qifImportMatch?.[1] ??
          reconciliationMatch?.[1] ??
          restoreTransactionMatch?.[1] ??
          scheduleMatch?.[1] ??
          statementImportMatch?.[1] ??
          attachmentUploadMatch?.[1] ??
          transactionAttachmentLinkMatch?.[1] ??
          transactionMatch?.[1];
        const scopeKey = `${auth.context.actor}:${route}:${scopedBookId ?? "global"}:${idempotencyKey}`;
        const beginResult = await params.idempotencyStore.begin({
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          requestHash,
          scopeKey,
        });

        if (beginResult.kind === "hash_conflict") {
          return completeJsonResponse(
            409,
            toErrorEnvelope(
              new ApiError({
                code: "request.idempotency_conflict",
                message: "Idempotency key is already used with a different request payload.",
                status: 409,
              }),
            ),
          );
        }

        if (beginResult.kind === "in_progress") {
          return completeJsonResponse(
            409,
            toErrorEnvelope(
              new ApiError({
                code: "request.idempotency_in_progress",
                message: "A request with this idempotency key is already in progress.",
                status: 409,
              }),
            ),
          );
        }

        if (beginResult.kind === "replay") {
          return completeJsonResponse(
            beginResult.response.status,
            beginResult.response.body,
            beginResult.response.headers,
          );
        }

        activeIdempotencyScopeKey = scopeKey;
      } else {
        activeIdempotencyScopeKey = undefined;
      }

      let body: unknown;

      if (attachmentUploadMatch === null) {
        const parsedPostBody = await parsePostRequestBody({
          bodylessPostRoute,
          maxBodyBytes,
          request,
          requestLogger,
        });
        body = parsedPostBody.body;

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
      }

      if (tokensCreateMatch) {
        if (!params.managedAuthStore) {
          return completeJsonResponse(
            503,
            toErrorEnvelope(
              new ApiError({
                code: "repository.unavailable",
                message: "Managed auth store is unavailable.",
                status: 503,
              }),
            ),
          );
        }

        if (!(auth.context.role === "admin" || auth.context.role === "local-admin")) {
          return completeJsonResponse(
            403,
            toErrorEnvelope(
              new ApiError({
                code: "auth.forbidden",
                message: "Admin authority is required.",
                status: 403,
              }),
            ),
          );
        }

        if (!body || typeof body !== "object" || !("payload" in (body as Record<string, unknown>))) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: ["payload is required."] },
                message: "payload is required.",
                status: 400,
              }),
            ),
          );
        }

        const payload = (body as { payload: Record<string, unknown> }).payload;
        if (typeof payload.actor !== "string" || payload.actor.trim().length === 0) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: ["payload.actor is required."] },
                message: "payload.actor is required.",
                status: 400,
              }),
            ),
          );
        }
        const role = payload.role === "admin" ? "admin" : payload.role === "member" ? "member" : undefined;
        if (!role) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: ["payload.role must be admin or member."] },
                message: "payload.role must be admin or member.",
                status: 400,
              }),
            ),
          );
        }

        const created = await params.managedAuthStore.issueToken(
          {
            actor: payload.actor,
            createdBy: auth.context.actor,
            role,
          },
          { logger: requestLogger },
        );
        return completeJsonResponse(201, { token: created.token, secret: created.secret });
      }

      if (sessionsExchangeMatch) {
        if (!params.managedAuthStore) {
          return completeJsonResponse(
            503,
            toErrorEnvelope(
              new ApiError({
                code: "repository.unavailable",
                message: "Managed auth store is unavailable.",
                status: 503,
              }),
            ),
          );
        }

        if (auth.context.kind !== "managed-token") {
          return completeJsonResponse(
            403,
            toErrorEnvelope(
              new ApiError({
                code: "auth.forbidden",
                message: "Session exchange requires a managed API token.",
                status: 403,
              }),
            ),
          );
        }

        const exchanged = await params.managedAuthStore.exchangeSession(
          { tokenId: auth.context.tokenId },
          { logger: requestLogger },
        );
        return completeJsonResponse(201, { session: exchanged.session, secret: exchanged.secret });
      }

      if (booksCreateMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const parsed = validatePostBookRequestBody(body);

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

        const response = await params.service.postBook({
          auth: auth.context,
          logger: requestLogger,
          payload: parsed.value.payload,
        });
        return completeJsonResponse(response.status, response.body);
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
          ...mutationPrecondition,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (restoreTransactionMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(restoreTransactionMatch[1]);
        const transactionId = decodeURIComponent(restoreTransactionMatch[2]);

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

        const response = await params.service.restoreTransaction({
          auth: auth.context,
          logger: requestLogger,
          transactionId,
          ...mutationPrecondition,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }

      if (attachmentUploadMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(attachmentUploadMatch[1]);

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

        if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
          return completeJsonResponse(
            415,
            toErrorEnvelope(
              new ApiError({
                code: "request.unsupported_media_type",
                message: "Attachment uploads must use multipart/form-data.",
                status: 415,
              }),
            ),
          );
        }

        const formData = await request.formData();
        const file = formData.get("file");

        if (!(file instanceof File)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "validation.failed",
                details: { issues: ["file is required."] },
                message: "file is required.",
                status: 400,
              }),
            ),
          );
        }

        const arrayBuffer = await file.arrayBuffer();
        if (arrayBuffer.byteLength > maxBodyBytes) {
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

        const response = await params.service.postAttachment({
          auth: auth.context,
          logger: requestLogger,
          payload: {
            bytes: new Uint8Array(arrayBuffer),
            contentType: file.type || "application/octet-stream",
            fileName: file.name,
            sizeBytes: file.size,
          },
          ...mutationPrecondition,
          bookId,
        });

        return completeJsonResponse(response.status, response.body);
      }

      if (transactionAttachmentLinkMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(transactionAttachmentLinkMatch[1]);
        const transactionId = decodeURIComponent(transactionAttachmentLinkMatch[2]);

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

        const parsed = validateLinkTransactionAttachmentBody(body);

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

        if (!/^[a-zA-Z0-9:_-]+$/.test(parsed.value.attachmentId)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "repository.invalid_identifier",
                message: "Attachment identifier is invalid.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.linkTransactionAttachment({
          attachmentId: parsed.value.attachmentId,
          auth: auth.context,
          logger: requestLogger,
          transactionId,
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
          bookId,
        });
        return completeJsonResponse(response.status, response.body);
      }
    }

    if (request.method === "DELETE") {
      const {
        archiveAccountMatch,
        deleteTransactionMatch,
        destroyTransactionMatch,
        removeHouseholdMemberMatch,
        transactionAttachmentUnlinkMatch,
        tokenDeleteMatch,
        sessionCurrentDeleteMatch,
      } = matchHttpDeleteRoutes(path);

      if (tokenDeleteMatch) {
        if (!params.managedAuthStore) {
          return completeJsonResponse(
            503,
            toErrorEnvelope(
              new ApiError({
                code: "repository.unavailable",
                message: "Managed auth store is unavailable.",
                status: 503,
              }),
            ),
          );
        }
        if (!(auth.context.role === "admin" || auth.context.role === "local-admin")) {
          return completeJsonResponse(
            403,
            toErrorEnvelope(
              new ApiError({
                code: "auth.forbidden",
                message: "Admin authority is required.",
                status: 403,
              }),
            ),
          );
        }
        const tokenId = decodeURIComponent(tokenDeleteMatch[1]);
        const revoked = await params.managedAuthStore.revokeToken(tokenId, { logger: requestLogger });
        if (!revoked) {
          return completeJsonResponse(
            404,
            toErrorEnvelope(
              new ApiError({
                code: "request.not_found",
                message: "Token not found.",
                status: 404,
              }),
            ),
          );
        }
        return completeJsonResponse(200, { token: revoked });
      }

      if (sessionCurrentDeleteMatch) {
        if (!params.managedAuthStore) {
          return completeJsonResponse(
            503,
            toErrorEnvelope(
              new ApiError({
                code: "repository.unavailable",
                message: "Managed auth store is unavailable.",
                status: 503,
              }),
            ),
          );
        }
        if (auth.context.kind !== "session") {
          return completeJsonResponse(
            403,
            toErrorEnvelope(
              new ApiError({
                code: "auth.forbidden",
                message: "Session revocation requires a managed session credential.",
                status: 403,
              }),
            ),
          );
        }
        await params.managedAuthStore.revokeSession(auth.context.sessionId, { logger: requestLogger });
        return completeJsonResponse(200, { revoked: true });
      }

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
          ...mutationPrecondition,
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
          ...mutationPrecondition,
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
              ...mutationPrecondition,
              bookId,
            })
          : await params.service.deleteTransaction({
              auth: auth.context,
              logger: requestLogger,
              transactionId,
              ...mutationPrecondition,
              bookId,
            });

        return completeJsonResponse(response.status, response.body);
      }

      if (transactionAttachmentUnlinkMatch) {
        const rateLimited = enforceRateLimit(rateLimitPolicy.mutation);

        if (rateLimited) {
          return completeJsonResponse(
            rateLimited.status,
            await rateLimited.json(),
            Object.fromEntries(rateLimited.headers.entries()),
          );
        }

        const bookId = decodeURIComponent(transactionAttachmentUnlinkMatch[1]);
        const transactionId = decodeURIComponent(transactionAttachmentUnlinkMatch[2]);
        const attachmentId = decodeURIComponent(transactionAttachmentUnlinkMatch[3]);

        if (!isSafeBookId(bookId) || !/^[a-zA-Z0-9:_-]+$/.test(transactionId) || !/^[a-zA-Z0-9:_-]+$/.test(attachmentId)) {
          return completeJsonResponse(
            400,
            toErrorEnvelope(
              new ApiError({
                code: "repository.invalid_identifier",
                message: "Workspace, transaction, or attachment identifier is invalid.",
                status: 400,
              }),
            ),
          );
        }

        const response = await params.service.unlinkTransactionAttachment({
          attachmentId,
          auth: auth.context,
          logger: requestLogger,
          transactionId,
          ...mutationPrecondition,
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
