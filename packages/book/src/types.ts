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
} from "@tally/domain";

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
  | "transaction.deleted"
  | "transaction.restored"
  | "transaction.destroyed"
  | "schedule.upserted"
  | "schedule.executed"
  | "schedule.exception.applied"
  | "baseline-budget-line.upserted"
  | "envelope.upserted"
  | "envelope-allocation.recorded"
  | "envelope.overspend-covered"
  | "reconciliation.recorded"
  | "import.csv.recorded"
  | "import.qif.recorded"
  | "import.ofx.recorded"
  | "import.qfx.recorded"
  | "import.gnucash-xml.recorded"
  | "close.recorded"
  | "household-member.added"
  | "household-member.removed"
  | "household-member.role-changed"
  | "approval.requested"
  | "approval.granted"
  | "approval.denied"
  | "account.upserted"
  | "account.archived";

export type ApprovalKind = "destroy-transaction";

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";

export interface PendingApproval {
  id: string;
  kind: ApprovalKind;
  entityId: string;
  requestedBy: string;
  requestedAt: string;
  expiresAt: string;
  status: ApprovalStatus;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface BookClosePeriod {
  id: string;
  closedAt: string;
  closedBy: string;
  from: string;
  notes?: string;
  to: string;
}

export interface AuditEvent {
  id: string;
  bookId: string;
  actor: string;
  occurredAt: string;
  eventType: AuditEventType;
  entityIds: string[];
  summary: Record<string, unknown>;
}

export interface Attachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  createdBy: string;
  storageKey: string;
}

export interface FinanceBookDocument {
  schemaVersion: 1;
  version: number;
  id: string;
  name: string;
  baseCommodityCode: string;
  householdMembers: string[];
  householdMemberRoles?: Partial<Record<string, "admin" | "guardian" | "member">>;
  commodities: Commodity[];
  accounts: Account[];
  transactions: Transaction[];
  scheduledTransactions: ScheduledTransaction[];
  baselineBudgetLines: BaselineBudgetLine[];
  envelopes: Envelope[];
  envelopeAllocations: EnvelopeAllocation[];
  importBatches: ImportBatch[];
  reconciliationSessions: ReconciliationSession[];
  closePeriods?: BookClosePeriod[];
  pendingApprovals?: PendingApproval[];
  attachments?: Attachment[];
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
