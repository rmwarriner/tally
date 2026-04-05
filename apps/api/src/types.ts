import type {
  BaselineBudgetLine,
  Envelope,
  EnvelopeAllocation,
  ScheduledTransaction,
  Transaction,
} from "@gnucash-ng/domain";
import type { CsvImportRow, FinanceWorkspaceDocument } from "@gnucash-ng/workspace";
import type { Logger } from "@gnucash-ng/logging";
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

export interface GetDashboardRequest {
  auth: AuthContext;
  from: string;
  logger?: Logger;
  to: string;
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

export interface WorkspaceEnvelope {
  workspace: FinanceWorkspaceDocument;
}

export interface DashboardEnvelope {
  dashboard: ReturnType<typeof import("@gnucash-ng/workspace").buildDashboardSnapshot>;
}

export interface QifExportEnvelope {
  export: {
    contents: string;
    fileName: string;
    format: "qif";
    transactionCount: number;
  };
}

export type { ErrorEnvelope };
