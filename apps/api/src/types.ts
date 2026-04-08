import type {
  Account,
  BaselineBudgetLine,
  Envelope,
  EnvelopeAllocation,
  ScheduledTransaction,
  Transaction,
} from "@tally/domain";
import type { CsvImportRow, FinanceBookDocument } from "@tally/book";
import type { Logger } from "@tally/logging";
import type { AuthContext } from "./auth";
import type { ErrorEnvelope } from "./errors";

export interface ServiceResponse<TBody> {
  body: TBody;
  status: number;
}

export interface GetWorkspaceRequest {
  auth: AuthContext;
  logger?: Logger;
  bookId: string;
}

export interface GetBackupsRequest {
  auth: AuthContext;
  logger?: Logger;
  bookId: string;
}

export interface GetDashboardRequest {
  auth: AuthContext;
  from: string;
  logger?: Logger;
  to: string;
  bookId: string;
}

export interface GetCloseSummaryRequest {
  auth: AuthContext;
  from: string;
  logger?: Logger;
  to: string;
  bookId: string;
}

export interface PostClosePeriodRequest {
  auth: AuthContext;
  logger?: Logger;
  payload: {
    closedAt: string;
    id?: string;
    notes?: string;
    from: string;
    to: string;
  };
  bookId: string;
}

export interface PostBackupRequest {
  auth: AuthContext;
  logger?: Logger;
  bookId: string;
}

export interface PostBackupRestoreRequest {
  auth: AuthContext;
  backupId: string;
  logger?: Logger;
  bookId: string;
}

export interface GetQifExportRequest {
  accountId: string;
  auth: AuthContext;
  from: string;
  logger?: Logger;
  to: string;
  bookId: string;
}

export interface GetStatementExportRequest {
  accountId: string;
  auth: AuthContext;
  format: "ofx" | "qfx";
  from: string;
  logger?: Logger;
  to: string;
  bookId: string;
}

export interface GetGnuCashXmlExportRequest {
  auth: AuthContext;
  logger?: Logger;
  bookId: string;
}

export interface GetReportRequest {
  auth: AuthContext;
  from: string;
  kind: import("@tally/book").BookReportKind;
  logger?: Logger;
  to: string;
  bookId: string;
}

export interface PostTransactionRequest {
  auth: AuthContext;
  logger?: Logger;
  transaction: Transaction;
  bookId: string;
}

export interface UpdateTransactionRequest {
  auth: AuthContext;
  logger?: Logger;
  transaction: Transaction;
  transactionId: string;
  bookId: string;
}

export interface DeleteTransactionRequest {
  auth: AuthContext;
  logger?: Logger;
  transactionId: string;
  bookId: string;
}

export interface DestroyTransactionRequest {
  auth: AuthContext;
  logger?: Logger;
  transactionId: string;
  bookId: string;
}

export interface PostReconciliationRequest {
  auth: AuthContext;
  logger?: Logger;
  payload: {
    accountId: string;
    clearedTransactionIds: string[];
    reconciliationId?: string;
    statementBalance: number;
    statementDate: string;
  };
  bookId: string;
}

export interface PostBaselineBudgetLineRequest {
  auth: AuthContext;
  line: BaselineBudgetLine;
  logger?: Logger;
  bookId: string;
}

export interface PostEnvelopeRequest {
  auth: AuthContext;
  envelope: Envelope;
  logger?: Logger;
  bookId: string;
}

export interface PostEnvelopeAllocationRequest {
  auth: AuthContext;
  allocation: EnvelopeAllocation;
  logger?: Logger;
  bookId: string;
}

export interface PostScheduledTransactionRequest {
  auth: AuthContext;
  logger?: Logger;
  schedule: ScheduledTransaction;
  bookId: string;
}

export interface ExecuteScheduledTransactionRequest {
  auth: AuthContext;
  logger?: Logger;
  payload: {
    occurredOn: string;
    transactionId?: string;
  };
  scheduleId: string;
  bookId: string;
}

export interface ApplyScheduledTransactionExceptionRequest {
  auth: AuthContext;
  logger?: Logger;
  payload: {
    action: "defer" | "skip-next";
    effectiveOn?: string;
    nextDueOn?: string;
    note?: string;
  };
  scheduleId: string;
  bookId: string;
}

export interface PostCsvImportRequest {
  auth: AuthContext;
  logger?: Logger;
  payload: {
    batchId: string;
    importedAt: string;
    rows: CsvImportRow[];
    sourceLabel: string;
  };
  bookId: string;
}

export interface PostQifImportRequest {
  auth: AuthContext;
  logger?: Logger;
  payload: {
    batchId: string;
    cashAccountId: string;
    categoryMappings?: Record<string, string>;
    defaultCounterpartAccountId: string;
    importedAt: string;
    qif: string;
    sourceLabel: string;
  };
  bookId: string;
}

export interface PostStatementImportRequest {
  auth: AuthContext;
  logger?: Logger;
  payload: {
    batchId: string;
    cashAccountId: string;
    defaultCounterpartAccountId: string;
    format: "ofx" | "qfx";
    importedAt: string;
    nameMappings?: Record<string, string>;
    sourceLabel: string;
    statement: string;
  };
  bookId: string;
}

export interface PostGnuCashXmlImportRequest {
  auth: AuthContext;
  logger?: Logger;
  payload: {
    importedAt: string;
    sourceLabel: string;
    xml: string;
  };
  bookId: string;
}

export interface BookEnvelope {
  book: FinanceBookDocument;
}

export interface DashboardEnvelope {
  dashboard: ReturnType<typeof import("@tally/book").buildDashboardSnapshot>;
}

export interface BackupsEnvelope {
  backups: import("./repository").BookBackup[];
}

export interface BackupEnvelope {
  backup: import("./repository").BookBackup;
}

export interface CloseSummaryEnvelope {
  closeSummary: import("@tally/book").CloseSummary;
}

export interface QifExportEnvelope {
  export: {
    contents: string;
    fileName: string;
    format: "qif";
    transactionCount: number;
  };
}

export interface StatementExportEnvelope {
  export: {
    contents: string;
    fileName: string;
    format: "ofx" | "qfx";
    transactionCount: number;
  };
}

export interface GnuCashXmlExportEnvelope {
  export: {
    contents: string;
    fileName: string;
    format: "gnucash-xml";
  };
}

export interface ReportEnvelope {
  report: import("@tally/book").BookReport;
}

export interface GetHouseholdMembersRequest {
  auth: AuthContext;
  logger?: Logger;
  bookId: string;
}

export interface AddHouseholdMemberRequest {
  auth: AuthContext;
  logger?: Logger;
  payload: {
    actor: string;
    role?: "admin" | "guardian" | "member";
  };
  bookId: string;
}

export interface SetHouseholdMemberRoleRequest {
  actor: string;
  auth: AuthContext;
  logger?: Logger;
  payload: {
    role: "admin" | "guardian" | "member";
  };
  bookId: string;
}

export interface RemoveHouseholdMemberRequest {
  actor: string;
  auth: AuthContext;
  logger?: Logger;
  bookId: string;
}

export interface HouseholdMembersEnvelope {
  members: Array<{
    actor: string;
    role: "admin" | "guardian" | "member";
  }>;
}

export interface GetAccountsRequest {
  auth: AuthContext;
  includeArchived?: boolean;
  logger?: Logger;
  workspaceId: string;
}

export interface PostAccountRequest {
  account: Account;
  auth: AuthContext;
  logger?: Logger;
  workspaceId: string;
}

export interface ArchiveAccountRequest {
  accountId: string;
  auth: AuthContext;
  logger?: Logger;
  workspaceId: string;
}

export interface AccountsEnvelope {
  accounts: Account[];
}

export interface GetAuditEventsRequest {
  auth: AuthContext;
  eventType?: string;
  limit?: number;
  logger?: Logger;
  since?: string;
  workspaceId: string;
}

export interface AuditEventsEnvelope {
  auditEvents: import("@tally/workspace").AuditEvent[];
}

export interface GetApprovalsRequest {
  auth: AuthContext;
  logger?: Logger;
  bookId: string;
}

export interface RequestApprovalRequest {
  auth: AuthContext;
  logger?: Logger;
  payload: {
    approvalId: string;
    kind: import("@tally/book").ApprovalKind;
    entityId: string;
  };
  bookId: string;
}

export interface GrantApprovalRequest {
  approvalId: string;
  auth: AuthContext;
  logger?: Logger;
  bookId: string;
}

export interface DenyApprovalRequest {
  approvalId: string;
  auth: AuthContext;
  logger?: Logger;
  bookId: string;
}

export interface ApprovalsEnvelope {
  approvals: import("@tally/book").PendingApproval[];
}

export type { ErrorEnvelope };
