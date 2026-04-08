import { createNoopLogger, type Logger } from "@tally/logging";
import {
  addHouseholdMember,
  addTransaction,
  archiveAccount,
  buildOperationalWorkspaceView,
  buildCloseSummary,
  buildGnuCashXmlExport,
  buildOfxExport,
  applyScheduledTransactionException,
  buildDashboardSnapshot,
  buildQifExport,
  buildWorkspaceReport,
  closeWorkspacePeriod,
  deleteTransaction,
  denyApproval,
  destroyTransaction,
  executeScheduledTransaction,
  grantApproval,
  importTransactionsFromCsvRows,
  importTransactionsFromStatement,
  importWorkspaceFromGnuCashXml,
  importTransactionsFromQif,
  reconcileAccount,
  recordEnvelopeAllocation,
  removeHouseholdMember,
  requestApproval,
  setHouseholdMemberRole,
  upsertAccount,
  upsertBaselineBudgetLine,
  upsertEnvelope,
  upsertScheduledTransaction,
  updateTransaction,
} from "@tally/workspace";
import {
  buildAuthorizationAuditContext,
  failure,
  success,
  withMutation,
  withWorkspace,
} from "./service-helpers";
import type {
  AccountsEnvelope,
  AddHouseholdMemberRequest,
  ApprovalsEnvelope,
  ArchiveAccountRequest,
  AuditEventsEnvelope,
  BackupEnvelope,
  BackupsEnvelope,
  DeleteTransactionRequest,
  DenyApprovalRequest,
  DestroyTransactionRequest,
  ErrorEnvelope,
  GetAccountsRequest,
  GetApprovalsRequest,
  GetAuditEventsRequest,
  GetGnuCashXmlExportRequest,
  GetBackupsRequest,
  ApplyScheduledTransactionExceptionRequest,
  CloseSummaryEnvelope,
  ExecuteScheduledTransactionRequest,
  GetCloseSummaryRequest,
  GetDashboardRequest,
  GetHouseholdMembersRequest,
  GetQifExportRequest,
  GetStatementExportRequest,
  GetReportRequest,
  GetWorkspaceRequest,
  GnuCashXmlExportEnvelope,
  GrantApprovalRequest,
  HouseholdMembersEnvelope,
  PostAccountRequest,
  PostBaselineBudgetLineRequest,
  PostBackupRequest,
  PostBackupRestoreRequest,
  PostClosePeriodRequest,
  PostCsvImportRequest,
  PostEnvelopeAllocationRequest,
  PostEnvelopeRequest,
  PostGnuCashXmlImportRequest,
  PostQifImportRequest,
  PostReconciliationRequest,
  PostScheduledTransactionRequest,
  PostStatementImportRequest,
  PostTransactionRequest,
  RemoveHouseholdMemberRequest,
  RequestApprovalRequest,
  ServiceResponse,
  SetHouseholdMemberRoleRequest,
  StatementExportEnvelope,
  UpdateTransactionRequest,
  DashboardEnvelope,
  QifExportEnvelope,
  ReportEnvelope,
  WorkspaceEnvelope,
} from "./types";
import { ApiError, toApiError } from "./errors";
import type { WorkspaceRepository } from "./repository";

export interface WorkspaceService {
  getCloseSummary(
    request: GetCloseSummaryRequest,
  ): Promise<ServiceResponse<CloseSummaryEnvelope | ErrorEnvelope>>;
  getBackups(
    request: GetBackupsRequest,
  ): Promise<ServiceResponse<BackupsEnvelope | ErrorEnvelope>>;
  getGnuCashXmlExport(
    request: GetGnuCashXmlExportRequest,
  ): Promise<ServiceResponse<GnuCashXmlExportEnvelope | ErrorEnvelope>>;
  getDashboard(request: GetDashboardRequest): Promise<ServiceResponse<DashboardEnvelope | ErrorEnvelope>>;
  getQifExport(request: GetQifExportRequest): Promise<ServiceResponse<QifExportEnvelope | ErrorEnvelope>>;
  getStatementExport(
    request: GetStatementExportRequest,
  ): Promise<ServiceResponse<StatementExportEnvelope | ErrorEnvelope>>;
  getReport(request: GetReportRequest): Promise<ServiceResponse<ReportEnvelope | ErrorEnvelope>>;
  getWorkspace(request: GetWorkspaceRequest): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  deleteTransaction(
    request: DeleteTransactionRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  destroyTransaction(
    request: DestroyTransactionRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  postCsvImport(
    request: PostCsvImportRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  postQifImport(
    request: PostQifImportRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  postStatementImport(
    request: PostStatementImportRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  postGnuCashXmlImport(
    request: PostGnuCashXmlImportRequest,
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
  postBackup(
    request: PostBackupRequest,
  ): Promise<ServiceResponse<BackupEnvelope | ErrorEnvelope>>;
  postBackupRestore(
    request: PostBackupRestoreRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  postClosePeriod(
    request: PostClosePeriodRequest,
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
  getHouseholdMembers(
    request: GetHouseholdMembersRequest,
  ): Promise<ServiceResponse<HouseholdMembersEnvelope | ErrorEnvelope>>;
  addHouseholdMember(
    request: AddHouseholdMemberRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  setHouseholdMemberRole(
    request: SetHouseholdMemberRoleRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  removeHouseholdMember(
    request: RemoveHouseholdMemberRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  getAuditEvents(
    request: GetAuditEventsRequest,
  ): Promise<ServiceResponse<AuditEventsEnvelope | ErrorEnvelope>>;
  getApprovals(
    request: GetApprovalsRequest,
  ): Promise<ServiceResponse<ApprovalsEnvelope | ErrorEnvelope>>;
  requestApproval(
    request: RequestApprovalRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  grantApproval(
    request: GrantApprovalRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  denyApproval(
    request: DenyApprovalRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  getAccounts(
    request: GetAccountsRequest,
  ): Promise<ServiceResponse<AccountsEnvelope | ErrorEnvelope>>;
  postAccount(
    request: PostAccountRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
  archiveAccount(
    request: ArchiveAccountRequest,
  ): Promise<ServiceResponse<WorkspaceEnvelope | ErrorEnvelope>>;
}

export function createWorkspaceService(params: {
  logger?: Logger;
  repository: WorkspaceRepository;
}): WorkspaceService {
  const logger = (params.logger ?? createNoopLogger()).child({ component: "workspaceService" });

  function getRequestLogger(requestLogger?: Logger): Logger {
    return requestLogger ?? logger;
  }

  function presentWorkspace(document: ReturnType<typeof buildOperationalWorkspaceView>) {
    return buildOperationalWorkspaceView(document);
  }

  function serviceParams(access: "destroy" | "manage" | "operate" | "read" | "write", auth: Parameters<WorkspaceService["getWorkspace"]>[0]["auth"], requestLogger: Logger, workspaceId: string) {
    return { access, auth, logger: requestLogger, repository: params.repository, workspaceId };
  }

  return {
    // --- Read operations ---

    async getWorkspace(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "getWorkspace",
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withWorkspace(
        serviceParams("read", request.auth, requestLogger, request.workspaceId),
        async (workspace) => {
          requestLogger.info("service command completed");
          return success(200, { workspace: presentWorkspace(workspace) });
        },
      );
    },

    async getDashboard(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        from: request.from,
        operation: "getDashboard",
        to: request.to,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withWorkspace(
        serviceParams("read", request.auth, requestLogger, request.workspaceId),
        async (workspace) => {
          const dashboard = buildDashboardSnapshot(workspace, { from: request.from, to: request.to });
          requestLogger.info("service command completed");
          return success(200, { dashboard });
        },
      );
    },

    async getBackups(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "getBackups",
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withWorkspace(
        serviceParams("read", request.auth, requestLogger, request.workspaceId),
        async () => {
          const backups = await params.repository.listBackups(request.workspaceId, { logger: requestLogger });
          requestLogger.info("service command completed", { backupCount: backups.length });
          return success(200, { backups });
        },
      );
    },

    async getCloseSummary(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        from: request.from,
        operation: "getCloseSummary",
        to: request.to,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withWorkspace(
        serviceParams("read", request.auth, requestLogger, request.workspaceId),
        async (workspace) => {
          const closeSummary = buildCloseSummary(workspace, { from: request.from, to: request.to });
          requestLogger.info("service command completed", { readyToClose: closeSummary.readyToClose });
          return success(200, { closeSummary });
        },
      );
    },

    async getReport(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        from: request.from,
        operation: "getReport",
        reportKind: request.kind,
        to: request.to,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withWorkspace(
        serviceParams("read", request.auth, requestLogger, request.workspaceId),
        async (workspace) => {
          const report = buildWorkspaceReport(workspace, { from: request.from, kind: request.kind, to: request.to });
          requestLogger.info("service command completed");
          return success(200, { report });
        },
      );
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
      return withWorkspace(
        serviceParams("read", request.auth, requestLogger, request.workspaceId),
        async (workspace) => {
          const exportResult = buildQifExport({ accountId: request.accountId, from: request.from, to: request.to, workspace });
          requestLogger.info("service command completed", { transactionCount: exportResult.transactionCount });
          return success(200, {
            export: {
              contents: exportResult.contents,
              fileName: exportResult.fileName,
              format: "qif",
              transactionCount: exportResult.transactionCount,
            },
          });
        },
      );
    },

    async getStatementExport(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        accountId: request.accountId,
        format: request.format,
        from: request.from,
        operation: "getStatementExport",
        to: request.to,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withWorkspace(
        serviceParams("read", request.auth, requestLogger, request.workspaceId),
        async (workspace) => {
          const exportResult = buildOfxExport({ accountId: request.accountId, format: request.format, from: request.from, to: request.to, workspace });
          requestLogger.info("service command completed", { format: request.format, transactionCount: exportResult.transactionCount });
          return success(200, {
            export: {
              contents: exportResult.contents,
              fileName: exportResult.fileName,
              format: request.format,
              transactionCount: exportResult.transactionCount,
            },
          });
        },
      );
    },

    async getGnuCashXmlExport(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "getGnuCashXmlExport",
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withWorkspace(
        serviceParams("read", request.auth, requestLogger, request.workspaceId),
        async (workspace) => {
          const exportResult = buildGnuCashXmlExport({ workspace: presentWorkspace(workspace) });
          requestLogger.info("service command completed");
          return success(200, {
            export: {
              contents: exportResult.contents,
              fileName: exportResult.fileName,
              format: "gnucash-xml",
            },
          });
        },
      );
    },

    // --- Backup operations (repository-level, not domain operations) ---

    async postBackup(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "postBackup",
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withWorkspace(
        serviceParams("operate", request.auth, requestLogger, request.workspaceId),
        async () => {
          const backup = await params.repository.createBackup(request.workspaceId, { logger: requestLogger });
          requestLogger.info("service command completed", { backupId: backup.id });
          return success(201, { backup });
        },
      );
    },

    async postBackupRestore(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        backupId: request.backupId,
        operation: "postBackupRestore",
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withWorkspace(
        serviceParams("operate", request.auth, requestLogger, request.workspaceId),
        async () => {
          const restored = await params.repository.restoreBackup(request.workspaceId, request.backupId, { logger: requestLogger });
          requestLogger.info("service command completed", { backupId: request.backupId });
          return success(200, { workspace: presentWorkspace(restored) });
        },
      );
    },

    // --- Mutation operations ---

    async postTransaction(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "postTransaction",
        transactionId: request.transaction.id,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("write", request.auth, requestLogger, request.workspaceId), successStatus: 201 },
        (workspace, audit) => addTransaction(workspace, request.transaction, { audit, logger: requestLogger }),
      );
    },

    async updateTransaction(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "updateTransaction",
        transactionId: request.transactionId,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("write", request.auth, requestLogger, request.workspaceId), successStatus: 200 },
        (workspace, audit) => updateTransaction(workspace, request.transactionId, request.transaction, { audit, logger: requestLogger }),
      );
    },

    async deleteTransaction(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "deleteTransaction",
        transactionId: request.transactionId,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("write", request.auth, requestLogger, request.workspaceId), successStatus: 200 },
        (workspace, audit) => deleteTransaction(workspace, request.transactionId, {}, { audit, logger: requestLogger }),
      );
    },

    async destroyTransaction(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "destroyTransaction",
        transactionId: request.transactionId,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("destroy", request.auth, requestLogger, request.workspaceId), successStatus: 200 },
        (workspace, audit) => destroyTransaction(workspace, request.transactionId, { audit, logger: requestLogger }),
      );
    },

    async executeScheduledTransaction(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        occurredOn: request.payload.occurredOn,
        operation: "executeScheduledTransaction",
        scheduleId: request.scheduleId,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("write", request.auth, requestLogger, request.workspaceId), successStatus: 201 },
        (workspace, audit) =>
          executeScheduledTransaction(
            workspace,
            { occurredOn: request.payload.occurredOn, scheduleId: request.scheduleId, transactionId: request.payload.transactionId },
            { audit, logger: requestLogger },
          ),
      );
    },

    async applyScheduledTransactionException(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        action: request.payload.action,
        operation: "applyScheduledTransactionException",
        scheduleId: request.scheduleId,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("write", request.auth, requestLogger, request.workspaceId), successStatus: 200 },
        (workspace, audit) =>
          applyScheduledTransactionException(
            workspace,
            { action: request.payload.action, effectiveOn: request.payload.effectiveOn, nextDueOn: request.payload.nextDueOn, note: request.payload.note, scheduleId: request.scheduleId },
            { audit, logger: requestLogger },
          ),
      );
    },

    async postScheduledTransaction(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "postScheduledTransaction",
        scheduleId: request.schedule.id,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("write", request.auth, requestLogger, request.workspaceId), successStatus: 200 },
        (workspace, audit) => upsertScheduledTransaction(workspace, request.schedule, { audit, logger: requestLogger }),
      );
    },

    async postEnvelope(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        envelopeId: request.envelope.id,
        operation: "postEnvelope",
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("write", request.auth, requestLogger, request.workspaceId), successStatus: 200 },
        (workspace, audit) => upsertEnvelope(workspace, request.envelope, { audit, logger: requestLogger }),
      );
    },

    async postEnvelopeAllocation(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        allocationId: request.allocation.id,
        envelopeId: request.allocation.envelopeId,
        operation: "postEnvelopeAllocation",
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("write", request.auth, requestLogger, request.workspaceId), successStatus: 200 },
        (workspace, audit) => recordEnvelopeAllocation(workspace, request.allocation, { audit, logger: requestLogger }),
      );
    },

    async postBaselineBudgetLine(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        accountId: request.line.accountId,
        operation: "postBaselineBudgetLine",
        period: request.line.period,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("write", request.auth, requestLogger, request.workspaceId), successStatus: 200 },
        (workspace, audit) => upsertBaselineBudgetLine(workspace, request.line, { audit, logger: requestLogger }),
      );
    },

    async postClosePeriod(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        from: request.payload.from,
        operation: "postClosePeriod",
        to: request.payload.to,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("operate", request.auth, requestLogger, request.workspaceId), successStatus: 201 },
        (workspace, audit) =>
          closeWorkspacePeriod(
            workspace,
            { ...request.payload, closedBy: request.auth.actor },
            { audit, logger: requestLogger },
          ),
      );
    },

    async postQifImport(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        batchId: request.payload.batchId,
        operation: "postQifImport",
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("operate", request.auth, requestLogger, request.workspaceId), successStatus: 201 },
        (workspace, audit) => importTransactionsFromQif(workspace, request.payload, { audit, logger: requestLogger }),
      );
    },

    async postStatementImport(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        batchId: request.payload.batchId,
        format: request.payload.format,
        operation: "postStatementImport",
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("operate", request.auth, requestLogger, request.workspaceId), successStatus: 201 },
        (workspace, audit) => importTransactionsFromStatement(workspace, request.payload, { audit, logger: requestLogger }),
      );
    },

    async postGnuCashXmlImport(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "postGnuCashXmlImport",
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("operate", request.auth, requestLogger, request.workspaceId), successStatus: 200 },
        (workspace, audit) => importWorkspaceFromGnuCashXml(workspace, request.payload, { audit, logger: requestLogger }),
      );
    },

    async postCsvImport(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        batchId: request.payload.batchId,
        operation: "postCsvImport",
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("operate", request.auth, requestLogger, request.workspaceId), successStatus: 200 },
        (workspace, audit) =>
          importTransactionsFromCsvRows(
            workspace,
            request.payload.rows,
            { batchId: request.payload.batchId, importedAt: request.payload.importedAt, sourceLabel: request.payload.sourceLabel },
            { audit, logger: requestLogger },
          ),
      );
    },

    // postReconciliation has atypical result handling: saves even on partial failures (warnings).
    async postReconciliation(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        accountId: request.payload.accountId,
        operation: "postReconciliation",
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withWorkspace<WorkspaceEnvelope | ErrorEnvelope>(
        serviceParams("write", request.auth, requestLogger, request.workspaceId),
        async (workspace, authorization) => {
          const audit = buildAuthorizationAuditContext(request.auth.actor, authorization);
          const result = reconcileAccount(workspace, request.payload, { audit, logger: requestLogger });

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

          await params.repository.save(result.document, { logger: requestLogger });
          requestLogger.info("service command completed", { warnings: result.errors });
          return success(200, { workspace: presentWorkspace(result.document) });
        },
      );
    },

    // --- Household member management ---

    async getHouseholdMembers(request) {
      const requestLogger = getRequestLogger(request.logger);
      return withWorkspace<HouseholdMembersEnvelope | ErrorEnvelope>(
        serviceParams("read", request.auth, requestLogger, request.workspaceId),
        async (workspace) => {
          const roles = workspace.householdMemberRoles ?? {};
          const members = workspace.householdMembers.map((actor) => ({
            actor,
            role: (roles[actor] ?? "member") as "admin" | "guardian" | "member",
          }));
          return success(200, { members });
        },
      );
    },

    async addHouseholdMember(request) {
      const requestLogger = getRequestLogger(request.logger);
      return withMutation(
        { ...serviceParams("manage", request.auth, requestLogger, request.workspaceId), successStatus: 200 },
        (workspace, audit) => addHouseholdMember(workspace, request.payload, { audit, logger: requestLogger }),
      );
    },

    async setHouseholdMemberRole(request) {
      const requestLogger = getRequestLogger(request.logger);
      return withMutation(
        { ...serviceParams("manage", request.auth, requestLogger, request.workspaceId), successStatus: 200 },
        (workspace, audit) =>
          setHouseholdMemberRole(
            workspace,
            { actor: request.actor, role: request.payload.role },
            { audit, logger: requestLogger },
          ),
      );
    },

    async removeHouseholdMember(request) {
      const requestLogger = getRequestLogger(request.logger);
      return withWorkspace<WorkspaceEnvelope | ErrorEnvelope>(
        serviceParams("manage", request.auth, requestLogger, request.workspaceId),
        async (workspace, authorization) => {
          const audit = buildAuthorizationAuditContext(request.auth.actor, authorization);
          const result = removeHouseholdMember(
            workspace,
            { actor: request.actor },
            { audit, logger: requestLogger },
          );

          if (!result.ok) {
            requestLogger.warn("service command validation failed", { errors: result.errors });
            return failure(
              new ApiError({
                code: "validation.failed",
                details: { issues: result.errors },
                message: result.errors[0] ?? "Request validation failed.",
                status: 409,
              }),
            );
          }

          await params.repository.save(result.document, { logger: requestLogger });
          requestLogger.info("service command completed");
          return success(200, { workspace: presentWorkspace(result.document) });
        },
      );
    },

    async getAuditEvents(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "getAuditEvents",
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withWorkspace<AuditEventsEnvelope | ErrorEnvelope>(
        serviceParams("read", request.auth, requestLogger, request.workspaceId),
        async (workspace) => {
          let auditEvents = workspace.auditEvents;

          if (request.eventType) {
            auditEvents = auditEvents.filter((e) => e.eventType === request.eventType);
          }

          if (request.since) {
            auditEvents = auditEvents.filter((e) => e.occurredAt >= request.since!);
          }

          if (request.limit !== undefined && request.limit > 0) {
            auditEvents = auditEvents.slice(-request.limit);
          }

          requestLogger.info("service command completed", { count: auditEvents.length });
          return success(200, { auditEvents });
        },
      );
    },

    async getApprovals(request) {
      const requestLogger = getRequestLogger(request.logger);
      return withWorkspace<ApprovalsEnvelope | ErrorEnvelope>(
        serviceParams("read", request.auth, requestLogger, request.workspaceId),
        async (workspace) => {
          const approvals = workspace.pendingApprovals ?? [];
          return success(200, { approvals });
        },
      );
    },

    async requestApproval(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "requestApproval",
        kind: request.payload.kind,
        entityId: request.payload.entityId,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("destroy", request.auth, requestLogger, request.workspaceId), successStatus: 201 },
        (workspace, audit) =>
          requestApproval(
            workspace,
            {
              approvalId: request.payload.approvalId,
              kind: request.payload.kind,
              entityId: request.payload.entityId,
              requestedBy: request.auth.actor,
            },
            { audit, logger: requestLogger },
          ),
      );
    },

    async grantApproval(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "grantApproval",
        approvalId: request.approvalId,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("destroy", request.auth, requestLogger, request.workspaceId), successStatus: 200 },
        (workspace, audit) =>
          grantApproval(
            workspace,
            { approvalId: request.approvalId, reviewedBy: request.auth.actor },
            { audit, logger: requestLogger },
          ),
      );
    },

    async denyApproval(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "denyApproval",
        approvalId: request.approvalId,
        workspaceId: request.workspaceId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("destroy", request.auth, requestLogger, request.workspaceId), successStatus: 200 },
        (workspace, audit) =>
          denyApproval(
            workspace,
            { approvalId: request.approvalId, reviewedBy: request.auth.actor },
            { audit, logger: requestLogger },
          ),
      );
    },

    // --- Account management ---

    async getAccounts(request) {
      const requestLogger = getRequestLogger(request.logger);
      return withWorkspace<AccountsEnvelope | ErrorEnvelope>(
        serviceParams("read", request.auth, requestLogger, request.workspaceId),
        async (workspace) => {
          const accounts = request.includeArchived
            ? workspace.accounts
            : workspace.accounts.filter((a) => !a.archivedAt);
          return success(200, { accounts });
        },
      );
    },

    async postAccount(request) {
      const requestLogger = getRequestLogger(request.logger);
      return withMutation(
        { ...serviceParams("manage", request.auth, requestLogger, request.workspaceId), successStatus: 200 },
        (workspace, audit) => upsertAccount(workspace, request.account, { audit, logger: requestLogger }),
      );
    },

    async archiveAccount(request) {
      const requestLogger = getRequestLogger(request.logger);
      return withWorkspace<WorkspaceEnvelope | ErrorEnvelope>(
        serviceParams("manage", request.auth, requestLogger, request.workspaceId),
        async (workspace, authorization) => {
          const audit = buildAuthorizationAuditContext(request.auth.actor, authorization);
          const result = archiveAccount(
            workspace,
            { accountId: request.accountId },
            { audit, logger: requestLogger },
          );

          if (!result.ok) {
            requestLogger.warn("service command validation failed", { errors: result.errors });
            return failure(
              new ApiError({
                code: "validation.failed",
                details: { issues: result.errors },
                message: result.errors[0] ?? "Request validation failed.",
                status: 409,
              }),
            );
          }

          await params.repository.save(result.document, { logger: requestLogger });
          requestLogger.info("service command completed");
          return success(200, { workspace: presentWorkspace(result.document) });
        },
      );
    },
  };
}
