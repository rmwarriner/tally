import { buildOperationalBookView, type FinanceBookDocument } from "@tally/book";
import type { Logger } from "@tally/logging";
import type { ServiceResponse, BookEnvelope } from "./types";
import { authorizeBookAccess, type AuthContext, type AuthorizationResult, type BookAccess } from "./auth";
import { ApiError, toApiError, toErrorEnvelope, type ErrorEnvelope } from "./errors";
import type { BookRepository } from "./repository";

export function success<TBody>(status: number, body: TBody): ServiceResponse<TBody> {
  return { body, status };
}

export function failure(error: ApiError): ServiceResponse<ErrorEnvelope> {
  return { body: toErrorEnvelope(error), status: error.status };
}

export function buildAuthorizationAuditContext(
  actor: string,
  authorization: AuthorizationResult,
): {
  actor: string;
  actorRole?: "admin" | "guardian" | "local-admin" | "member";
  authorization?: {
    access: string;
    effectiveRole: string;
    grantedBy: "local-admin" | "book-role";
  };
} {
  const decision = authorization.decision;

  if (!decision) {
    return { actor };
  }

  return {
    actor,
    actorRole: decision.effectiveRole,
    authorization: {
      access: decision.access,
      effectiveRole: decision.effectiveRole,
      grantedBy: decision.grantedBy,
    },
  };
}

/**
 * Handles load → authorize → execute → catch scaffolding for any service operation.
 * The execute callback receives an authorized book and the authorization result.
 * Returns early with a 403 if authorization fails, or maps thrown errors to ApiErrors.
 */
export async function withWorkspace<T>(
  params: {
    access: BookAccess;
    auth: AuthContext;
    logger: Logger;
    repository: BookRepository;
    bookId: string;
  },
  execute: (book: FinanceBookDocument, authorization: AuthorizationResult) => Promise<ServiceResponse<T>>,
): Promise<ServiceResponse<T | ErrorEnvelope>> {
  try {
    const book = await params.repository.load(params.bookId, { logger: params.logger });
    const authorization = authorizeBookAccess(book, params.auth, params.access);

    if (!authorization.ok) {
      params.logger.warn("service command authorization failed", { errors: [authorization.error] });
      return failure(
        new ApiError({
          code: "auth.forbidden",
          message: authorization.error ?? "Forbidden.",
          status: 403,
        }),
      );
    }

    return await execute(book, authorization);
  } catch (error) {
    const apiError = toApiError(error);
    params.logger.error("service command failed", {
      error: apiError.message,
      errorCode: apiError.code,
    });
    return failure(apiError);
  }
}

type BookOperationResult = {
  document: FinanceBookDocument;
  errors: string[];
  ok: boolean;
};

type AuditContext = ReturnType<typeof buildAuthorizationAuditContext>;

/**
 * Handles the standard mutation pattern: load → authorize → execute domain op →
 * validate result → save → return book envelope.
 * The execute callback receives the book and a pre-built audit context.
 * Always returns { book: <operational view> } on success.
 */
export async function withMutation(
  params: {
    access: BookAccess;
    auth: AuthContext;
    expectedVersion?: number;
    logger: Logger;
    repository: BookRepository;
    successStatus: number;
    bookId: string;
  },
  execute: (book: FinanceBookDocument, audit: AuditContext) => BookOperationResult,
): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>> {
  return withWorkspace<BookEnvelope | ErrorEnvelope>(params, async (book, authorization) => {
    if (params.expectedVersion !== undefined && params.expectedVersion !== book.version) {
      return failure(
        new ApiError({
          code: "request.version_conflict",
          details: {
            expectedVersion: book.version,
            providedVersion: params.expectedVersion,
          },
          message: "Book version conflict.",
          status: 409,
        }),
      );
    }

    const audit = buildAuthorizationAuditContext(params.auth.actor, authorization);
    const result = execute(book, audit);

    if (!result.ok) {
      params.logger.warn("service command validation failed", { errors: result.errors });
      return failure(
        new ApiError({
          code: "validation.failed",
          details: { issues: result.errors },
          message: result.errors[0] ?? "Request validation failed.",
          status: 422,
        }),
      );
    }

    await params.repository.save(result.document, {
      expectedVersion: book.version,
      logger: params.logger,
    });
    const savedBook = await params.repository.load(result.document.id, { logger: params.logger });
    params.logger.info("service command completed");
    return success(params.successStatus, { book: buildOperationalBookView(savedBook) });
  });
}
