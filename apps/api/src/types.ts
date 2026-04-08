import type {
  Account,
  BaselineBudgetLine,
  Envelope,
  EnvelopeAllocation,
  ScheduledTransaction,
  Transaction,
} from "@tally/domain";
import type { CsvImportRow, FinanceWorkspaceDocument } from "@tally/workspace";
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
  workspaceId: string;
}

export interface GetBackupsRequest {
  auth: AuthContext;
  logger?: Logger;
  workspaceId: string;
}

export interface GetDashboardRequest {
  auth: AuthContext;
  from: string;
  logger?: Logger;
  to: string;
  workspaceId: string;
}

export interface GetCloseSummaryRequest {
  auth: AuthContext;
  from: string;
  logger?: Logger;
  to: string;
  workspaceId: string;
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
  workspaceId: string;
}

export interface PostBackupRequest {
  auth: AuthContext;
  logger?: Logger;
  workspaceId: string;
}

export interface PostBackupRestoreRequest {
  auth: AuthContext;
  backupId: string;
  logger?: Logger;
  workspaceId: string;
}

export interface GetQifExportRequest {
  accountId: string;
  auth: AuthContext;
  from: string;
  logger?: Logger;
  to: string;
  workspaceId: string;
}

export interface GetStatementExportRequest {
  accountId: string;
  auth: AuthContext;
  format: "ofx" | "qfx";
  from: string;
  logger?: Logger;
  to: string;
  workspaceId: string;
}

export interface GetGnuCashXmlExportRequest {
  auth: AuthContext;
  logger?: Logger;
  workspaceId: string;
}

export interface GetReportRequest {
  auth: AuthContext;
  from: string;
  kind: import("@tally/workspace").WorkspaceReportKind;
  logger?: Logger;
  to: string;
  workspaceId: string;
}

export interface PostTransactionRequest {
  auth: AuthContext;
  logger?: Logger;
  transaction: Transaction;
  workspaceId: string;
}

export interface UpdateTransactionRequest {
  auth: AuthContext;
  logger?: Logger;
  transaction: Transaction;
  transactionId: string;
  workspaceId: string;
}

export interface DeleteTransactionRequest {
  auth: AuthContext;
  logger?: Logger;
  transactionId: string;
  workspaceId: string;
}

export interface DestroyTransactionRequest {
  auth: AuthContext;
  logger?: Logger;
  transactionId: string;
  workspaceId: string;
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
  workspaceId: string;
}

export interface PostBaselineBudgetLineRequest {
  auth: AuthContext;
  line: BaselineBudgetLine;
  logger?: Logger;
  workspaceId: string;
}

export interface PostEnvelopeRequest {
  auth: AuthContext;
  envelope: Envelope;
  logger?: Logger;
  workspaceId: string;
}

export interface PostEnvelopeAllocationRequest {
  auth: AuthContext;
  allocation: EnvelopeAllocation;
  logger?: Logger;
  workspaceId: string;
}

export interface PostScheduledTransactionRequest {
  auth: AuthContext;
  logger?: Logger;
  schedule: ScheduledTransaction;
  workspaceId: string;
}

export interface ExecuteScheduledTransactionRequest {
  auth: AuthContext;
  logger?: Logger;
  payload: {
    occurredOn: string;
    transactionId?: string;
  };
  scheduleId: string;
  workspaceId: string;
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
  workspaceId: string;
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
  workspaceId: string;
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
  workspaceId: string;
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
  workspaceId: string;
}

export interface PostGnuCashXmlImportRequest {
  auth: AuthContext;
  logger?: Logger;
  payload: {
    importedAt: string;
    sourceLabel: string;
    xml: string;
  };
  workspaceId: string;
}

export interface WorkspaceEnvelope {
  workspace: FinanceWorkspaceDocument;
}

export interface DashboardEnvelope {
  dashboard: ReturnType<typeof import("@tally/workspace").buildDashboardSnapshot>;
}

export interface BackupsEnvelope {
  backups: import("./repository").WorkspaceBackup[];
}

export interface BackupEnvelope {
  backup: import("./repository").WorkspaceBackup;
}

export interface CloseSummaryEnvelope {
  closeSummary: import("@tally/workspace").CloseSummary;
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
  report: import("@tally/workspace").WorkspaceReport;
}

export interface GetHouseholdMembersRequest {
  auth: AuthContext;
  logger?: Logger;
  workspaceId: string;
}

export interface AddHouseholdMemberRequest {
  auth: AuthContext;
  logger?: Logger;
  payload: {
    actor: string;
    role?: "admin" | "guardian" | "member";
  };
  workspaceId: string;
}

export interface SetHouseholdMemberRoleRequest {
  actor: string;
  auth: AuthContext;
  logger?: Logger;
  payload: {
    role: "admin" | "guardian" | "member";
  };
  workspaceId: string;
}

export interface RemoveHouseholdMemberRequest {
  actor: string;
  auth: AuthContext;
  logger?: Logger;
  workspaceId: string;
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
  workspaceId: string;
}

export interface RequestApprovalRequest {
  auth: AuthContext;
  logger?: Logger;
  payload: {
    approvalId: string;
    kind: import("@tally/workspace").ApprovalKind;
    entityId: string;
  };
  workspaceId: string;
}

export interface GrantApprovalRequest {
  approvalId: string;
  auth: AuthContext;
  logger?: Logger;
  workspaceId: string;
}

export interface DenyApprovalRequest {
  approvalId: string;
  auth: AuthContext;
  logger?: Logger;
  workspaceId: string;
}

export interface ApprovalsEnvelope {
  approvals: import("@tally/workspace").PendingApproval[];
}

export type { ErrorEnvelope };
