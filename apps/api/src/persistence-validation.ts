import {
  validateBudgetConfiguration,
  validateTransactionForLedger,
} from "@tally/domain";
import type { FinanceBookDocument } from "@tally/book";

export interface BookValidationReport {
  ok: boolean;
  issues: string[];
  summary: {
    accountCount: number;
    auditEventCount: number;
    baselineBudgetLineCount: number;
    closePeriodCount: number;
    envelopeAllocationCount: number;
    envelopeCount: number;
    importBatchCount: number;
    reconciliationSessionCount: number;
    scheduledTransactionCount: number;
    transactionCount: number;
    bookId: string;
  };
}

function pushDuplicateIdIssues(params: {
  ids: string[];
  issues: string[];
  label: string;
}): void {
  const seen = new Set<string>();

  for (const id of params.ids) {
    if (seen.has(id)) {
      params.issues.push(`Duplicate ${params.label} id ${id}.`);
      continue;
    }

    seen.add(id);
  }
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isIsoTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value);
}

export function validateBookDocumentForPersistence(
  document: FinanceBookDocument,
): BookValidationReport {
  const issues: string[] = [];
  if (!Number.isInteger(document.version) || document.version < 1) {
    issues.push("Book version must be a positive integer.");
  }
  const accountIds = new Set(document.accounts.map((account) => account.id));
  const transactionIds = new Set(document.transactions.map((transaction) => transaction.id));
  const envelopeIds = new Set(document.envelopes.map((envelope) => envelope.id));

  pushDuplicateIdIssues({
    ids: document.accounts.map((account) => account.id),
    issues,
    label: "account",
  });
  pushDuplicateIdIssues({
    ids: document.transactions.map((transaction) => transaction.id),
    issues,
    label: "transaction",
  });
  pushDuplicateIdIssues({
    ids: document.scheduledTransactions.map((schedule) => schedule.id),
    issues,
    label: "scheduled transaction",
  });
  pushDuplicateIdIssues({
    ids: document.baselineBudgetLines.map(
      (line) => `${line.accountId}:${line.period}:${line.budgetPeriod}`,
    ),
    issues,
    label: "baseline budget line",
  });
  pushDuplicateIdIssues({
    ids: document.envelopes.map((envelope) => envelope.id),
    issues,
    label: "envelope",
  });
  pushDuplicateIdIssues({
    ids: document.envelopeAllocations.map((allocation) => allocation.id),
    issues,
    label: "envelope allocation",
  });
  pushDuplicateIdIssues({
    ids: document.importBatches.map((batch) => batch.id),
    issues,
    label: "import batch",
  });
  pushDuplicateIdIssues({
    ids: document.reconciliationSessions.map((session) => session.id),
    issues,
    label: "reconciliation session",
  });
  pushDuplicateIdIssues({
    ids: (document.closePeriods ?? []).map((period) => period.id),
    issues,
    label: "close period",
  });
  pushDuplicateIdIssues({
    ids: document.auditEvents.map((event) => event.id),
    issues,
    label: "audit event",
  });

  for (const account of document.accounts) {
    if (account.parentAccountId && !accountIds.has(account.parentAccountId)) {
      issues.push(`Account ${account.id} references unknown parent account ${account.parentAccountId}.`);
    }
  }

  for (const transaction of document.transactions) {
    if (transaction.deletion) {
      if (!transaction.deletion.deletedBy.trim()) {
        issues.push(`Transaction ${transaction.id}: deletedBy is required when deletion metadata is present.`);
      }

      if (Number.isNaN(Date.parse(transaction.deletion.deletedAt))) {
        issues.push(`Transaction ${transaction.id}: deletedAt must be a valid ISO timestamp.`);
      }
    }

    const validation = validateTransactionForLedger(transaction, document.accounts);

    if (!validation.ok) {
      issues.push(...validation.errors.map((error: string) => `Transaction ${transaction.id}: ${error}`));
    }
  }

  for (const schedule of document.scheduledTransactions) {
    const validation = validateTransactionForLedger(
      {
        ...schedule.templateTransaction,
        id: `${schedule.id}:template`,
        occurredOn: schedule.nextDueOn,
      },
      document.accounts,
    );

    if (!validation.ok) {
      issues.push(...validation.errors.map((error: string) => `Schedule ${schedule.id}: ${error}`));
    }
  }

  for (const allocation of document.envelopeAllocations) {
    if (!envelopeIds.has(allocation.envelopeId)) {
      issues.push(`Envelope allocation ${allocation.id} references unknown envelope ${allocation.envelopeId}.`);
    }

    if (!isIsoDate(allocation.occurredOn)) {
      issues.push(`Envelope allocation ${allocation.id} occurredOn must use ISO date format YYYY-MM-DD.`);
    }

    if (!allocation.amount.commodityCode.trim()) {
      issues.push(`Envelope allocation ${allocation.id} commodity code is required.`);
    }

    if (!Number.isFinite(allocation.amount.quantity) || allocation.amount.quantity <= 0) {
      issues.push(`Envelope allocation ${allocation.id} amount must be a positive finite number.`);
    }
  }

  for (const batch of document.importBatches) {
    for (const transactionId of batch.transactionIds) {
      if (!transactionIds.has(transactionId)) {
        issues.push(`Import batch ${batch.id} references unknown transaction ${transactionId}.`);
      }
    }
  }

  for (const session of document.reconciliationSessions) {
    if (!accountIds.has(session.accountId)) {
      issues.push(`Reconciliation session ${session.id} references unknown account ${session.accountId}.`);
    }

    if (!isIsoDate(session.statementDate)) {
      issues.push(`Reconciliation session ${session.id} statementDate must use ISO date format YYYY-MM-DD.`);
    }
  }

  for (const period of document.closePeriods ?? []) {
    if (!isIsoDate(period.from) || !isIsoDate(period.to)) {
      issues.push(`Close period ${period.id} must use ISO date format YYYY-MM-DD.`);
    }

    if (period.from > period.to) {
      issues.push(`Close period ${period.id} has from after to.`);
    }

    if (!period.closedBy.trim()) {
      issues.push(`Close period ${period.id} closedBy is required.`);
    }
  }

  for (const event of document.auditEvents) {
    if (event.bookId !== document.id) {
      issues.push(`Audit event ${event.id} references book ${event.bookId} but document id is ${document.id}.`);
    }

    if (!event.actor.trim()) {
      issues.push(`Audit event ${event.id} actor is required.`);
    }

    if (!isIsoTimestamp(event.occurredAt)) {
      issues.push(`Audit event ${event.id} occurredAt must use ISO timestamp format.`);
    }
  }

  issues.push(
    ...validateBudgetConfiguration(
      document.baselineBudgetLines,
      document.envelopes,
      document.accounts,
    ),
  );

  return {
    ok: issues.length === 0,
    issues,
    summary: {
      accountCount: document.accounts.length,
      auditEventCount: document.auditEvents.length,
      baselineBudgetLineCount: document.baselineBudgetLines.length,
      closePeriodCount: (document.closePeriods ?? []).length,
      envelopeAllocationCount: document.envelopeAllocations.length,
      envelopeCount: document.envelopes.length,
      importBatchCount: document.importBatches.length,
      reconciliationSessionCount: document.reconciliationSessions.length,
      scheduledTransactionCount: document.scheduledTransactions.length,
      transactionCount: document.transactions.length,
      bookId: document.id,
    },
  };
}
