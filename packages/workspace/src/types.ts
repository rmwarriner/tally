import type {
  Account,
  BaselineBudgetLine,
  Commodity,
  Envelope,
  EnvelopeAllocation,
  ImportSource,
  MoneyAmount,
  ScheduledTransaction,
  Transaction,
} from "@gnucash-ng/domain";

export interface ImportBatch {
  id: string;
  importedAt: string;
  provider: ImportSource["provider"];
  sourceLabel: string;
  transactionIds: string[];
  fingerprint: string;
}

export interface ReconciliationSession {
  id: string;
  accountId: string;
  statementDate: string;
  statementBalance: MoneyAmount;
  clearedTransactionIds: string[];
  difference: MoneyAmount;
  completedAt?: string;
}

export type AuditEventType =
  | "transaction.created"
  | "transaction.updated"
  | "schedule.upserted"
  | "schedule.executed"
  | "schedule.exception.applied"
  | "baseline-budget-line.upserted"
  | "envelope.upserted"
  | "envelope-allocation.recorded"
  | "reconciliation.recorded"
  | "import.csv.recorded"
  | "import.qif.recorded"
  | "import.ofx.recorded"
  | "import.qfx.recorded"
  | "import.gnucash-xml.recorded"
  | "close.recorded";

export interface WorkspaceClosePeriod {
  id: string;
  closedAt: string;
  closedBy: string;
  from: string;
  notes?: string;
  to: string;
}

export interface AuditEvent {
  id: string;
  workspaceId: string;
  actor: string;
  occurredAt: string;
  eventType: AuditEventType;
  entityIds: string[];
  summary: Record<string, unknown>;
}

export interface FinanceWorkspaceDocument {
  schemaVersion: 1;
  id: string;
  name: string;
  baseCommodityCode: string;
  householdMembers: string[];
  commodities: Commodity[];
  accounts: Account[];
  transactions: Transaction[];
  scheduledTransactions: ScheduledTransaction[];
  baselineBudgetLines: BaselineBudgetLine[];
  envelopes: Envelope[];
  envelopeAllocations: EnvelopeAllocation[];
  importBatches: ImportBatch[];
  reconciliationSessions: ReconciliationSession[];
  closePeriods?: WorkspaceClosePeriod[];
  auditEvents: AuditEvent[];
}

export interface CsvImportRow {
  occurredOn: string;
  description: string;
  amount: number;
  counterpartAccountId: string;
  cashAccountId: string;
  payee?: string;
  memo?: string;
  tags?: string[];
}
