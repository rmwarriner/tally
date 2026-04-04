import {
  advanceSchedule,
  createMoney,
  materializeScheduledTransaction,
  postTransaction,
  sumPostingsForAccount,
  validateBudgetConfiguration,
  validateEnvelope,
  validateTransactionForLedger,
  isScheduleDue,
  type BaselineBudgetLine,
  type Envelope,
  type EnvelopeAllocation,
  type ScheduledTransaction,
  type Transaction,
} from "@gnucash-ng/domain";
import { createNoopLogger, type Logger } from "@gnucash-ng/logging";
import { appendAuditEvent, type AuditContext } from "./audit";
import type {
  CsvImportRow,
  FinanceWorkspaceDocument,
  ImportBatch,
  ReconciliationSession,
} from "./types";

export interface CommandResult<TDocument = FinanceWorkspaceDocument> {
  ok: boolean;
  errors: string[];
  document: TDocument;
}

export interface CommandOptions {
  audit?: AuditContext;
  logger?: Logger;
}

export interface ExecuteScheduledTransactionInput {
  occurredOn: string;
  scheduleId: string;
  transactionId?: string;
}

export interface ApplyScheduledTransactionExceptionInput {
  action: "defer" | "skip-next";
  effectiveOn?: string;
  nextDueOn?: string;
  note?: string;
  scheduleId: string;
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T): T[] {
  const existingIndex = items.findIndex((item) => item.id === nextItem.id);

  if (existingIndex === -1) {
    return [...items, nextItem];
  }

  return items.map((item, index) => (index === existingIndex ? nextItem : item));
}

function fingerprintForTransaction(transaction: Transaction): string {
  return [
    transaction.occurredOn,
    transaction.description,
    transaction.payee ?? "",
    ...transaction.postings.map(
      (posting) =>
        `${posting.accountId}:${posting.amount.commodityCode}:${posting.amount.quantity}:${posting.memo ?? ""}`,
    ),
  ].join("|");
}

function duplicateImportFingerprints(document: FinanceWorkspaceDocument): Set<string> {
  return new Set(
    document.transactions
      .map((transaction) => transaction.source?.fingerprint)
      .filter((fingerprint): fingerprint is string => Boolean(fingerprint)),
  );
}

export function addTransaction(
  document: FinanceWorkspaceDocument,
  transaction: Transaction,
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    command: "addTransaction",
    transactionId: transaction.id,
    workspaceId: document.id,
  });
  logger.info("workspace command started");
  const validation = validateTransactionForLedger(transaction, document.accounts);

  if (!validation.ok) {
    logger.warn("workspace command validation failed", { errors: validation.errors });
    return { ok: false, errors: validation.errors, document };
  }

  const posted = postTransaction(
    { accounts: document.accounts, transactions: document.transactions },
    transaction,
  );

  if (!posted.ok) {
    logger.warn("workspace command failed", { errors: posted.errors });
    return { ok: false, errors: posted.errors, document };
  }

  logger.info("workspace command completed", {
    transactionCount: posted.ledger.transactions.length,
  });
  const nextDocument = appendAuditEvent(
    {
      ...document,
      transactions: posted.ledger.transactions,
    },
    {
      entityIds: [transaction.id],
      eventType: "transaction.created",
      summary: {
        description: transaction.description,
        occurredOn: transaction.occurredOn,
        postingCount: transaction.postings.length,
      },
    },
    options.audit,
  );

  return {
    ok: true,
    errors: [],
    document: nextDocument,
  };
}

export function updateTransaction(
  document: FinanceWorkspaceDocument,
  transactionId: string,
  transaction: Transaction,
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    command: "updateTransaction",
    transactionId,
    workspaceId: document.id,
  });
  logger.info("workspace command started");

  if (transaction.id !== transactionId) {
    const errors = ["Transaction id in payload must match the route identifier."];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  const existingTransaction = document.transactions.find((candidate) => candidate.id === transactionId);

  if (!existingTransaction) {
    const errors = [`Transaction ${transactionId} does not exist.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  const validation = validateTransactionForLedger(transaction, document.accounts);

  if (!validation.ok) {
    logger.warn("workspace command validation failed", { errors: validation.errors });
    return { ok: false, errors: validation.errors, document };
  }

  const nextTransactions = document.transactions.map((candidate) =>
    candidate.id === transactionId ? transaction : candidate,
  );

  logger.info("workspace command completed", {
    postingCount: transaction.postings.length,
    transactionCount: nextTransactions.length,
  });

  const nextDocument = appendAuditEvent(
    {
      ...document,
      transactions: nextTransactions,
    },
    {
      entityIds: [transactionId],
      eventType: "transaction.updated",
      summary: {
        description: transaction.description,
        occurredOn: transaction.occurredOn,
        postingCount: transaction.postings.length,
        previousOccurredOn: existingTransaction.occurredOn,
      },
    },
    options.audit,
  );

  return {
    ok: true,
    errors: [],
    document: nextDocument,
  };
}

export function upsertScheduledTransaction(
  document: FinanceWorkspaceDocument,
  schedule: ScheduledTransaction,
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    command: "upsertScheduledTransaction",
    scheduleId: schedule.id,
    workspaceId: document.id,
  });
  logger.info("workspace command started");
  const validation = validateTransactionForLedger(
    {
      ...schedule.templateTransaction,
      id: `${schedule.id}:template`,
      occurredOn: schedule.nextDueOn,
    },
    document.accounts,
  );

  if (!validation.ok) {
    logger.warn("workspace command validation failed", { errors: validation.errors });
    return { ok: false, errors: validation.errors, document };
  }

  logger.info("workspace command completed");
  const nextDocument = appendAuditEvent(
    {
      ...document,
      scheduledTransactions: upsertById(document.scheduledTransactions, schedule),
    },
    {
      entityIds: [schedule.id],
      eventType: "schedule.upserted",
      summary: {
        autoPost: schedule.autoPost,
        frequency: schedule.frequency,
        nextDueOn: schedule.nextDueOn,
      },
    },
    options.audit,
  );

  return {
    ok: true,
    errors: [],
    document: nextDocument,
  };
}

export function executeScheduledTransaction(
  document: FinanceWorkspaceDocument,
  input: ExecuteScheduledTransactionInput,
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    command: "executeScheduledTransaction",
    occurredOn: input.occurredOn,
    scheduleId: input.scheduleId,
    workspaceId: document.id,
  });
  logger.info("workspace command started");

  const schedule = document.scheduledTransactions.find((candidate) => candidate.id === input.scheduleId);

  if (!schedule) {
    const errors = [`Scheduled transaction ${input.scheduleId} does not exist.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) {
    const errors = ["Scheduled transaction occurredOn must use ISO date format YYYY-MM-DD."];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  if (!isScheduleDue(schedule, input.occurredOn)) {
    const errors = [`Scheduled transaction ${input.scheduleId} is not due on ${input.occurredOn}.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  const transaction = materializeScheduledTransaction(
    schedule,
    input.occurredOn,
    input.transactionId ?? `${input.scheduleId}:${input.occurredOn}`,
  );
  const posted = addTransaction(document, transaction, options);

  if (!posted.ok) {
    logger.warn("workspace command failed", { errors: posted.errors });
    return posted;
  }

  const nextSchedule = advanceSchedule(schedule);
  const nextDocument = appendAuditEvent(
    {
      ...posted.document,
      scheduledTransactions: posted.document.scheduledTransactions.map((candidate) =>
        candidate.id === schedule.id ? nextSchedule : candidate,
      ),
    },
    {
      entityIds: [schedule.id, transaction.id],
      eventType: "schedule.executed",
      summary: {
        nextDueOn: nextSchedule.nextDueOn,
        occurredOn: input.occurredOn,
        transactionId: transaction.id,
      },
    },
    options.audit,
  );

  logger.info("workspace command completed", {
    nextDueOn: nextSchedule.nextDueOn,
    transactionId: transaction.id,
  });

  return {
    ok: true,
    errors: [],
    document: nextDocument,
  };
}

export function applyScheduledTransactionException(
  document: FinanceWorkspaceDocument,
  input: ApplyScheduledTransactionExceptionInput,
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    action: input.action,
    command: "applyScheduledTransactionException",
    scheduleId: input.scheduleId,
    workspaceId: document.id,
  });
  logger.info("workspace command started");

  const schedule = document.scheduledTransactions.find((candidate) => candidate.id === input.scheduleId);

  if (!schedule) {
    const errors = [`Scheduled transaction ${input.scheduleId} does not exist.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  let nextSchedule: ScheduledTransaction | undefined;
  const errors: string[] = [];

  if (input.action === "skip-next") {
    const effectiveOn = input.effectiveOn ?? schedule.nextDueOn;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn)) {
      errors.push("Scheduled transaction effectiveOn must use ISO date format YYYY-MM-DD.");
    } else if (!isScheduleDue(schedule, effectiveOn)) {
      errors.push(`Scheduled transaction ${input.scheduleId} is not due on ${effectiveOn}.`);
    } else {
      nextSchedule = advanceSchedule(schedule);
    }
  }

  if (input.action === "defer") {
    if (!input.nextDueOn || !/^\d{4}-\d{2}-\d{2}$/.test(input.nextDueOn)) {
      errors.push("Scheduled transaction nextDueOn must use ISO date format YYYY-MM-DD.");
    } else if (input.nextDueOn <= schedule.nextDueOn) {
      errors.push("Scheduled transaction nextDueOn must be later than the current due date.");
    } else {
      nextSchedule = {
        ...schedule,
        nextDueOn: input.nextDueOn,
      };
    }
  }

  if (errors.length > 0 || !nextSchedule) {
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  const nextDocument = appendAuditEvent(
    {
      ...document,
      scheduledTransactions: document.scheduledTransactions.map((candidate) =>
        candidate.id === schedule.id ? nextSchedule : candidate,
      ),
    },
    {
      entityIds: [schedule.id],
      eventType: "schedule.exception.applied",
      summary: {
        action: input.action,
        nextDueOn: nextSchedule.nextDueOn,
        note: input.note,
        previousDueOn: schedule.nextDueOn,
      },
    },
    options.audit,
  );

  logger.info("workspace command completed", {
    nextDueOn: nextSchedule.nextDueOn,
    previousDueOn: schedule.nextDueOn,
  });

  return {
    ok: true,
    errors: [],
    document: nextDocument,
  };
}

export function upsertBaselineBudgetLine(
  document: FinanceWorkspaceDocument,
  line: BaselineBudgetLine,
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    accountId: line.accountId,
    command: "upsertBaselineBudgetLine",
    period: line.period,
    workspaceId: document.id,
  });
  logger.info("workspace command started");
  const lines = document.baselineBudgetLines.filter(
    (candidate) =>
      !(candidate.accountId === line.accountId && candidate.period === line.period),
  );

  const nextDocument: FinanceWorkspaceDocument = {
    ...document,
    baselineBudgetLines: [...lines, line].sort((left, right) =>
      `${left.period}:${left.accountId}`.localeCompare(`${right.period}:${right.accountId}`),
    ),
  };

  const errors = validateBudgetConfiguration(
    nextDocument.baselineBudgetLines,
    nextDocument.envelopes,
    nextDocument.accounts,
  );

  if (errors.length > 0) {
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  logger.info("workspace command completed", {
    baselineBudgetLineCount: nextDocument.baselineBudgetLines.length,
  });

  return {
    ok: true,
    errors: [],
    document: appendAuditEvent(
      nextDocument,
      {
        entityIds: [line.accountId],
        eventType: "baseline-budget-line.upserted",
        summary: {
          period: line.period,
          plannedAmount: line.plannedAmount.quantity,
        },
      },
      options.audit,
    ),
  };
}

export function upsertEnvelope(
  document: FinanceWorkspaceDocument,
  envelope: Envelope,
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    command: "upsertEnvelope",
    envelopeId: envelope.id,
    workspaceId: document.id,
  });
  logger.info("workspace command started");
  const envelopeValidation = validateEnvelope(envelope, document.accounts);

  if (!envelopeValidation.ok) {
    logger.warn("workspace command validation failed", { errors: envelopeValidation.errors });
    return { ok: false, errors: envelopeValidation.errors, document };
  }

  const nextDocument: FinanceWorkspaceDocument = {
    ...document,
    envelopes: upsertById(document.envelopes, envelope),
  };
  const configErrors = validateBudgetConfiguration(
    nextDocument.baselineBudgetLines,
    nextDocument.envelopes,
    nextDocument.accounts,
  );

  if (configErrors.length > 0) {
    logger.warn("workspace command validation failed", { errors: configErrors });
    return { ok: false, errors: configErrors, document };
  }

  logger.info("workspace command completed", {
    envelopeCount: nextDocument.envelopes.length,
  });

  return {
    ok: true,
    errors: [],
    document: appendAuditEvent(
      nextDocument,
      {
        entityIds: [envelope.id, envelope.expenseAccountId, envelope.fundingAccountId],
        eventType: "envelope.upserted",
        summary: {
          name: envelope.name,
          rolloverEnabled: envelope.rolloverEnabled,
        },
      },
      options.audit,
    ),
  };
}

export function recordEnvelopeAllocation(
  document: FinanceWorkspaceDocument,
  allocation: EnvelopeAllocation,
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    allocationId: allocation.id,
    command: "recordEnvelopeAllocation",
    envelopeId: allocation.envelopeId,
    workspaceId: document.id,
  });
  logger.info("workspace command started");
  const envelope = document.envelopes.find((candidate) => candidate.id === allocation.envelopeId);

  if (!envelope) {
    logger.warn("workspace command validation failed", {
      errors: [`Unknown envelope ${allocation.envelopeId}.`],
    });
    return {
      ok: false,
      errors: [`Unknown envelope ${allocation.envelopeId}.`],
      document,
    };
  }

  if (allocation.amount.commodityCode !== envelope.availableAmount.commodityCode) {
    logger.warn("workspace command validation failed", {
      errors: ["Envelope allocation commodity must match the envelope commodity."],
    });
    return {
      ok: false,
      errors: ["Envelope allocation commodity must match the envelope commodity."],
      document,
    };
  }

  logger.info("workspace command completed", {
    envelopeAllocationCount: document.envelopeAllocations.length + 1,
  });
  const nextDocument = appendAuditEvent(
    {
      ...document,
      envelopeAllocations: [...document.envelopeAllocations, allocation].sort((left, right) =>
        `${left.occurredOn}:${left.id}`.localeCompare(`${right.occurredOn}:${right.id}`),
      ),
    },
    {
      entityIds: [allocation.id, allocation.envelopeId],
      eventType: "envelope-allocation.recorded",
      summary: {
        amount: allocation.amount.quantity,
        occurredOn: allocation.occurredOn,
        type: allocation.type,
      },
    },
    options.audit,
  );

  return {
    ok: true,
    errors: [],
    document: nextDocument,
  };
}

export function reconcileAccount(
  document: FinanceWorkspaceDocument,
  params: {
    accountId: string;
    statementDate: string;
    statementBalance: number;
    clearedTransactionIds: string[];
    reconciliationId?: string;
  },
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    accountId: params.accountId,
    command: "reconcileAccount",
    statementDate: params.statementDate,
    workspaceId: document.id,
  });
  logger.info("workspace command started", {
    clearedTransactionIds: params.clearedTransactionIds,
  });
  const account = document.accounts.find((candidate) => candidate.id === params.accountId);

  if (!account) {
    logger.warn("workspace command validation failed", {
      errors: [`Unknown account ${params.accountId}.`],
    });
    return { ok: false, errors: [`Unknown account ${params.accountId}.`], document };
  }

  const clearedTransactions = document.transactions.filter((transaction) =>
    params.clearedTransactionIds.includes(transaction.id),
  );
  const clearedBalance = sumPostingsForAccount(
    account.id,
    clearedTransactions,
    document.baseCommodityCode,
    params.statementDate,
  );
  const difference = createMoney(
    document.baseCommodityCode,
    params.statementBalance - clearedBalance.quantity,
  );
  const session: ReconciliationSession = {
    id: params.reconciliationId ?? `recon:${account.id}:${params.statementDate}`,
    accountId: account.id,
    statementDate: params.statementDate,
    statementBalance: createMoney(document.baseCommodityCode, params.statementBalance),
    clearedTransactionIds: params.clearedTransactionIds,
    difference,
    completedAt: difference.quantity === 0 ? params.statementDate : undefined,
  };

  const nextTransactions = document.transactions.map((transaction) => {
    if (!params.clearedTransactionIds.includes(transaction.id)) {
      return transaction;
    }

    return {
      ...transaction,
      postings: transaction.postings.map((posting) =>
        posting.accountId === account.id
          ? { ...posting, cleared: true, reconciledAt: session.completedAt }
          : posting,
      ),
    };
  });

  const errors = difference.quantity === 0 ? [] : ["Reconciliation difference is not zero."];
  if (errors.length > 0) {
    logger.warn("workspace command completed with warnings", {
      difference: difference.quantity,
      errors,
    });
  } else {
    logger.info("workspace command completed", {
      difference: difference.quantity,
      reconciledTransactionCount: params.clearedTransactionIds.length,
    });
  }

  const nextDocument = appendAuditEvent(
    {
      ...document,
      transactions: nextTransactions,
      reconciliationSessions: upsertById(document.reconciliationSessions, session),
    },
    {
      entityIds: [account.id, ...params.clearedTransactionIds],
      eventType: "reconciliation.recorded",
      summary: {
        difference: difference.quantity,
        statementBalance: params.statementBalance,
        statementDate: params.statementDate,
      },
    },
    options.audit,
  );

  return {
    ok: true,
    errors,
    document: nextDocument,
  };
}

export function importTransactionsFromCsvRows(
  document: FinanceWorkspaceDocument,
  rows: CsvImportRow[],
  metadata: {
    batchId: string;
    sourceLabel: string;
    importedAt: string;
  },
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    batchId: metadata.batchId,
    command: "importTransactionsFromCsvRows",
    provider: "csv",
    sourceLabel: metadata.sourceLabel,
    workspaceId: document.id,
  });
  logger.info("workspace command started", { rowCount: rows.length });
  const seenFingerprints = duplicateImportFingerprints(document);
  const transactionsToImport: Transaction[] = [];
  const errors: string[] = [];
  let skippedDuplicates = 0;

  for (const [index, row] of rows.entries()) {
    const transaction: Transaction = {
      id: `${metadata.batchId}:${index + 1}`,
      occurredOn: row.occurredOn,
      description: row.description,
      payee: row.payee,
      postings: [
        {
          accountId: row.counterpartAccountId,
          amount: createMoney(document.baseCommodityCode, Math.abs(row.amount)),
          memo: row.memo,
        },
        {
          accountId: row.cashAccountId,
          amount: createMoney(document.baseCommodityCode, -Math.abs(row.amount)),
          memo: row.memo,
          cleared: true,
        },
      ],
      tags: row.tags,
      source: {
        provider: "csv",
        fingerprint: [
          metadata.sourceLabel,
          row.occurredOn,
          row.description,
          row.amount.toFixed(2),
          row.cashAccountId,
          row.counterpartAccountId,
        ].join("|"),
        importedAt: metadata.importedAt,
        externalReference: `${metadata.batchId}:${index + 1}`,
      },
    };
    const validation = validateTransactionForLedger(transaction, document.accounts);

    if (!validation.ok) {
      errors.push(...validation.errors.map((error) => `row ${index + 1}: ${error}`));
      continue;
    }

    if (seenFingerprints.has(transaction.source!.fingerprint)) {
      skippedDuplicates += 1;
      continue;
    }

    seenFingerprints.add(transaction.source!.fingerprint);
    transactionsToImport.push(transaction);
  }

  if (errors.length > 0) {
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  let nextDocument = document;

  for (const transaction of transactionsToImport) {
    const result = addTransaction(nextDocument, transaction, {
      audit: { ...options.audit, disabled: true },
      logger,
    });

    if (!result.ok) {
      logger.warn("workspace command failed while posting imported transactions", {
        errors: result.errors,
      });
      return result;
    }

    nextDocument = result.document;
  }

  const batch: ImportBatch = {
    id: metadata.batchId,
    importedAt: metadata.importedAt,
    provider: "csv",
    sourceLabel: metadata.sourceLabel,
    transactionIds: transactionsToImport.map((transaction) => transaction.id),
    fingerprint: transactionsToImport.map(fingerprintForTransaction).join("||"),
  };

  logger.info("workspace command completed", {
    importedTransactionCount: transactionsToImport.length,
    skippedDuplicates,
  });

  return {
    ok: true,
    errors: [],
    document: appendAuditEvent(
      {
      ...nextDocument,
      importBatches: upsertById(nextDocument.importBatches, batch),
      },
      {
        entityIds: [batch.id, ...batch.transactionIds],
        eventType: "import.csv.recorded",
        summary: {
          importedAt: metadata.importedAt,
          importedTransactionCount: transactionsToImport.length,
          skippedDuplicates,
          sourceLabel: metadata.sourceLabel,
        },
      },
      options.audit,
    ),
  };
}
