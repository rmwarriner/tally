import { createNoopLogger, type Logger } from "@gnucash-ng/logging";
import {
  addTransaction,
  applyScheduledTransactionException,
  buildDashboardSnapshot,
  buildQifExport,
  executeScheduledTransaction,
  importTransactionsFromCsvRows,
  importTransactionsFromQif,
  reconcileAccount,
  recordEnvelopeAllocation,
  upsertBaselineBudgetLine,
  upsertEnvelope,
  upsertScheduledTransaction,
  updateTransaction,
  type FinanceWorkspaceDocument,
} from "@gnucash-ng/workspace";
import type {
  ErrorEnvelope,
  ApplyScheduledTransactionExceptionRequest,
  ExecuteScheduledTransactionRequest,
  GetDashboardRequest,
  GetQifExportRequest,
  GetWorkspaceRequest,
  PostBaselineBudgetLineRequest,
  PostCsvImportRequest,
  PostEnvelopeAllocationRequest,
  PostEnvelopeRequest,
  PostQifImportRequest,
  PostReconciliationRequest,
  PostScheduledTransactionRequest,
  PostTransactionRequest,
  ServiceResponse,
  UpdateTransactionRequest,
  DashboardEnvelope,
  QifExportEnvelope,
  WorkspaceEnvelope,
} from "./types";
import { authorizeWorkspaceAccess } from "./auth";
import { ApiError, toApiError, toErrorEnvelope } from "./errors";
import type { WorkspaceRepository } from "./repository";

export interface WorkspaceService {
  getDashboard(request: GetDashboardRequest): Promise<ServiceResponse<DashboardEnvelope | ErrorEnvelope>>;
  getQifExport(request: GetQifExportRequest): Promise<ServiceResponse<QifExportEnvelope | ErrorEnvelope>>;
  getWorkspace(request: GetWorkspaceRequest): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  postCsvImport(
    request: PostCsvImportRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  postQifImport(
    request: PostQifImportRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  executeScheduledTransaction(
    request: ExecuteScheduledTransactionRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  applyScheduledTransactionException(
    request: ApplyScheduledTransactionExceptionRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  postBaselineBudgetLine(
    request: PostBaselineBudgetLineRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  postEnvelope(
    request: PostEnvelopeRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  postEnvelopeAllocation(
    request: PostEnvelopeAllocationRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  postReconciliation(
    request: PostReconciliationRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  postScheduledTransaction(
    request: PostScheduledTransactionRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  postTransaction(
    request: PostTransactionRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  updateTransaction(
    request: UpdateTransactionRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
}

function success<TBody>(status: number, body: TBody): ServiceResponse<TBody> {
  return { body, status };
}

function failure(error: ApiError): ServiceResponse<ErrorEnvelope> {
  return { body: toErrorEnvelope(error), status: error.status };
}

export function createWorkspaceService(params: {
  logger?: Logger;
  repository: WorkspaceRepository;
}): WorkspaceService {
  const logger = (params.logger ?? createNoopLogger()).child({ component: "workspaceService" });

  function getRequestLogger(requestLogger?: Logger): Logger {
    return requestLogger ?? logger;
  }

  async function loadWorkspace(workspaceId: string, requestLogger?: Logger): Promise<FinanceWorkspaceDocument> {
    return params.repository.load(workspaceId, { logger: getRequestLogger(requestLogger) });
  }

  async function saveWorkspace(document: FinanceWorkspaceDocument, requestLogger?: Logger): Promise<void> {
    await params.repository.save(document, { logger: getRequestLogger(requestLogger) });
  }

  return {
    async getWorkspace(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "getWorkspace",
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");

      try {
        const workspace = await loadWorkspace(request.workspaceId, requestLogger);
        const authorization = authorizeWorkspaceAccess(workspace, request.auth, "read");

        if (!authorization.ok) {
          requestLogger.warn("service command authorization failed", { errors: [authorization.error] });
          return failure(
            new ApiError({
              code: "auth.forbidden",
              message: authorization.error ?? "Forbidden.",
              status: 403,
            }),
          );
        }
        requestLogger.info("service command completed");

        return success(200, { workspace });
      } catch (error) {
        const apiError = toApiError(error);
        requestLogger.error("service command failed", {
          error: apiError.message,
          errorCode: apiError.code,
        });
        return failure(apiError);
      }
    },

    async getDashboard(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        from: request.from,
        operation: "getDashboard",
        to: request.to,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");

      try {
        const workspace = await loadWorkspace(request.workspaceId, requestLogger);
        const authorization = authorizeWorkspaceAccess(workspace, request.auth, "read");

        if (!authorization.ok) {
          requestLogger.warn("service command authorization failed", { errors: [authorization.error] });
          return failure(
            new ApiError({
              code: "auth.forbidden",
              message: authorization.error ?? "Forbidden.",
              status: 403,
            }),
          );
        }
        const dashboard = buildDashboardSnapshot(workspace, {
          from: request.from,
          to: request.to,
        });

        requestLogger.info("service command completed");
        return success(200, { dashboard });
      } catch (error) {
        const apiError = toApiError(error);
        requestLogger.error("service command failed", {
          error: apiError.message,
          errorCode: apiError.code,
        });
        return failure(apiError);
      }
    },

    async getQifExport(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        accountId: request.accountId,
        from: request.from,
        operation: "getQifExport",
        to: request.to,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");

      try {
        const workspace = await loadWorkspace(request.workspaceId, requestLogger);
        const authorization = authorizeWorkspaceAccess(workspace, request.auth, "read");

        if (!authorization.ok) {
          requestLogger.warn("service command authorization failed", { errors: [authorization.error] });
          return failure(
            new ApiError({
              code: "auth.forbidden",
              message: authorization.error ?? "Forbidden.",
              status: 403,
            }),
          );
        }

        const exportResult = buildQifExport({
          accountId: request.accountId,
          from: request.from,
          to: request.to,
          workspace,
        });

        requestLogger.info("service command completed", {
          transactionCount: exportResult.transactionCount,
        });
        return success(200, {
          export: {
            contents: exportResult.contents,
            fileName: exportResult.fileName,
            format: "qif",
            transactionCount: exportResult.transactionCount,
          },
        });
      } catch (error) {
        const apiError = toApiError(error);
        requestLogger.error("service command failed", {
          error: apiError.message,
          errorCode: apiError.code,
        });
        return failure(apiError);
      }
    },

    async postTransaction(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "postTransaction",
        transactionId: request.transaction.id,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");

      try {
        const workspace = await loadWorkspace(request.workspaceId, requestLogger);
        const authorization = authorizeWorkspaceAccess(workspace, request.auth, "write");

        if (!authorization.ok) {
          requestLogger.warn("service command authorization failed", { errors: [authorization.error] });
          return failure(
            new ApiError({
              code: "auth.forbidden",
              message: authorization.error ?? "Forbidden.",
              status: 403,
            }),
          );
        }
        const result = addTransaction(workspace, request.transaction, {
          audit: {
            actor: request.auth.actor,
          },
          logger: requestLogger,
        });

        if (!result.ok) {
          requestLogger.warn("service command validation failed", { errors: result.errors });
          return failure(
            new ApiError({
              code: "validation.failed",
              details: { issues: result.errors },
              message: result.errors[0] ?? "Request validation failed.",
              status: 422,
            }),
          );
        }

        await saveWorkspace(result.document, requestLogger);
        requestLogger.info("service command completed");
        return success(201, { workspace: result.document });
      } catch (error) {
        const apiError = toApiError(error);
        requestLogger.error("service command failed", {
          error: apiError.message,
          errorCode: apiError.code,
        });
        return failure(apiError);
      }
    },

    async postQifImport(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        batchId: request.payload.batchId,
        operation: "postQifImport",
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");

      try {
        const workspace = await loadWorkspace(request.workspaceId, requestLogger);
        const authorization = authorizeWorkspaceAccess(workspace, request.auth, "write");

        if (!authorization.ok) {
          requestLogger.warn("service command authorization failed", { errors: [authorization.error] });
          return failure(
            new ApiError({
              code: "auth.forbidden",
              message: authorization.error ?? "Forbidden.",
              status: 403,
            }),
          );
        }

        const result = importTransactionsFromQif(workspace, request.payload, {
          audit: {
            actor: request.auth.actor,
          },
          logger: requestLogger,
        });

        if (!result.ok) {
          requestLogger.warn("service command validation failed", { errors: result.errors });
          return failure(
            new ApiError({
              code: "validation.failed",
              details: { issues: result.errors },
              message: result.errors[0] ?? "Request validation failed.",
              status: 422,
            }),
          );
        }

        await saveWorkspace(result.document, requestLogger);
        requestLogger.info("service command completed");
        return success(201, { workspace: result.document });
      } catch (error) {
        const apiError = toApiError(error);
        requestLogger.error("service command failed", {
          error: apiError.message,
          errorCode: apiError.code,
        });
        return failure(apiError);
      }
    },

    async updateTransaction(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "updateTransaction",
        transactionId: request.transactionId,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");

      try {
        const workspace = await loadWorkspace(request.workspaceId, requestLogger);
        const authorization = authorizeWorkspaceAccess(workspace, request.auth, "write");

        if (!authorization.ok) {
          requestLogger.warn("service command authorization failed", { errors: [authorization.error] });
          return failure(
            new ApiError({
              code: "auth.forbidden",
              message: authorization.error ?? "Forbidden.",
              status: 403,
            }),
          );
        }

        const result = updateTransaction(workspace, request.transactionId, request.transaction, {
          audit: {
            actor: request.auth.actor,
          },
          logger: requestLogger,
        });

        if (!result.ok) {
          requestLogger.warn("service command validation failed", { errors: result.errors });
          return failure(
            new ApiError({
              code: "validation.failed",
              details: { issues: result.errors },
              message: result.errors[0] ?? "Request validation failed.",
              status: 422,
            }),
          );
        }

        await saveWorkspace(result.document, requestLogger);
        requestLogger.info("service command completed");
        return success(200, { workspace: result.document });
      } catch (error) {
        const apiError = toApiError(error);
        requestLogger.error("service command failed", {
          error: apiError.message,
          errorCode: apiError.code,
        });
        return failure(apiError);
      }
    },

    async executeScheduledTransaction(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        occurredOn: request.payload.occurredOn,
        operation: "executeScheduledTransaction",
        scheduleId: request.scheduleId,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");

      try {
        const workspace = await loadWorkspace(request.workspaceId, requestLogger);
        const authorization = authorizeWorkspaceAccess(workspace, request.auth, "write");

        if (!authorization.ok) {
          requestLogger.warn("service command authorization failed", { errors: [authorization.error] });
          return failure(
            new ApiError({
              code: "auth.forbidden",
              message: authorization.error ?? "Forbidden.",
              status: 403,
            }),
          );
        }

        const result = executeScheduledTransaction(
          workspace,
          {
            occurredOn: request.payload.occurredOn,
            scheduleId: request.scheduleId,
            transactionId: request.payload.transactionId,
          },
          {
            audit: {
              actor: request.auth.actor,
            },
            logger: requestLogger,
          },
        );

        if (!result.ok) {
          requestLogger.warn("service command validation failed", { errors: result.errors });
          return failure(
            new ApiError({
              code: "validation.failed",
              details: { issues: result.errors },
              message: result.errors[0] ?? "Request validation failed.",
              status: 422,
            }),
          );
        }

        await saveWorkspace(result.document, requestLogger);
        requestLogger.info("service command completed");
        return success(201, { workspace: result.document });
      } catch (error) {
        const apiError = toApiError(error);
        requestLogger.error("service command failed", {
          error: apiError.message,
          errorCode: apiError.code,
        });
        return failure(apiError);
      }
    },

    async applyScheduledTransactionException(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        action: request.payload.action,
        operation: "applyScheduledTransactionException",
        scheduleId: request.scheduleId,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");

      try {
        const workspace = await loadWorkspace(request.workspaceId, requestLogger);
        const authorization = authorizeWorkspaceAccess(workspace, request.auth, "write");

        if (!authorization.ok) {
          requestLogger.warn("service command authorization failed", { errors: [authorization.error] });
          return failure(
            new ApiError({
              code: "auth.forbidden",
              message: authorization.error ?? "Forbidden.",
              status: 403,
            }),
          );
        }

        const result = applyScheduledTransactionException(
          workspace,
          {
            action: request.payload.action,
            effectiveOn: request.payload.effectiveOn,
            nextDueOn: request.payload.nextDueOn,
            note: request.payload.note,
            scheduleId: request.scheduleId,
          },
          {
            audit: {
              actor: request.auth.actor,
            },
            logger: requestLogger,
          },
        );

        if (!result.ok) {
          requestLogger.warn("service command validation failed", { errors: result.errors });
          return failure(
            new ApiError({
              code: "validation.failed",
              details: { issues: result.errors },
              message: result.errors[0] ?? "Request validation failed.",
              status: 422,
            }),
          );
        }

        await saveWorkspace(result.document, requestLogger);
        requestLogger.info("service command completed");
        return success(200, { workspace: result.document });
      } catch (error) {
        const apiError = toApiError(error);
        requestLogger.error("service command failed", {
          error: apiError.message,
          errorCode: apiError.code,
        });
        return failure(apiError);
      }
    },

    async postReconciliation(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        accountId: request.payload.accountId,
        operation: "postReconciliation",
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");

      try {
        const workspace = await loadWorkspace(request.workspaceId, requestLogger);
        const authorization = authorizeWorkspaceAccess(workspace, request.auth, "write");

        if (!authorization.ok) {
          requestLogger.warn("service command authorization failed", { errors: [authorization.error] });
          return failure(
            new ApiError({
              code: "auth.forbidden",
              message: authorization.error ?? "Forbidden.",
              status: 403,
            }),
          );
        }
        const result = reconcileAccount(workspace, request.payload, {
          audit: {
            actor: request.auth.actor,
          },
          logger: requestLogger,
        });

        if (!result.ok && result.document === workspace) {
          requestLogger.warn("service command validation failed", { errors: result.errors });
          return failure(
            new ApiError({
              code: "validation.failed",
              details: { issues: result.errors },
              message: result.errors[0] ?? "Request validation failed.",
              status: 422,
            }),
          );
        }

        await saveWorkspace(result.document, requestLogger);
        requestLogger.info("service command completed", { warnings: result.errors });
        return success(200, { workspace: result.document });
      } catch (error) {
        const apiError = toApiError(error);
        requestLogger.error("service command failed", {
          error: apiError.message,
          errorCode: apiError.code,
        });
        return failure(apiError);
      }
    },

    async postCsvImport(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        batchId: request.payload.batchId,
        operation: "postCsvImport",
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");

      try {
        const workspace = await loadWorkspace(request.workspaceId, requestLogger);
        const authorization = authorizeWorkspaceAccess(workspace, request.auth, "write");

        if (!authorization.ok) {
          requestLogger.warn("service command authorization failed", { errors: [authorization.error] });
          return failure(
            new ApiError({
              code: "auth.forbidden",
              message: authorization.error ?? "Forbidden.",
              status: 403,
            }),
          );
        }
        const result = importTransactionsFromCsvRows(
          workspace,
          request.payload.rows,
          {
            batchId: request.payload.batchId,
            importedAt: request.payload.importedAt,
            sourceLabel: request.payload.sourceLabel,
          },
          {
            audit: {
              actor: request.auth.actor,
            },
            logger: requestLogger,
          },
        );

        if (!result.ok) {
          requestLogger.warn("service command validation failed", { errors: result.errors });
          return failure(
            new ApiError({
              code: "validation.failed",
              details: { issues: result.errors },
              message: result.errors[0] ?? "Request validation failed.",
              status: 422,
            }),
          );
        }

        await saveWorkspace(result.document, requestLogger);
        requestLogger.info("service command completed");
        return success(200, { workspace: result.document });
      } catch (error) {
        const apiError = toApiError(error);
        requestLogger.error("service command failed", {
          error: apiError.message,
          errorCode: apiError.code,
        });
        return failure(apiError);
      }
    },

    async postBaselineBudgetLine(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        accountId: request.line.accountId,
        operation: "postBaselineBudgetLine",
        period: request.line.period,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");

      try {
        const workspace = await loadWorkspace(request.workspaceId, requestLogger);
        const authorization = authorizeWorkspaceAccess(workspace, request.auth, "write");

        if (!authorization.ok) {
          requestLogger.warn("service command authorization failed", { errors: [authorization.error] });
          return failure(
            new ApiError({
              code: "auth.forbidden",
              message: authorization.error ?? "Forbidden.",
              status: 403,
            }),
          );
        }

        const result = upsertBaselineBudgetLine(workspace, request.line, {
          audit: { actor: request.auth.actor },
          logger: requestLogger,
        });

        if (!result.ok) {
          requestLogger.warn("service command validation failed", { errors: result.errors });
          return failure(
            new ApiError({
              code: "validation.failed",
              details: { issues: result.errors },
              message: result.errors[0] ?? "Request validation failed.",
              status: 422,
            }),
          );
        }

        await saveWorkspace(result.document, requestLogger);
        requestLogger.info("service command completed");
        return success(200, { workspace: result.document });
      } catch (error) {
        const apiError = toApiError(error);
        requestLogger.error("service command failed", {
          error: apiError.message,
          errorCode: apiError.code,
        });
        return failure(apiError);
      }
    },

    async postEnvelope(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        envelopeId: request.envelope.id,
        operation: "postEnvelope",
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");

      try {
        const workspace = await loadWorkspace(request.workspaceId, requestLogger);
        const authorization = authorizeWorkspaceAccess(workspace, request.auth, "write");

        if (!authorization.ok) {
          requestLogger.warn("service command authorization failed", { errors: [authorization.error] });
          return failure(
            new ApiError({
              code: "auth.forbidden",
              message: authorization.error ?? "Forbidden.",
              status: 403,
            }),
          );
        }

        const result = upsertEnvelope(workspace, request.envelope, {
          audit: { actor: request.auth.actor },
          logger: requestLogger,
        });

        if (!result.ok) {
          requestLogger.warn("service command validation failed", { errors: result.errors });
          return failure(
            new ApiError({
              code: "validation.failed",
              details: { issues: result.errors },
              message: result.errors[0] ?? "Request validation failed.",
              status: 422,
            }),
          );
        }

        await saveWorkspace(result.document, requestLogger);
        requestLogger.info("service command completed");
        return success(200, { workspace: result.document });
      } catch (error) {
        const apiError = toApiError(error);
        requestLogger.error("service command failed", {
          error: apiError.message,
          errorCode: apiError.code,
        });
        return failure(apiError);
      }
    },

    async postEnvelopeAllocation(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        allocationId: request.allocation.id,
        envelopeId: request.allocation.envelopeId,
        operation: "postEnvelopeAllocation",
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");

      try {
        const workspace = await loadWorkspace(request.workspaceId, requestLogger);
        const authorization = authorizeWorkspaceAccess(workspace, request.auth, "write");

        if (!authorization.ok) {
          requestLogger.warn("service command authorization failed", { errors: [authorization.error] });
          return failure(
            new ApiError({
              code: "auth.forbidden",
              message: authorization.error ?? "Forbidden.",
              status: 403,
            }),
          );
        }

        const result = recordEnvelopeAllocation(workspace, request.allocation, {
          audit: { actor: request.auth.actor },
          logger: requestLogger,
        });

        if (!result.ok) {
          requestLogger.warn("service command validation failed", { errors: result.errors });
          return failure(
            new ApiError({
              code: "validation.failed",
              details: { issues: result.errors },
              message: result.errors[0] ?? "Request validation failed.",
              status: 422,
            }),
          );
        }

        await saveWorkspace(result.document, requestLogger);
        requestLogger.info("service command completed");
        return success(200, { workspace: result.document });
      } catch (error) {
        const apiError = toApiError(error);
        requestLogger.error("service command failed", {
          error: apiError.message,
          errorCode: apiError.code,
        });
        return failure(apiError);
      }
    },

    async postScheduledTransaction(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "postScheduledTransaction",
        scheduleId: request.schedule.id,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");

      try {
        const workspace = await loadWorkspace(request.workspaceId, requestLogger);
        const authorization = authorizeWorkspaceAccess(workspace, request.auth, "write");

        if (!authorization.ok) {
          requestLogger.warn("service command authorization failed", { errors: [authorization.error] });
          return failure(
            new ApiError({
              code: "auth.forbidden",
              message: authorization.error ?? "Forbidden.",
              status: 403,
            }),
          );
        }

        const result = upsertScheduledTransaction(workspace, request.schedule, {
          audit: { actor: request.auth.actor },
          logger: requestLogger,
        });

        if (!result.ok) {
          requestLogger.warn("service command validation failed", { errors: result.errors });
          return failure(
            new ApiError({
              code: "validation.failed",
              details: { issues: result.errors },
              message: result.errors[0] ?? "Request validation failed.",
              status: 422,
            }),
          );
        }

        await saveWorkspace(result.document, requestLogger);
        requestLogger.info("service command completed");
        return success(200, { workspace: result.document });
      } catch (error) {
        const apiError = toApiError(error);
        requestLogger.error("service command failed", {
          error: apiError.message,
          errorCode: apiError.code,
        });
        return failure(apiError);
      }
    },
  };
}
