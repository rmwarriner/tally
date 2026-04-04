import type {
  BaselineBudgetLine,
  Envelope,
  EnvelopeAllocation,
  ScheduledTransaction,
  Transaction,
} from "@gnucash-ng/domain";
import type { CsvImportRow, FinanceWorkspaceDocument } from "@gnucash-ng/workspace";
import type { AuthContext } from "./auth";
import type { ErrorEnvelope } from "./errors";

export interface ServiceResponse<TBody> {
  body: TBody;
  status: number;
}

export interface GetWorkspaceRequest {
  auth: AuthContext;
  workspaceId: string;
}

export interface GetDashboardRequest {
  auth: AuthContext;
  from: string;
  to: string;
  workspaceId: string;
}

export interface PostTransactionRequest {
  auth: AuthContext;
  transaction: Transaction;
  workspaceId: string;
}

export interface UpdateTransactionRequest {
  auth: AuthContext;
  transaction: Transaction;
  transactionId: string;
  workspaceId: string;
}

export interface PostReconciliationRequest {
  auth: AuthContext;
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
  workspaceId: string;
}

export interface PostEnvelopeRequest {
  auth: AuthContext;
  envelope: Envelope;
  workspaceId: string;
}

export interface PostEnvelopeAllocationRequest {
  auth: AuthContext;
  allocation: EnvelopeAllocation;
  workspaceId: string;
}

export interface PostScheduledTransactionRequest {
  auth: AuthContext;
  schedule: ScheduledTransaction;
  workspaceId: string;
}

export interface ExecuteScheduledTransactionRequest {
  auth: AuthContext;
  payload: {
    occurredOn: string;
    transactionId?: string;
  };
  scheduleId: string;
  workspaceId: string;
}

export interface ApplyScheduledTransactionExceptionRequest {
  auth: AuthContext;
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
  payload: {
    batchId: string;
    importedAt: string;
    rows: CsvImportRow[];
    sourceLabel: string;
  };
  workspaceId: string;
}

export interface WorkspaceEnvelope {
  workspace: FinanceWorkspaceDocument;
}

export interface DashboardEnvelope {
  dashboard: ReturnType<typeof import("@gnucash-ng/workspace").buildDashboardSnapshot>;
}

export type { ErrorEnvelope };
