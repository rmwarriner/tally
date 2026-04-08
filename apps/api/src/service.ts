import { randomUUID } from "node:crypto";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createNoopLogger, type Logger } from "@tally/logging";
import { starterChartOfAccounts, type Transaction } from "@tally/domain";
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
  restoreTransaction,
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
  AttachmentBinaryEnvelope,
  AttachmentEnvelope,
  AuditEventsEnvelope,
  BackupEnvelope,
  BackupsEnvelope,
  BooksEnvelope,
  DeleteTransactionRequest,
  GetAttachmentRequest,
  DenyApprovalRequest,
  DestroyTransactionRequest,
  ErrorEnvelope,
  GetAccountsRequest,
  GetApprovalsRequest,
  GetAuditEventsRequest,
  GetBooksRequest,
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
  GetTransactionsRequest,
  GetWorkspaceRequest,
  GnuCashXmlExportEnvelope,
  GrantApprovalRequest,
  HouseholdMembersEnvelope,
  PostAccountRequest,
  PostBaselineBudgetLineRequest,
  PostBackupRequest,
  PostBackupRestoreRequest,
  PostBookRequest,
  PostClosePeriodRequest,
  PostCsvImportRequest,
  PostEnvelopeAllocationRequest,
  PostEnvelopeRequest,
  PostGnuCashXmlImportRequest,
  PostQifImportRequest,
  PostReconciliationRequest,
  PostScheduledTransactionRequest,
  PostStatementImportRequest,
  PostAttachmentRequest,
  PostTransactionRequest,
  RemoveHouseholdMemberRequest,
  RequestApprovalRequest,
  ServiceResponse,
  SetHouseholdMemberRoleRequest,
  StatementExportEnvelope,
  RestoreTransactionRequest,
  LinkTransactionAttachmentRequest,
  UnlinkTransactionAttachmentRequest,
  TransactionsEnvelope,
  UpdateTransactionRequest,
  DashboardEnvelope,
  QifExportEnvelope,
  ReportEnvelope,
  BookEnvelope,
} from "./types";
import { ApiError, toApiError } from "./errors";
import type { BookRepository } from "./repository";

export interface BookService {
  getBooks(request: GetBooksRequest): Promise<ServiceResponse<BooksEnvelope | ErrorEnvelope>>;
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
  getTransactions(
    request: GetTransactionsRequest,
  ): Promise<ServiceResponse<TransactionsEnvelope | ErrorEnvelope>>;
  getAttachment(
    request: GetAttachmentRequest,
  ): Promise<ServiceResponse<AttachmentBinaryEnvelope | ErrorEnvelope>>;
  deleteTransaction(
    request: DeleteTransactionRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  restoreTransaction(
    request: RestoreTransactionRequest,
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
  postBook(
    request: PostBookRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  postAttachment(
    request: PostAttachmentRequest,
  ): Promise<ServiceResponse<AttachmentEnvelope | ErrorEnvelope>>;
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
  linkTransactionAttachment(
    request: LinkTransactionAttachmentRequest,
  ): Promise<ServiceResponse<BookEnvelope | ErrorEnvelope>>;
  unlinkTransactionAttachment(
    request: UnlinkTransactionAttachmentRequest,
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

const DEFAULT_BOOK_COMMODITIES = [
  {
    code: "USD",
    name: "US Dollar",
    precision: 2,
    type: "fiat" as const,
  },
];

export function createBookService(params: {
  dataDirectory?: string;
  logger?: Logger;
  repository: BookRepository;
}): BookService {
  const logger = (params.logger ?? createNoopLogger()).child({ component: "bookService" });
  const dataDirectory = resolve(params.dataDirectory ?? process.cwd());
  const attachmentRoot = resolve(join(dataDirectory, "attachments"));
  const attachmentBackupRoot = resolve(join(attachmentRoot, "_backups"));

  function getRequestLogger(requestLogger?: Logger): Logger {
    return requestLogger ?? logger;
  }

  function presentBook(document: ReturnType<typeof buildOperationalBookView>) {
    return buildOperationalBookView(document);
  }

  function serviceParams(access: "destroy" | "manage" | "operate" | "read" | "write", auth: Parameters<BookService["getBook"]>[0]["auth"], requestLogger: Logger, bookId: string) {
    return { access, auth, logger: requestLogger, repository: params.repository, bookId };
  }

  function isSafeIdentifier(identifier: string): boolean {
    return /^[a-zA-Z0-9:._-]+$/.test(identifier);
  }

  function requireSafeIdentifier(identifier: string, noun: string): void {
    if (!isSafeIdentifier(identifier)) {
      throw new ApiError({
        code: "repository.invalid_identifier",
        message: `${noun} identifier is invalid.`,
        status: 400,
      });
    }
  }

  function attachmentPath(bookId: string, attachmentId: string): string {
    requireSafeIdentifier(bookId, "Workspace");
    requireSafeIdentifier(attachmentId, "Attachment");
    return resolve(join(attachmentRoot, bookId, attachmentId));
  }

  function attachmentSnapshotDirectory(bookId: string, backupId: string): string {
    requireSafeIdentifier(bookId, "Workspace");
    requireSafeIdentifier(backupId, "Backup");
    return resolve(join(attachmentBackupRoot, bookId, backupId));
  }

  async function createAttachmentBackupSnapshot(bookId: string, backupId: string): Promise<void> {
    const sourceDirectory = resolve(join(attachmentRoot, bookId));
    const destinationDirectory = attachmentSnapshotDirectory(bookId, backupId);
    await rm(destinationDirectory, { force: true, recursive: true });

    try {
      await stat(sourceDirectory);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        return;
      }

      throw new ApiError({
        cause: error,
        code: "repository.unavailable",
        expose: false,
        message: "Book storage is unavailable.",
        status: 500,
      });
    }

    await mkdir(destinationDirectory, { recursive: true });
    await cp(sourceDirectory, destinationDirectory, { force: true, recursive: true });
  }

  async function restoreAttachmentBackupSnapshot(bookId: string, backupId: string): Promise<void> {
    const destinationDirectory = resolve(join(attachmentRoot, bookId));
    const sourceDirectory = attachmentSnapshotDirectory(bookId, backupId);
    await rm(destinationDirectory, { force: true, recursive: true });

    try {
      await stat(sourceDirectory);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        return;
      }

      throw new ApiError({
        cause: error,
        code: "repository.unavailable",
        expose: false,
        message: "Book storage is unavailable.",
        status: 500,
      });
    }

    await mkdir(destinationDirectory, { recursive: true });
    await cp(sourceDirectory, destinationDirectory, { force: true, recursive: true });
  }

  function compareTransactionDesc(left: Transaction, right: Transaction): number {
    return right.occurredOn.localeCompare(left.occurredOn) || right.id.localeCompare(left.id);
  }

  function encodeCursor(transaction: Transaction): string {
    return Buffer.from(
      JSON.stringify({ occurredOn: transaction.occurredOn, id: transaction.id }),
      "utf8",
    ).toString("base64url");
  }

  function decodeCursor(cursor: string): { id: string; occurredOn: string } {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
        id?: unknown;
        occurredOn?: unknown;
      };

      if (
        typeof decoded.id !== "string" ||
        typeof decoded.occurredOn !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(decoded.occurredOn)
      ) {
        throw new Error("Invalid transaction cursor.");
      }

      return { id: decoded.id, occurredOn: decoded.occurredOn };
    } catch {
      throw new ApiError({
        code: "validation.failed",
        details: { issues: ["cursor must be a base64url JSON object with occurredOn and id."] },
        message: "cursor must be a base64url JSON object with occurredOn and id.",
        status: 400,
      });
    }
  }

  return {
    // --- Read operations ---

    async getBooks(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "getBooks",
      });
      requestLogger.info("service command started");

      try {
        const bookIds = await params.repository.listBookIds({ logger: requestLogger });
        const books: BooksEnvelope["books"] = [];

        for (const bookId of bookIds) {
          const book = await params.repository.load(bookId, { logger: requestLogger });

          if (request.auth.role === "local-admin") {
            books.push({
              id: book.id,
              name: book.name,
              role: "local-admin",
            });
            continue;
          }

          if (!book.householdMembers.includes(request.auth.actor)) {
            continue;
          }

          const configuredRole = book.householdMemberRoles?.[request.auth.actor];
          books.push({
            id: book.id,
            name: book.name,
            role:
              configuredRole === "admin" || configuredRole === "guardian" || configuredRole === "member"
                ? configuredRole
                : "member",
          });
        }

        requestLogger.info("service command completed", { bookCount: books.length });
        return success(200, { books });
      } catch (error) {
        const apiError = toApiError(error);
        requestLogger.error("service command failed", {
          error: apiError.message,
          errorCode: apiError.code,
        });
        return failure(apiError);
      }
    },

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

    async getTransactions(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "getTransactions",
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withWorkspace<TransactionsEnvelope | ErrorEnvelope>(
        serviceParams("read", request.auth, requestLogger, request.bookId),
        async (book) => {
          const cursor = request.payload.cursor ? decodeCursor(request.payload.cursor) : undefined;
          let transactions = [...book.transactions];

          if (request.payload.accountId) {
            transactions = transactions.filter((transaction) =>
              transaction.postings.some((posting) => posting.accountId === request.payload.accountId),
            );
          }

          if (request.payload.from) {
            transactions = transactions.filter((transaction) => transaction.occurredOn >= request.payload.from!);
          }

          if (request.payload.to) {
            transactions = transactions.filter((transaction) => transaction.occurredOn <= request.payload.to!);
          }

          if (request.payload.status === "deleted") {
            transactions = transactions.filter((transaction) => transaction.deletion !== undefined);
          } else if (request.payload.status === "cleared") {
            transactions = transactions.filter(
              (transaction) =>
                transaction.deletion === undefined &&
                transaction.postings.every((posting) => posting.cleared === true),
            );
          } else if (request.payload.status === "pending") {
            transactions = transactions.filter(
              (transaction) =>
                transaction.deletion === undefined &&
                transaction.postings.some((posting) => posting.cleared !== true),
            );
          } else {
            transactions = transactions.filter((transaction) => transaction.deletion === undefined);
          }

          transactions.sort(compareTransactionDesc);

          if (cursor) {
            transactions = transactions.filter(
              (transaction) =>
                transaction.occurredOn < cursor.occurredOn ||
                (transaction.occurredOn === cursor.occurredOn && transaction.id < cursor.id),
            );
          }

          const requestedLimit = request.payload.limit;
          const page = transactions.slice(0, requestedLimit);
          const hasMore = transactions.length > requestedLimit;
          const nextCursor = hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]!) : undefined;
          requestLogger.info("service command completed", { transactionCount: page.length });
          return success(200, { nextCursor, transactions: page });
        },
      );
    },

    async getAttachment(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "getAttachment",
        bookId: request.bookId,
        attachmentId: request.attachmentId,
      });
      requestLogger.info("service command started");
      return withWorkspace<AttachmentBinaryEnvelope | ErrorEnvelope>(
        serviceParams("read", request.auth, requestLogger, request.bookId),
        async (book) => {
          requireSafeIdentifier(request.attachmentId, "Attachment");
          const attachment = (book.attachments ?? []).find((candidate) => candidate.id === request.attachmentId);

          if (!attachment) {
            return failure(
              new ApiError({
                code: "request.not_found",
                message: `Attachment ${request.attachmentId} was not found.`,
                status: 404,
              }),
            );
          }

          try {
            const bytes = await readFile(attachmentPath(request.bookId, request.attachmentId));
            requestLogger.info("service command completed");
            return success(200, { attachment, bytes });
          } catch (error) {
            if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
              return failure(
                new ApiError({
                  cause: error,
                  code: "request.not_found",
                  message: `Attachment ${request.attachmentId} was not found.`,
                  status: 404,
                }),
              );
            }

            throw error;
          }
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

    async postBook(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "postBook",
        bookId: request.payload.bookId,
      });
      requestLogger.info("service command started");

      try {
        try {
          await params.repository.load(request.payload.bookId, { logger: requestLogger });
          return failure(
            new ApiError({
              code: "book.already_exists",
              message: `Book ${request.payload.bookId} already exists.`,
              status: 409,
            }),
          );
        } catch (error) {
          const apiError = toApiError(error);

          if (apiError.code !== "book.not_found") {
            throw apiError;
          }
        }

        const createdBook = {
          accounts: starterChartOfAccounts,
          attachments: [],
          auditEvents: [],
          baseCommodityCode: "USD",
          baselineBudgetLines: [],
          closePeriods: [],
          commodities: DEFAULT_BOOK_COMMODITIES,
          envelopeAllocations: [],
          envelopes: [],
          householdMemberRoles: {
            [request.auth.actor]: "admin" as const,
          },
          householdMembers: [request.auth.actor],
          id: request.payload.bookId,
          importBatches: [],
          name: request.payload.name,
          reconciliationSessions: [],
          scheduledTransactions: [],
          schemaVersion: 1 as const,
          transactions: [],
        };

        await params.repository.save(createdBook, { logger: requestLogger });
        requestLogger.info("service command completed");
        return success(201, { book: presentBook(createdBook) });
      } catch (error) {
        const apiError = toApiError(error);
        requestLogger.error("service command failed", {
          error: apiError.message,
          errorCode: apiError.code,
        });
        return failure(apiError);
      }
    },

    async postAttachment(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "postAttachment",
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withWorkspace<AttachmentEnvelope | ErrorEnvelope>(
        serviceParams("write", request.auth, requestLogger, request.bookId),
        async (book) => {
          const attachmentId = randomUUID();
          const createdAt = new Date().toISOString();
          const nextAttachment = {
            id: attachmentId,
            fileName: request.payload.fileName,
            contentType: request.payload.contentType,
            sizeBytes: request.payload.sizeBytes,
            createdAt,
            createdBy: request.auth.actor,
            storageKey: `attachments/${request.bookId}/${attachmentId}`,
          };
          const nextDocument = {
            ...book,
            attachments: [...(book.attachments ?? []), nextAttachment],
          };

          await mkdir(resolve(join(attachmentRoot, request.bookId)), { recursive: true });
          await writeFile(attachmentPath(request.bookId, attachmentId), request.payload.bytes);
          await params.repository.save(nextDocument, { logger: requestLogger });
          requestLogger.info("service command completed", { attachmentId });
          return success(201, { attachment: nextAttachment });
        },
      );
    },

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
          await createAttachmentBackupSnapshot(request.bookId, backup.id);
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
          await restoreAttachmentBackupSnapshot(request.bookId, request.backupId);
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

    async linkTransactionAttachment(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "linkTransactionAttachment",
        transactionId: request.transactionId,
        attachmentId: request.attachmentId,
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withWorkspace<BookEnvelope | ErrorEnvelope>(
        serviceParams("write", request.auth, requestLogger, request.bookId),
        async (book) => {
          const transaction = book.transactions.find((candidate) => candidate.id === request.transactionId);
          if (!transaction) {
            return failure(
              new ApiError({
                code: "request.not_found",
                message: `Transaction ${request.transactionId} was not found.`,
                status: 404,
              }),
            );
          }

          const attachment = (book.attachments ?? []).find((candidate) => candidate.id === request.attachmentId);
          if (!attachment) {
            return failure(
              new ApiError({
                code: "request.not_found",
                message: `Attachment ${request.attachmentId} was not found.`,
                status: 404,
              }),
            );
          }

          if ((transaction.attachmentIds ?? []).includes(attachment.id)) {
            return failure(
              new ApiError({
                code: "validation.failed",
                details: { issues: [`Attachment ${attachment.id} is already linked to transaction ${transaction.id}.`] },
                message: `Attachment ${attachment.id} is already linked to transaction ${transaction.id}.`,
                status: 409,
              }),
            );
          }

          const nextDocument = {
            ...book,
            transactions: book.transactions.map((candidate) =>
              candidate.id === request.transactionId
                ? {
                    ...candidate,
                    attachmentIds: [...(candidate.attachmentIds ?? []), request.attachmentId],
                  }
                : candidate,
            ),
          };

          await params.repository.save(nextDocument, { logger: requestLogger });
          requestLogger.info("service command completed");
          return success(200, { book: presentBook(nextDocument) });
        },
      );
    },

    async unlinkTransactionAttachment(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "unlinkTransactionAttachment",
        transactionId: request.transactionId,
        attachmentId: request.attachmentId,
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withWorkspace<BookEnvelope | ErrorEnvelope>(
        serviceParams("write", request.auth, requestLogger, request.bookId),
        async (book) => {
          const transaction = book.transactions.find((candidate) => candidate.id === request.transactionId);
          if (!transaction) {
            return failure(
              new ApiError({
                code: "request.not_found",
                message: `Transaction ${request.transactionId} was not found.`,
                status: 404,
              }),
            );
          }

          const attachment = (book.attachments ?? []).find((candidate) => candidate.id === request.attachmentId);
          if (!attachment) {
            return failure(
              new ApiError({
                code: "request.not_found",
                message: `Attachment ${request.attachmentId} was not found.`,
                status: 404,
              }),
            );
          }

          const currentAttachmentIds = transaction.attachmentIds ?? [];
          if (!currentAttachmentIds.includes(attachment.id)) {
            return failure(
              new ApiError({
                code: "validation.failed",
                details: { issues: [`Attachment ${attachment.id} is not linked to transaction ${transaction.id}.`] },
                message: `Attachment ${attachment.id} is not linked to transaction ${transaction.id}.`,
                status: 409,
              }),
            );
          }

          const nextDocument = {
            ...book,
            transactions: book.transactions.map((candidate) => {
              if (candidate.id !== request.transactionId) {
                return candidate;
              }

              const nextAttachmentIds = (candidate.attachmentIds ?? []).filter((id) => id !== request.attachmentId);
              return {
                ...candidate,
                attachmentIds: nextAttachmentIds.length > 0 ? nextAttachmentIds : undefined,
              };
            }),
          };

          await params.repository.save(nextDocument, { logger: requestLogger });
          requestLogger.info("service command completed");
          return success(200, { book: presentBook(nextDocument) });
        },
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

    async restoreTransaction(request) {
      const requestLogger = getRequestLogger(request.logger).child({
        operation: "restoreTransaction",
        transactionId: request.transactionId,
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withMutation(
        { ...serviceParams("write", request.auth, requestLogger, request.bookId), successStatus: 200 },
        (book, audit) => restoreTransaction(book, request.transactionId, { audit, logger: requestLogger }),
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
        bookId: request.bookId,
      });
      requestLogger.info("service command started");
      return withWorkspace<AuditEventsEnvelope | ErrorEnvelope>(
        serviceParams("read", request.auth, requestLogger, request.bookId),
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
        serviceParams("read", request.auth, requestLogger, request.bookId),
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
        { ...serviceParams("manage", request.auth, requestLogger, request.bookId), successStatus: 200 },
        (workspace, audit) => upsertAccount(workspace, request.account, { audit, logger: requestLogger }),
      );
    },

    async archiveAccount(request) {
      const requestLogger = getRequestLogger(request.logger);
      return withWorkspace<BookEnvelope | ErrorEnvelope>(
        serviceParams("manage", request.auth, requestLogger, request.bookId),
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
          return success(200, { book: presentBook(result.document) });
        },
      );
    },
  };
}
