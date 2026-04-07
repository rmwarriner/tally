import { buildOperationalWorkspaceView, type FinanceWorkspaceDocument } from "@tally/workspace";
import type { Logger } from "@tally/logging";
import type { ServiceResponse, WorkspaceEnvelope } from "./types";
import { authorizeWorkspaceAccess, type AuthContext, type AuthorizationResult, type WorkspaceAccess } from "./auth";
import { ApiError, toApiError, toErrorEnvelope, type ErrorEnvelope } from "./errors";
import type { WorkspaceRepository } from "./repository";

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
    grantedBy: "local-admin" | "workspace-role";
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
 * The execute callback receives an authorized workspace and the authorization result.
 * Returns early with a 403 if authorization fails, or maps thrown errors to ApiErrors.
 */
export async function withWorkspace<T>(
  params: {
    access: WorkspaceAccess;
    auth: AuthContext;
    logger: Logger;
    repository: WorkspaceRepository;
    workspaceId: string;
  },
  execute: (workspace: FinanceWorkspaceDocument, authorization: AuthorizationResult) => Promise<ServiceResponse<T>>,
): Promise<ServiceResponse<T | ErrorEnvelope>> {
  try {
    const workspace = await params.repository.load(params.workspaceId, { logger: params.logger });
    const authorization = authorizeWorkspaceAccess(workspace, params.auth, params.access);

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

    return await execute(workspace, authorization);
  } catch (error) {
    const apiError = toApiError(error);
    params.logger.error("service command failed", {
      error: apiError.message,
      errorCode: apiError.code,
    });
    return failure(apiError);
  }
}

type WorkspaceOperationResult = {
  document: FinanceWorkspaceDocument;
  errors: string[];
  ok: boolean;
};

type AuditContext = ReturnType<typeof buildAuthorizationAuditContext>;

/**
 * Handles the standard mutation pattern: load → authorize → execute domain op →
 * validate result → save → return workspace envelope.
 * The execute callback receives the workspace and a pre-built audit context.
 * Always returns { workspace: <operational view> } on success.
 */
export async function withMutation(
  params: {
    access: WorkspaceAccess;
    auth: AuthContext;
    logger: Logger;
    repository: WorkspaceRepository;
    successStatus: number;
    workspaceId: string;
  },
  execute: (workspace: FinanceWorkspaceDocument, audit: AuditContext) => WorkspaceOperationResult,
): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>> {
  return withWorkspace<WorkspaceEnvelope | ErrorEnvelope>(params, async (workspace, authorization) => {
    const audit = buildAuthorizationAuditContext(params.auth.actor, authorization);
    const result = execute(workspace, audit);

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

    await params.repository.save(result.document, { logger: params.logger });
    params.logger.info("service command completed");
    return success(params.successStatus, { workspace: buildOperationalWorkspaceView(result.document) });
  });
}
