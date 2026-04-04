import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createNoopLogger, type Logger } from "@gnucash-ng/logging";
import { resolveAuthContext, type AuthIdentity } from "./auth";
import { ApiError, toErrorEnvelope } from "./errors";
import { createInMemoryRateLimiter, type RateLimiter, type RateLimitPolicy } from "./rate-limit";
import type { WorkspaceService } from "./service";
import {
  validateApplyScheduledTransactionExceptionRequestBody,
  validateExecuteScheduledTransactionRequestBody,
  validateBaselineBudgetLineRequestBody,
  validateCsvImportRequestBody,
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
    const requestLogger = logger.child({
      method: request.method,
      path,
    });
    requestLogger.info("http request started");

    const auth = resolveAuthContext({
      apiKeyHeader: request.headers.get("x-gnucash-ng-api-key"),
      authIdentities,
      authRequired,
      authorizationHeader: request.headers.get("authorization"),
    });

    if (!auth.ok || !auth.context) {
      requestLogger.warn("http request authentication failed");
      return jsonResponse(
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

      if (workspaceMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.read, requestLogger);

        if (rateLimited) {
          return rateLimited;
        }

        const workspaceId = decodeURIComponent(workspaceMatch[1]);

        if (!isSafeWorkspaceId(workspaceId)) {
          return jsonResponse(
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
          workspaceId,
        });
        requestLogger.info("http request completed", { status: response.status });
        return jsonResponse(response.status, response.body);
      }

      if (dashboardMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.read, requestLogger);

        if (rateLimited) {
          return rateLimited;
        }

        const workspaceId = decodeURIComponent(dashboardMatch[1]);
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");

        if (!isSafeWorkspaceId(workspaceId)) {
          return jsonResponse(
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
          return jsonResponse(
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
          to,
          workspaceId,
        });
        requestLogger.info("http request completed", { status: response.status });
        return jsonResponse(response.status, response.body);
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

      if (!request.headers.get("content-type")?.includes("application/json")) {
        requestLogger.warn("http request validation failed", {
          errors: ["POST requests must use application/json."],
        });
        return jsonResponse(
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
        return jsonResponse(
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
        return jsonResponse(
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
          return rateLimited;
        }

        const workspaceId = decodeURIComponent(transactionMatch[1]);

        if (!isSafeWorkspaceId(workspaceId)) {
          return jsonResponse(
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
          return jsonResponse(
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
          transaction: payload.value.transaction,
          workspaceId,
        });
        requestLogger.info("http request completed", { status: response.status });
        return jsonResponse(response.status, response.body);
      }

      if (budgetLineMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.mutation, requestLogger);

        if (rateLimited) {
          return rateLimited;
        }

        const workspaceId = decodeURIComponent(budgetLineMatch[1]);

        if (!isSafeWorkspaceId(workspaceId)) {
          return jsonResponse(
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
          return jsonResponse(
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
          workspaceId,
        });
        requestLogger.info("http request completed", { status: response.status });
        return jsonResponse(response.status, response.body);
      }

      if (envelopeMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.mutation, requestLogger);

        if (rateLimited) {
          return rateLimited;
        }

        const workspaceId = decodeURIComponent(envelopeMatch[1]);

        if (!isSafeWorkspaceId(workspaceId)) {
          return jsonResponse(
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
          return jsonResponse(
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
          workspaceId,
        });
        requestLogger.info("http request completed", { status: response.status });
        return jsonResponse(response.status, response.body);
      }

      if (envelopeAllocationMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.mutation, requestLogger);

        if (rateLimited) {
          return rateLimited;
        }

        const workspaceId = decodeURIComponent(envelopeAllocationMatch[1]);

        if (!isSafeWorkspaceId(workspaceId)) {
          return jsonResponse(
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
          return jsonResponse(
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
          workspaceId,
        });
        requestLogger.info("http request completed", { status: response.status });
        return jsonResponse(response.status, response.body);
      }

      if (reconciliationMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.mutation, requestLogger);

        if (rateLimited) {
          return rateLimited;
        }

        const workspaceId = decodeURIComponent(reconciliationMatch[1]);

        if (!isSafeWorkspaceId(workspaceId)) {
          return jsonResponse(
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
          return jsonResponse(
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
          payload: payload.value.payload,
          workspaceId,
        });
        requestLogger.info("http request completed", { status: response.status });
        return jsonResponse(response.status, response.body);
      }

      if (scheduleMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.mutation, requestLogger);

        if (rateLimited) {
          return rateLimited;
        }

        const workspaceId = decodeURIComponent(scheduleMatch[1]);

        if (!isSafeWorkspaceId(workspaceId)) {
          return jsonResponse(
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
          return jsonResponse(
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
          schedule: payload.value.schedule,
          workspaceId,
        });
        requestLogger.info("http request completed", { status: response.status });
        return jsonResponse(response.status, response.body);
      }

      if (executeScheduleMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.mutation, requestLogger);

        if (rateLimited) {
          return rateLimited;
        }

        const workspaceId = decodeURIComponent(executeScheduleMatch[1]);
        const scheduleId = decodeURIComponent(executeScheduleMatch[2]);

        if (!isSafeWorkspaceId(workspaceId) || !/^[a-zA-Z0-9:_-]+$/.test(scheduleId)) {
          return jsonResponse(
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
          return jsonResponse(
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
          payload: payload.value.payload,
          scheduleId,
          workspaceId,
        });
        requestLogger.info("http request completed", { status: response.status });
        return jsonResponse(response.status, response.body);
      }

      if (exceptionScheduleMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.mutation, requestLogger);

        if (rateLimited) {
          return rateLimited;
        }

        const workspaceId = decodeURIComponent(exceptionScheduleMatch[1]);
        const scheduleId = decodeURIComponent(exceptionScheduleMatch[2]);

        if (!isSafeWorkspaceId(workspaceId) || !/^[a-zA-Z0-9:_-]+$/.test(scheduleId)) {
          return jsonResponse(
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
          return jsonResponse(
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
          payload: payload.value.payload,
          scheduleId,
          workspaceId,
        });
        requestLogger.info("http request completed", { status: response.status });
        return jsonResponse(response.status, response.body);
      }

      if (csvImportMatch) {
        const rateLimited = enforceRateLimit(requestKey, rateLimitPolicy.import, requestLogger);

        if (rateLimited) {
          return rateLimited;
        }

        const workspaceId = decodeURIComponent(csvImportMatch[1]);

        if (!isSafeWorkspaceId(workspaceId)) {
          return jsonResponse(
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
          return jsonResponse(
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
          payload: payload.value.payload,
          workspaceId,
        });
        requestLogger.info("http request completed", { status: response.status });
        return jsonResponse(response.status, response.body);
      }
    }

    if (request.method === "PUT") {
      const transactionMatch = path.match(/^\/api\/workspaces\/([^/]+)\/transactions\/([^/]+)$/);

      if (!request.headers.get("content-type")?.includes("application/json")) {
        requestLogger.warn("http request validation failed", {
          errors: ["PUT requests must use application/json."],
        });
        return jsonResponse(
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
        return jsonResponse(
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
        return jsonResponse(
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
          return rateLimited;
        }

        const workspaceId = decodeURIComponent(transactionMatch[1]);
        const transactionId = decodeURIComponent(transactionMatch[2]);

        if (!isSafeWorkspaceId(workspaceId) || !/^[a-zA-Z0-9:_-]+$/.test(transactionId)) {
          return jsonResponse(
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
          return jsonResponse(
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
          transaction: payload.value.transaction,
          transactionId,
          workspaceId,
        });
        requestLogger.info("http request completed", { status: response.status });
        return jsonResponse(response.status, response.body);
      }
    }

    requestLogger.warn("http request route not found");
    return jsonResponse(
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
