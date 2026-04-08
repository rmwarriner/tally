import { createNoopLogger, type Logger } from "@tally/logging";
import {
  addHouseholdMember,
  addTransaction,
  archiveAccount,
  buildOperationalBookView,
  buildCloseSummary,
  buildGnuCashXmlExport,
  buildOfxExport,
  applyScheduledTransactionException,
  buildDashboardSnapshot,
  buildQifExport,
  buildBookReport,
  closeBookPeriod,
  deleteTransaction,
  denyApproval,
  destroyTransaction,
  executeScheduledTransaction,
  grantApproval,
  importTransactionsFromCsvRows,
  importTransactionsFromStatement,
  importBookFromGnuCashXml,
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
} from "@tally/book";
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
  BookEnvelope,
} from "./types";
import { ApiError, toApiError } from "./errors";
import type { BookRepository } from "./repository";

export interface BookService {
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
  getBook(request: GetWorkspaceRequest): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  deleteTransaction(
    request: DeleteTransactionRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  destroyTransaction(
    request: DestroyTransactionRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  postCsvImport(
    request: PostCsvImportRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  postQifImport(
    request: PostQifImportRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  postStatementImport(
    request: PostStatementImportRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  postGnuCashXmlImport(
    request: PostGnuCashXmlImportRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  executeScheduledTransaction(
    request: ExecuteScheduledTransactionRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  applyScheduledTransactionException(
    request: ApplyScheduledTransactionExceptionRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  postBaselineBudgetLine(
    request: PostBaselineBudgetLineRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  postBackup(
    request: PostBackupRequest,
  ): Promise<ServiceResponse<BackupEnvelope | ErrorEnvelope>>;
  postBackupRestore(
    request: PostBackupRestoreRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  postClosePeriod(
    request: PostClosePeriodRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  postEnvelope(
    request: PostEnvelopeRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  postEnvelopeAllocation(
    request: PostEnvelopeAllocationRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  postReconciliation(
    request: PostReconciliationRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  postScheduledTransaction(
    request: PostScheduledTransactionRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  postTransaction(
    request: PostTransactionRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  updateTransaction(
    request: UpdateTransactionRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  getHouseholdMembers(
    request: GetHouseholdMembersRequest,
  ): Promise<ServiceResponse<HouseholdMembersEnvelope | ErrorEnvelope>>;
  addHouseholdMember(
    request: AddHouseholdMemberRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  setHouseholdMemberRole(
    request: SetHouseholdMemberRoleRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  removeHouseholdMember(
    request: RemoveHouseholdMemberRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  getAuditEvents(
    request: GetAuditEventsRequest,
  ): Promise<ServiceResponse<AuditEventsEnvelope | ErrorEnvelope>>;
  getApprovals(
    request: GetApprovalsRequest,
  ): Promise<ServiceResponse<ApprovalsEnvelope | ErrorEnvelope>>;
  requestApproval(
    request: RequestApprovalRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  grantApproval(
    request: GrantApprovalRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  denyApproval(
    request: DenyApprovalRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  getAccounts(
    request: GetAccountsRequest,
  ): Promise<ServiceResponse<AccountsEnvelope | ErrorEnvelope>>;
  postAccount(
    request: PostAccountRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  archiveAccount(
    request: ArchiveAccountRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
}

export function createBookService(params: {
  logger?: Logger;
  repository: BookRepository;
}): BookService {
  const logger = (params.logger ?? createNoopLogger()).child({ component: "bookService" });

  function getRequestLogger(requestLogger?: Logger): Logger {
    return requestLogger ?? logger;
  }

  function presentBook(document: ReturnType<typeof buildOperationalBookView>) {
    return buildOperationalBookView(document);
  }

  function serviceParams(access: "destroy" | "manage" | "operate" | "read" | "write", auth: Parameters<BookService["getBook"]>[0]["auth"], requestLogger: Logger, bookId: string) {
    return { access, auth, logger: requestLogger, repository: params.repository, bookId };
  }

  return {
    // --- Read operations ---

    async getBook(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "getBook",
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withWorkspace(
        serviceParams("read", request.auth, requestLogger, request.bookId),
        async (book) => {
          requestLogger.info("service command completed");
          return success(200, { book: presentBook(book) });
        },
      );
    },

    async getDashboard(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        from: request.from,
        operation: "getDashboard",
        to: request.to,
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withWorkspace(
        serviceParams("read", request.auth, requestLogger, request.bookId),
        async (book) => {
          const dashboard = buildDashboardSnapshot(book, { from: request.from, to: request.to });
          requestLogger.info("service command completed");
          return success(200, { dashboard });
        },
      );
    },

    async getBackups(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "getBackups",
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withWorkspace(
        serviceParams("read", request.auth, requestLogger, request.bookId),
        async () => {
          const backups = await params.repository.listBackups(request.bookId, { logger: requestLogger });
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
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withWorkspace(
        serviceParams("read", request.auth, requestLogger, request.bookId),
        async (book) => {
          const closeSummary = buildCloseSummary(book, { from: request.from, to: request.to });
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
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withWorkspace(
        serviceParams("read", request.auth, requestLogger, request.bookId),
        async (book) => {
          const report = buildBookReport(book, { from: request.from, kind: request.kind, to: request.to });
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
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withWorkspace(
        serviceParams("read", request.auth, requestLogger, request.bookId),
        async (book) => {
          const exportResult = buildQifExport({ accountId: request.accountId, from: request.from, to: request.to, book });
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
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withWorkspace(
        serviceParams("read", request.auth, requestLogger, request.bookId),
        async (book) => {
          const exportResult = buildOfxExport({ accountId: request.accountId, format: request.format, from: request.from, to: request.to, book });
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
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withWorkspace(
        serviceParams("read", request.auth, requestLogger, request.bookId),
        async (book) => {
          const exportResult = buildGnuCashXmlExport({ book: presentBook(book) });
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
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withWorkspace(
        serviceParams("operate", request.auth, requestLogger, request.bookId),
        async () => {
          const backup = await params.repository.createBackup(request.bookId, { logger: requestLogger });
          requestLogger.info("service command completed", { backupId: backup.id });
          return success(201, { backup });
        },
      );
    },

    async postBackupRestore(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        backupId: request.backupId,
        operation: "postBackupRestore",
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withWorkspace(
        serviceParams("operate", request.auth, requestLogger, request.bookId),
        async () => {
          const restored = await params.repository.restoreBackup(request.bookId, request.backupId, { logger: requestLogger });
          requestLogger.info("service command completed", { backupId: request.backupId });
          return success(200, { book: presentBook(restored) });
        },
      );
    },

    // --- Mutation operations ---

    async postTransaction(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "postTransaction",
        transactionId: request.transaction.id,
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("write", request.auth, requestLogger, request.bookId), successStatus: 201 },
        (book, audit) => addTransaction(book, request.transaction, { audit, logger: requestLogger }),
      );
    },

    async updateTransaction(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "updateTransaction",
        transactionId: request.transactionId,
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("write", request.auth, requestLogger, request.bookId), successStatus: 200 },
        (book, audit) => updateTransaction(book, request.transactionId, request.transaction, { audit, logger: requestLogger }),
      );
    },

    async deleteTransaction(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "deleteTransaction",
        transactionId: request.transactionId,
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("write", request.auth, requestLogger, request.bookId), successStatus: 200 },
        (book, audit) => deleteTransaction(book, request.transactionId, {}, { audit, logger: requestLogger }),
      );
    },

    async destroyTransaction(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "destroyTransaction",
        transactionId: request.transactionId,
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("destroy", request.auth, requestLogger, request.bookId), successStatus: 200 },
        (book, audit) => destroyTransaction(book, request.transactionId, { audit, logger: requestLogger }),
      );
    },

    async executeScheduledTransaction(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        occurredOn: request.payload.occurredOn,
        operation: "executeScheduledTransaction",
        scheduleId: request.scheduleId,
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("write", request.auth, requestLogger, request.bookId), successStatus: 201 },
        (book, audit) =>
          executeScheduledTransaction(
            book,
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
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("write", request.auth, requestLogger, request.bookId), successStatus: 200 },
        (book, audit) =>
          applyScheduledTransactionException(
            book,
            { action: request.payload.action, effectiveOn: request.payload.effectiveOn, nextDueOn: request.payload.nextDueOn, note: request.payload.note, scheduleId: request.scheduleId },
            { audit, logger: requestLogger },
          ),
      );
    },

    async postScheduledTransaction(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "postScheduledTransaction",
        scheduleId: request.schedule.id,
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("write", request.auth, requestLogger, request.bookId), successStatus: 200 },
        (book, audit) => upsertScheduledTransaction(book, request.schedule, { audit, logger: requestLogger }),
      );
    },

    async postEnvelope(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        envelopeId: request.envelope.id,
        operation: "postEnvelope",
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("write", request.auth, requestLogger, request.bookId), successStatus: 200 },
        (book, audit) => upsertEnvelope(book, request.envelope, { audit, logger: requestLogger }),
      );
    },

    async postEnvelopeAllocation(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        allocationId: request.allocation.id,
        envelopeId: request.allocation.envelopeId,
        operation: "postEnvelopeAllocation",
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("write", request.auth, requestLogger, request.bookId), successStatus: 200 },
        (book, audit) => recordEnvelopeAllocation(book, request.allocation, { audit, logger: requestLogger }),
      );
    },

    async postBaselineBudgetLine(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        accountId: request.line.accountId,
        operation: "postBaselineBudgetLine",
        period: request.line.period,
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("write", request.auth, requestLogger, request.bookId), successStatus: 200 },
        (book, audit) => upsertBaselineBudgetLine(book, request.line, { audit, logger: requestLogger }),
      );
    },

    async postClosePeriod(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        from: request.payload.from,
        operation: "postClosePeriod",
        to: request.payload.to,
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("operate", request.auth, requestLogger, request.bookId), successStatus: 201 },
        (book, audit) =>
          closeBookPeriod(
            book,
            { ...request.payload, closedBy: request.auth.actor },
            { audit, logger: requestLogger },
          ),
      );
    },

    async postQifImport(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        batchId: request.payload.batchId,
        operation: "postQifImport",
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("operate", request.auth, requestLogger, request.bookId), successStatus: 201 },
        (book, audit) => importTransactionsFromQif(book, request.payload, { audit, logger: requestLogger }),
      );
    },

    async postStatementImport(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        batchId: request.payload.batchId,
        format: request.payload.format,
        operation: "postStatementImport",
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("operate", request.auth, requestLogger, request.bookId), successStatus: 201 },
        (book, audit) => importTransactionsFromStatement(book, request.payload, { audit, logger: requestLogger }),
      );
    },

    async postGnuCashXmlImport(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "postGnuCashXmlImport",
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("operate", request.auth, requestLogger, request.bookId), successStatus: 200 },
        (book, audit) => importBookFromGnuCashXml(book, request.payload, { audit, logger: requestLogger }),
      );
    },

    async postCsvImport(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        batchId: request.payload.batchId,
        operation: "postCsvImport",
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("operate", request.auth, requestLogger, request.bookId), successStatus: 200 },
        (book, audit) =>
          importTransactionsFromCsvRows(
            book,
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
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withWorkspace<BookEnvelope | ErrorEnvelope>(
        serviceParams("write", request.auth, requestLogger, request.bookId),
        async (book, authorization) => {
          const audit = buildAuthorizationAuditContext(request.auth.actor, authorization);
          const result = reconcileAccount(book, request.payload, { audit, logger: requestLogger });

          if (!result.ok && result.document === book) {
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
          return success(200, { book: presentBook(result.document) });
        },
      );
    },

    // --- Household member management ---

    async getHouseholdMembers(request) {
      const requestLogger = getRequestLogger(request.logger);
      return withWorkspace<HouseholdMembersEnvelope | ErrorEnvelope>(
        serviceParams("read", request.auth, requestLogger, request.bookId),
        async (book) => {
          const roles = book.householdMemberRoles ?? {};
          const members = book.householdMembers.map((actor) => ({
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
        { ...serviceParams("manage", request.auth, requestLogger, request.bookId), successStatus: 200 },
        (book, audit) => addHouseholdMember(book, request.payload, { audit, logger: requestLogger }),
      );
    },

    async setHouseholdMemberRole(request) {
      const requestLogger = getRequestLogger(request.logger);
      return withMutation(
        { ...serviceParams("manage", request.auth, requestLogger, request.bookId), successStatus: 200 },
        (book, audit) =>
          setHouseholdMemberRole(
            book,
            { actor: request.actor, role: request.payload.role },
            { audit, logger: requestLogger },
          ),
      );
    },

    async removeHouseholdMember(request) {
      const requestLogger = getRequestLogger(request.logger);
      return withWorkspace<BookEnvelope | ErrorEnvelope>(
        serviceParams("manage", request.auth, requestLogger, request.bookId),
        async (book, authorization) => {
          const audit = buildAuthorizationAuditContext(request.auth.actor, authorization);
          const result = removeHouseholdMember(
            book,
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
          return success(200, { book: presentBook(result.document) });
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
        serviceParams("read", request.auth, requestLogger, request.bookId),
        async (book) => {
          const approvals = book.pendingApprovals ?? [];
          return success(200, { approvals });
        },
      );
    },

    async requestApproval(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "requestApproval",
        kind: request.payload.kind,
        entityId: request.payload.entityId,
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("destroy", request.auth, requestLogger, request.bookId), successStatus: 201 },
        (book, audit) =>
          requestApproval(
            book,
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
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("destroy", request.auth, requestLogger, request.bookId), successStatus: 200 },
        (book, audit) =>
          grantApproval(
            book,
            { approvalId: request.approvalId, reviewedBy: request.auth.actor },
            { audit, logger: requestLogger },
          ),
      );
    },

    async denyApproval(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "denyApproval",
        approvalId: request.approvalId,
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("destroy", request.auth, requestLogger, request.bookId), successStatus: 200 },
        (book, audit) =>
          denyApproval(
            book,
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
