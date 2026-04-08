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
  type Account,
  type AccountType,
  type BaselineBudgetLine,
  type Envelope,
  type EnvelopeAllocation,
  type ScheduledTransaction,
  type Transaction,
} from "@tally/domain";
import { createNoopLogger, type Logger } from "@tally/logging";
import { appendAuditEvent, type AuditContext } from "./audit";
import { parseGnuCashXml } from "./gnucash-xml";
import { parseOfxStatement } from "./ofx";
import { parseQif } from "./qif";
import { buildCloseSummary } from "./reports";
import {
  isTransactionDeleted,
  listActiveTransactions,
  replaceActiveTransactions,
} from "./transaction-lifecycle";
import type {
  ApprovalKind,
  CsvImportRow,
  FinanceWorkspaceDocument,
  ImportBatch,
  PendingApproval,
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

export interface DeleteTransactionInput {
  deletedAt?: string;
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

function findLockingClosePeriod(
  document: FinanceWorkspaceDocument,
  date: string,
): NonNullable<FinanceWorkspaceDocument["closePeriods"]>[number] | undefined {
  return (document.closePeriods ?? []).find(
    (period) => date >= period.from && date <= period.to,
  );
}

function lockErrorForDate(document: FinanceWorkspaceDocument, date: string): string | undefined {
  const lockingPeriod = findLockingClosePeriod(document, date);

  if (!lockingPeriod) {
    return undefined;
  }

  return `Date ${date} is locked by closed period ${lockingPeriod.from} through ${lockingPeriod.to}.`;
}

function actorForMutation(options: CommandOptions): string {
  return options.audit?.actor ?? "system";
}

function referencedTransactionErrors(document: FinanceWorkspaceDocument, transactionId: string): string[] {
  const errors: string[] = [];

  const importBatch = document.importBatches.find((batch) => batch.transactionIds.includes(transactionId));
  if (importBatch) {
    errors.push(`Transaction ${transactionId} is referenced by import batch ${importBatch.id}.`);
  }

  const reconciliationSession = document.reconciliationSessions.find((session) =>
    session.clearedTransactionIds.includes(transactionId),
  );
  if (reconciliationSession) {
    errors.push(`Transaction ${transactionId} is referenced by reconciliation session ${reconciliationSession.id}.`);
  }

  return errors;
}

function buildImportedTransaction(params: {
  amount: number;
  batchId: string;
  cashAccountId: string;
  counterpartAccountId: string;
  description: string;
  importedAt: string;
  index: number;
  memo?: string;
  occurredOn: string;
  payee?: string;
  provider: "csv" | "gnucash-xml" | "ofx" | "qfx" | "qif";
  externalReference?: string;
  sourceFingerprintParts: string[];
  tags?: string[];
  workspace: FinanceWorkspaceDocument;
}): Transaction {
  const absoluteAmount = Math.abs(params.amount);
  const cashQuantity = params.amount >= 0 ? absoluteAmount : -absoluteAmount;
  const counterpartQuantity = -cashQuantity;

  return {
    id: `${params.batchId}:${params.index + 1}`,
    occurredOn: params.occurredOn,
    description: params.description,
    payee: params.payee,
    postings: [
      {
        accountId: params.counterpartAccountId,
        amount: createMoney(params.workspace.baseCommodityCode, counterpartQuantity),
        memo: params.memo,
      },
      {
        accountId: params.cashAccountId,
        amount: createMoney(params.workspace.baseCommodityCode, cashQuantity),
        memo: params.memo,
        cleared: true,
      },
    ],
    tags: params.tags,
    source: {
      provider: params.provider,
      fingerprint: params.sourceFingerprintParts.join("|"),
      importedAt: params.importedAt,
      externalReference: params.externalReference ?? `${params.batchId}:${params.index + 1}`,
    },
  };
}

function finalizeImportedTransactions(params: {
  batchId: string;
  document: FinanceWorkspaceDocument;
  eventType:
    | "import.csv.recorded"
    | "import.gnucash-xml.recorded"
    | "import.ofx.recorded"
    | "import.qfx.recorded"
    | "import.qif.recorded";
  importedAt: string;
  logger: Logger;
  options: CommandOptions;
  provider: ImportBatch["provider"];
  skippedDuplicates: number;
  sourceLabel: string;
  transactionsToImport: Transaction[];
}): CommandResult {
  let nextDocument = params.document;

  for (const transaction of params.transactionsToImport) {
    const result = addTransaction(nextDocument, transaction, {
      audit: { ...params.options.audit, disabled: true },
      logger: params.logger,
    });

    if (!result.ok) {
      params.logger.warn("workspace command failed while posting imported transactions", {
        errors: result.errors,
      });
      return result;
    }

    nextDocument = result.document;
  }

  const batch: ImportBatch = {
    id: params.batchId,
    importedAt: params.importedAt,
    provider: params.provider,
    sourceLabel: params.sourceLabel,
    transactionIds: params.transactionsToImport.map((transaction) => transaction.id),
    fingerprint: params.transactionsToImport.map(fingerprintForTransaction).join("||"),
  };

  params.logger.info("workspace command completed", {
    importedTransactionCount: params.transactionsToImport.length,
    skippedDuplicates: params.skippedDuplicates,
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
        eventType: params.eventType,
        summary: {
          importedAt: params.importedAt,
          importedTransactionCount: params.transactionsToImport.length,
          skippedDuplicates: params.skippedDuplicates,
          sourceLabel: params.sourceLabel,
        },
      },
      params.options.audit,
    ),
  };
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
  const lockError = lockErrorForDate(document, transaction.occurredOn);

  if (lockError) {
    logger.warn("workspace command validation failed", { errors: [lockError] });
    return { ok: false, errors: [lockError], document };
  }

  const validation = validateTransactionForLedger(transaction, document.accounts);

  if (!validation.ok) {
    logger.warn("workspace command validation failed", { errors: validation.errors });
    return { ok: false, errors: validation.errors, document };
  }

  const posted = postTransaction(
    { accounts: document.accounts, transactions: listActiveTransactions(document.transactions) },
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
      transactions: replaceActiveTransactions(document, posted.ledger.transactions),
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

  if (isTransactionDeleted(existingTransaction)) {
    const errors = [`Transaction ${transactionId} is soft-deleted and cannot be updated.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  const existingLockError = lockErrorForDate(document, existingTransaction.occurredOn);

  if (existingLockError) {
    logger.warn("workspace command validation failed", { errors: [existingLockError] });
    return { ok: false, errors: [existingLockError], document };
  }

  const nextLockError = lockErrorForDate(document, transaction.occurredOn);

  if (nextLockError) {
    logger.warn("workspace command validation failed", { errors: [nextLockError] });
    return { ok: false, errors: [nextLockError], document };
  }

  const validation = validateTransactionForLedger(transaction, document.accounts);

  if (!validation.ok) {
    logger.warn("workspace command validation failed", { errors: validation.errors });
    return { ok: false, errors: validation.errors, document };
  }

  const nextTransactions = listActiveTransactions(document.transactions).map((candidate) =>
    candidate.id === transactionId ? transaction : candidate,
  );

  logger.info("workspace command completed", {
    postingCount: transaction.postings.length,
    transactionCount: nextTransactions.length,
  });

  const nextDocument = appendAuditEvent(
    {
      ...document,
      transactions: replaceActiveTransactions(document, nextTransactions),
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

export function deleteTransaction(
  document: FinanceWorkspaceDocument,
  transactionId: string,
  input: DeleteTransactionInput = {},
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    command: "deleteTransaction",
    transactionId,
    workspaceId: document.id,
  });
  logger.info("workspace command started");

  const existingTransaction = document.transactions.find((candidate) => candidate.id === transactionId);

  if (!existingTransaction) {
    const errors = [`Transaction ${transactionId} does not exist.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  if (isTransactionDeleted(existingTransaction)) {
    const errors = [`Transaction ${transactionId} is already soft-deleted.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  const lockError = lockErrorForDate(document, existingTransaction.occurredOn);
  if (lockError) {
    logger.warn("workspace command validation failed", { errors: [lockError] });
    return { ok: false, errors: [lockError], document };
  }

  const deletedAt = input.deletedAt ?? options.audit?.occurredAt ?? new Date().toISOString();
  const deletedBy = actorForMutation(options);
  const nextTransactions = listActiveTransactions(document.transactions).map((candidate) =>
    candidate.id === transactionId
      ? {
          ...candidate,
          deletion: {
            deletedAt,
            deletedBy,
          },
        }
      : candidate,
  );

  logger.info("workspace command completed", {
    deletedAt,
    deletedBy,
    transactionCount: nextTransactions.length,
  });

  const nextDocument = appendAuditEvent(
    {
      ...document,
      transactions: replaceActiveTransactions(document, nextTransactions),
    },
    {
      entityIds: [transactionId],
      eventType: "transaction.deleted",
      summary: {
        deletedAt,
        deletedBy,
        description: existingTransaction.description,
        occurredOn: existingTransaction.occurredOn,
        postingCount: existingTransaction.postings.length,
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

export function destroyTransaction(
  document: FinanceWorkspaceDocument,
  transactionId: string,
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    command: "destroyTransaction",
    transactionId,
    workspaceId: document.id,
  });
  logger.info("workspace command started");

  const existingTransaction = document.transactions.find((candidate) => candidate.id === transactionId);

  if (!existingTransaction) {
    const errors = [`Transaction ${transactionId} does not exist.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  const lockError = lockErrorForDate(document, existingTransaction.occurredOn);
  if (lockError) {
    logger.warn("workspace command validation failed", { errors: [lockError] });
    return { ok: false, errors: [lockError], document };
  }

  const referenceErrors = referencedTransactionErrors(document, transactionId);
  if (referenceErrors.length > 0) {
    logger.warn("workspace command validation failed", { errors: referenceErrors });
    return { ok: false, errors: referenceErrors, document };
  }

  const nextTransactions = document.transactions.filter((candidate) => candidate.id !== transactionId);

  logger.info("workspace command completed", {
    destroyedPreviouslyDeleted: isTransactionDeleted(existingTransaction),
    transactionCount: nextTransactions.length,
  });

  const nextDocument = appendAuditEvent(
    {
      ...document,
      transactions: nextTransactions,
    },
    {
      entityIds: [transactionId],
      eventType: "transaction.destroyed",
      summary: {
        deletedAt: existingTransaction.deletion?.deletedAt,
        deletedBy: existingTransaction.deletion?.deletedBy,
        description: existingTransaction.description,
        occurredOn: existingTransaction.occurredOn,
        postingCount: existingTransaction.postings.length,
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

  const lockError = lockErrorForDate(document, input.occurredOn);

  if (lockError) {
    logger.warn("workspace command validation failed", { errors: [lockError] });
    return { ok: false, errors: [lockError], document };
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
  const lockError = lockErrorForDate(document, allocation.occurredOn);

  if (lockError) {
    logger.warn("workspace command validation failed", { errors: [lockError] });
    return {
      ok: false,
      errors: [lockError],
      document,
    };
  }

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
  const lockError = lockErrorForDate(document, params.statementDate);

  if (lockError) {
    logger.warn("workspace command validation failed", { errors: [lockError] });
    return { ok: false, errors: [lockError], document };
  }

  const account = document.accounts.find((candidate) => candidate.id === params.accountId);

  if (!account) {
    logger.warn("workspace command validation failed", {
      errors: [`Unknown account ${params.accountId}.`],
    });
    return { ok: false, errors: [`Unknown account ${params.accountId}.`], document };
  }

  const activeTransactions = listActiveTransactions(document.transactions);

  const missingTransactionIds = params.clearedTransactionIds.filter(
    (transactionId) => !activeTransactions.some((transaction) => transaction.id === transactionId),
  );

  if (missingTransactionIds.length > 0) {
    const errors = missingTransactionIds.map(
      (transactionId) => `Transaction ${transactionId} does not exist or is soft-deleted.`,
    );
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  const clearedTransactions = activeTransactions.filter((transaction) =>
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

  const nextTransactions = activeTransactions.map((transaction) => {
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
      transactions: replaceActiveTransactions(document, nextTransactions),
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
    const lockError = lockErrorForDate(document, row.occurredOn);

    if (lockError) {
      errors.push(`row ${index + 1}: ${lockError}`);
      continue;
    }

    const transaction = buildImportedTransaction({
      amount: -Math.abs(row.amount),
      batchId: metadata.batchId,
      cashAccountId: row.cashAccountId,
      counterpartAccountId: row.counterpartAccountId,
      description: row.description,
      importedAt: metadata.importedAt,
      index,
      memo: row.memo,
      occurredOn: row.occurredOn,
      payee: row.payee,
      provider: "csv",
      sourceFingerprintParts: [
        metadata.sourceLabel,
        row.occurredOn,
        row.description,
        row.amount.toFixed(2),
        row.cashAccountId,
        row.counterpartAccountId,
      ],
      tags: row.tags,
      workspace: document,
    });
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

  return finalizeImportedTransactions({
    batchId: metadata.batchId,
    document,
    eventType: "import.csv.recorded",
    importedAt: metadata.importedAt,
    logger,
    options,
    provider: "csv",
    skippedDuplicates,
    sourceLabel: metadata.sourceLabel,
    transactionsToImport,
  });
}

export function importTransactionsFromQif(
  document: FinanceWorkspaceDocument,
  params: {
    batchId: string;
    cashAccountId: string;
    categoryMappings?: Record<string, string>;
    defaultCounterpartAccountId: string;
    importedAt: string;
    qif: string;
    sourceLabel: string;
  },
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    batchId: params.batchId,
    command: "importTransactionsFromQif",
    provider: "qif",
    sourceLabel: params.sourceLabel,
    workspaceId: document.id,
  });
  logger.info("workspace command started");
  const parsed = parseQif(params.qif);

  if (parsed.errors.length > 0) {
    logger.warn("workspace command validation failed", { errors: parsed.errors });
    return { ok: false, errors: parsed.errors, document };
  }

  const seenFingerprints = duplicateImportFingerprints(document);
  const transactionsToImport: Transaction[] = [];
  let skippedDuplicates = 0;

  for (const [index, entry] of parsed.entries.entries()) {
    const lockError = lockErrorForDate(document, entry.date);

    if (lockError) {
      const errors = [`entry ${index + 1}: ${lockError}`];
      logger.warn("workspace command validation failed", { errors });
      return { ok: false, errors, document };
    }

    const category = entry.category?.trim();
    const counterpartAccountId =
      (category ? params.categoryMappings?.[category] : undefined) ?? params.defaultCounterpartAccountId;
    const description = entry.memo ?? entry.payee ?? category ?? "Imported QIF transaction";
    const transaction = buildImportedTransaction({
      amount: entry.amount,
      batchId: params.batchId,
      cashAccountId: params.cashAccountId,
      counterpartAccountId,
      description,
      importedAt: params.importedAt,
      index,
      memo: entry.memo,
      occurredOn: entry.date,
      payee: entry.payee,
      provider: "qif",
      sourceFingerprintParts: [
        params.sourceLabel,
        entry.date,
        String(entry.amount),
        params.cashAccountId,
        counterpartAccountId,
        category ?? "",
      ],
      workspace: document,
    });
    const validation = validateTransactionForLedger(transaction, document.accounts);

    if (!validation.ok) {
      const errors = validation.errors.map((error) => `entry ${index + 1}: ${error}`);
      logger.warn("workspace command validation failed", { errors });
      return { ok: false, errors, document };
    }

    if (seenFingerprints.has(transaction.source!.fingerprint)) {
      skippedDuplicates += 1;
      continue;
    }

    seenFingerprints.add(transaction.source!.fingerprint);
    transactionsToImport.push(transaction);
  }

  return finalizeImportedTransactions({
    batchId: params.batchId,
    document,
    eventType: "import.qif.recorded",
    importedAt: params.importedAt,
    logger,
    options,
    provider: "qif",
    skippedDuplicates,
    sourceLabel: params.sourceLabel,
    transactionsToImport,
  });
}

export function importTransactionsFromStatement(
  document: FinanceWorkspaceDocument,
  params: {
    batchId: string;
    cashAccountId: string;
    defaultCounterpartAccountId: string;
    format: "ofx" | "qfx";
    importedAt: string;
    nameMappings?: Record<string, string>;
    sourceLabel: string;
    statement: string;
  },
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    batchId: params.batchId,
    command: "importTransactionsFromStatement",
    provider: params.format,
    sourceLabel: params.sourceLabel,
    workspaceId: document.id,
  });
  logger.info("workspace command started");
  const parsed = parseOfxStatement(params.statement);

  if (parsed.errors.length > 0) {
    logger.warn("workspace command validation failed", { errors: parsed.errors });
    return { ok: false, errors: parsed.errors, document };
  }

  const seenFingerprints = duplicateImportFingerprints(document);
  const transactionsToImport: Transaction[] = [];
  let skippedDuplicates = 0;

  for (const [index, entry] of parsed.entries.entries()) {
    const lockError = lockErrorForDate(document, entry.date);

    if (lockError) {
      const errors = [`entry ${index + 1}: ${lockError}`];
      logger.warn("workspace command validation failed", { errors });
      return { ok: false, errors, document };
    }

    const mappingKey = entry.name?.trim() ?? entry.memo?.trim() ?? "";
    const counterpartAccountId =
      (mappingKey ? params.nameMappings?.[mappingKey] : undefined) ?? params.defaultCounterpartAccountId;
    const description =
      entry.memo ?? entry.name ?? entry.transactionType ?? `Imported ${params.format.toUpperCase()} transaction`;
    const fingerprintParts = [
      params.sourceLabel,
      entry.fitId ?? "",
      entry.date,
      String(entry.amount),
      params.cashAccountId,
      counterpartAccountId,
    ];
    const transaction = buildImportedTransaction({
      amount: entry.amount,
      batchId: params.batchId,
      cashAccountId: params.cashAccountId,
      counterpartAccountId,
      description,
      externalReference: entry.fitId,
      importedAt: params.importedAt,
      index,
      memo: entry.memo,
      occurredOn: entry.date,
      payee: entry.name,
      provider: params.format,
      sourceFingerprintParts: fingerprintParts,
      workspace: document,
    });
    const validation = validateTransactionForLedger(transaction, document.accounts);

    if (!validation.ok) {
      const errors = validation.errors.map((error) => `entry ${index + 1}: ${error}`);
      logger.warn("workspace command validation failed", { errors });
      return { ok: false, errors, document };
    }

    if (seenFingerprints.has(transaction.source!.fingerprint)) {
      skippedDuplicates += 1;
      continue;
    }

    seenFingerprints.add(transaction.source!.fingerprint);
    transactionsToImport.push(transaction);
  }

  return finalizeImportedTransactions({
    batchId: params.batchId,
    document,
    eventType: params.format === "ofx" ? "import.ofx.recorded" : "import.qfx.recorded",
    importedAt: params.importedAt,
    logger,
    options,
    provider: params.format,
    skippedDuplicates,
    sourceLabel: params.sourceLabel,
    transactionsToImport,
  });
}

export function importWorkspaceFromGnuCashXml(
  document: FinanceWorkspaceDocument,
  params: {
    importedAt: string;
    sourceLabel: string;
    xml: string;
  },
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    command: "importWorkspaceFromGnuCashXml",
    provider: "gnucash-xml",
    sourceLabel: params.sourceLabel,
    workspaceId: document.id,
  });
  logger.info("workspace command started");
  const parsed = parseGnuCashXml(params.xml);

  if (parsed.errors.length > 0 || !parsed.document) {
    const errors = parsed.errors.length > 0 ? parsed.errors : ["workspace XML could not be parsed."];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  if (parsed.document.id !== document.id) {
    const errors = [`Workspace XML id ${parsed.document.id} does not match target workspace ${document.id}.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  const importedDocument: FinanceWorkspaceDocument = {
    ...parsed.document,
    auditEvents: parsed.document.auditEvents,
    closePeriods: parsed.document.closePeriods ?? document.closePeriods ?? [],
  };

  logger.info("workspace command completed", {
    transactionCount: importedDocument.transactions.length,
  });

  return {
    ok: true,
    errors: [],
    document: appendAuditEvent(
      importedDocument,
      {
        entityIds: [document.id],
        eventType: "import.gnucash-xml.recorded",
        summary: {
          importedAt: params.importedAt,
          sourceLabel: params.sourceLabel,
          transactionCount: importedDocument.transactions.length,
        },
      },
      options.audit,
    ),
  };
}

export function closeWorkspacePeriod(
  document: FinanceWorkspaceDocument,
  params: {
    closedAt: string;
    closedBy: string;
    from: string;
    id?: string;
    notes?: string;
    to: string;
  },
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    command: "closeWorkspacePeriod",
    from: params.from,
    to: params.to,
    workspaceId: document.id,
  });
  logger.info("workspace command started");
  const errors: string[] = [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.from)) {
    errors.push("Close period from must use ISO date format YYYY-MM-DD.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.to)) {
    errors.push("Close period to must use ISO date format YYYY-MM-DD.");
  }

  if (Number.isNaN(Date.parse(params.closedAt))) {
    errors.push("Close period closedAt must be a valid ISO timestamp.");
  }

  if (params.from > params.to) {
    errors.push("Close period from must be less than or equal to to.");
  }

  if (errors.length > 0) {
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  const overlapping = (document.closePeriods ?? []).find(
    (period) => params.from <= period.to && params.to >= period.from,
  );

  if (overlapping) {
    const overlapErrors = [
      `Close period ${params.from} through ${params.to} overlaps existing closed period ${overlapping.from} through ${overlapping.to}.`,
    ];
    logger.warn("workspace command validation failed", { errors: overlapErrors });
    return { ok: false, errors: overlapErrors, document };
  }

  const closeSummary = buildCloseSummary(document, {
    from: params.from,
    to: params.to,
  });

  if (!closeSummary.readyToClose) {
    const blockingChecks = closeSummary.checks
      .filter((check) => check.status !== "ok")
      .map((check) => `${check.label} (${check.itemCount})`);
    const summaryErrors = [
      `Period ${params.from} through ${params.to} is not ready to close: ${blockingChecks.join(", ")}.`,
    ];
    logger.warn("workspace command validation failed", { errors: summaryErrors });
    return { ok: false, errors: summaryErrors, document };
  }

  const closePeriod = {
    closedAt: params.closedAt,
    closedBy: params.closedBy,
    from: params.from,
    id: params.id ?? `close:${params.from}:${params.to}`,
    notes: params.notes,
    to: params.to,
  };
  const nextDocument = appendAuditEvent(
    {
      ...document,
      closePeriods: [...(document.closePeriods ?? []), closePeriod].sort((left, right) =>
        `${left.from}:${left.to}`.localeCompare(`${right.from}:${right.to}`),
      ),
    },
    {
      entityIds: [closePeriod.id],
      eventType: "close.recorded",
      summary: {
        closedAt: closePeriod.closedAt,
        closedBy: closePeriod.closedBy,
        from: closePeriod.from,
        to: closePeriod.to,
      },
    },
    options.audit,
  );

  logger.info("workspace command completed", {
    closePeriodCount: nextDocument.closePeriods?.length ?? 0,
  });

  return {
    ok: true,
    errors: [],
    document: nextDocument,
  };
}

export function addHouseholdMember(
  document: FinanceWorkspaceDocument,
  params: {
    actor: string;
    role?: "admin" | "guardian" | "member";
  },
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    command: "addHouseholdMember",
    targetActor: params.actor,
    workspaceId: document.id,
  });
  logger.info("workspace command started");

  if (!params.actor || params.actor.trim().length === 0) {
    const errors = ["Household member actor is required."];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  if (document.householdMembers.includes(params.actor)) {
    const errors = [`Actor ${params.actor} is already a household member.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  const nextRoles: FinanceWorkspaceDocument["householdMemberRoles"] = params.role
    ? { ...(document.householdMemberRoles ?? {}), [params.actor]: params.role }
    : document.householdMemberRoles;

  const nextDocument = appendAuditEvent(
    {
      ...document,
      householdMembers: [...document.householdMembers, params.actor],
      householdMemberRoles: nextRoles,
    },
    {
      entityIds: [params.actor],
      eventType: "household-member.added",
      summary: {
        actor: params.actor,
        role: params.role ?? "member",
      },
    },
    options.audit,
  );

  logger.info("workspace command completed", {
    householdMemberCount: nextDocument.householdMembers.length,
  });

  return { ok: true, errors: [], document: nextDocument };
}

export function removeHouseholdMember(
  document: FinanceWorkspaceDocument,
  params: {
    actor: string;
  },
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    command: "removeHouseholdMember",
    targetActor: params.actor,
    workspaceId: document.id,
  });
  logger.info("workspace command started");

  if (!document.householdMembers.includes(params.actor)) {
    const errors = [`Actor ${params.actor} is not a household member.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  const roles = document.householdMemberRoles ?? {};
  const isAdmin = roles[params.actor] === "admin";

  if (isAdmin) {
    const remainingAdmins = document.householdMembers.filter(
      (member) => member !== params.actor && roles[member] === "admin",
    );
    if (remainingAdmins.length === 0) {
      const errors = [`Cannot remove ${params.actor}: they are the last admin of this workspace.`];
      logger.warn("workspace command validation failed", { errors });
      return { ok: false, errors, document };
    }
  }

  const nextRoles = { ...roles };
  delete nextRoles[params.actor];

  const nextDocument = appendAuditEvent(
    {
      ...document,
      householdMembers: document.householdMembers.filter((member) => member !== params.actor),
      householdMemberRoles: nextRoles,
    },
    {
      entityIds: [params.actor],
      eventType: "household-member.removed",
      summary: {
        actor: params.actor,
      },
    },
    options.audit,
  );

  logger.info("workspace command completed", {
    householdMemberCount: nextDocument.householdMembers.length,
  });

  return { ok: true, errors: [], document: nextDocument };
}

export function setHouseholdMemberRole(
  document: FinanceWorkspaceDocument,
  params: {
    actor: string;
    role: "admin" | "guardian" | "member";
  },
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    command: "setHouseholdMemberRole",
    targetActor: params.actor,
    workspaceId: document.id,
  });
  logger.info("workspace command started");

  if (!document.householdMembers.includes(params.actor)) {
    const errors = [`Actor ${params.actor} is not a household member.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  const roles = document.householdMemberRoles ?? {};
  const isCurrentlyAdmin = roles[params.actor] === "admin";
  const isDemotingAdmin = isCurrentlyAdmin && params.role !== "admin";

  if (isDemotingAdmin) {
    const remainingAdmins = document.householdMembers.filter(
      (member) => member !== params.actor && roles[member] === "admin",
    );
    if (remainingAdmins.length === 0) {
      const errors = [
        `Cannot change role of ${params.actor}: they are the last admin of this workspace.`,
      ];
      logger.warn("workspace command validation failed", { errors });
      return { ok: false, errors, document };
    }
  }

  const previousRole = roles[params.actor] ?? "member";

  const nextDocument = appendAuditEvent(
    {
      ...document,
      householdMemberRoles: { ...roles, [params.actor]: params.role },
    },
    {
      entityIds: [params.actor],
      eventType: "household-member.role-changed",
      summary: {
        actor: params.actor,
        previousRole,
        role: params.role,
      },
    },
    options.audit,
  );

  logger.info("workspace command completed");

  return { ok: true, errors: [], document: nextDocument };
}

const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function requestApproval(
  document: FinanceWorkspaceDocument,
  params: {
    approvalId: string;
    entityId: string;
    kind: ApprovalKind;
    requestedBy: string;
    requestedAt?: string;
  },
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    command: "requestApproval",
    approvalId: params.approvalId,
    kind: params.kind,
    workspaceId: document.id,
  });
  logger.info("workspace command started");

  if (!params.approvalId || params.approvalId.trim().length === 0) {
    const errors = ["Approval id is required."];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  if (!params.entityId || params.entityId.trim().length === 0) {
    const errors = ["Entity id is required."];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  if (!params.requestedBy || params.requestedBy.trim().length === 0) {
    const errors = ["requestedBy is required."];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  const existing = (document.pendingApprovals ?? []).find((a) => a.id === params.approvalId);
  if (existing) {
    const errors = [`Approval ${params.approvalId} already exists.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  if (params.kind === "destroy-transaction") {
    const transaction = document.transactions.find((t) => t.id === params.entityId);
    if (!transaction) {
      const errors = [`Transaction ${params.entityId} not found.`];
      logger.warn("workspace command validation failed", { errors });
      return { ok: false, errors, document };
    }
  }

  const requestedAt = params.requestedAt ?? new Date().toISOString();
  const expiresAt = new Date(new Date(requestedAt).getTime() + APPROVAL_TTL_MS).toISOString();

  const approval: PendingApproval = {
    id: params.approvalId,
    kind: params.kind,
    entityId: params.entityId,
    requestedBy: params.requestedBy,
    requestedAt,
    expiresAt,
    status: "pending",
  };

  const nextDocument = appendAuditEvent(
    {
      ...document,
      pendingApprovals: [...(document.pendingApprovals ?? []), approval],
    },
    {
      entityIds: [params.approvalId, params.entityId],
      eventType: "approval.requested",
      summary: {
        approvalId: params.approvalId,
        kind: params.kind,
        entityId: params.entityId,
        requestedBy: params.requestedBy,
        expiresAt,
      },
    },
    options.audit,
  );

  logger.info("workspace command completed", { approvalId: params.approvalId });

  return { ok: true, errors: [], document: nextDocument };
}

export function grantApproval(
  document: FinanceWorkspaceDocument,
  params: {
    approvalId: string;
    reviewedBy: string;
    reviewedAt?: string;
  },
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    command: "grantApproval",
    approvalId: params.approvalId,
    workspaceId: document.id,
  });
  logger.info("workspace command started");

  const approval = (document.pendingApprovals ?? []).find((a) => a.id === params.approvalId);

  if (!approval) {
    const errors = [`Approval ${params.approvalId} not found.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  if (approval.status !== "pending") {
    const errors = [`Approval ${params.approvalId} is already ${approval.status}.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  const reviewedAt = params.reviewedAt ?? new Date().toISOString();

  if (new Date(reviewedAt) > new Date(approval.expiresAt)) {
    const errors = [`Approval ${params.approvalId} has expired.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  if (approval.requestedBy === params.reviewedBy) {
    const errors = [`Approval ${params.approvalId} must be reviewed by a different actor than the requester.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  const updatedApproval: PendingApproval = {
    ...approval,
    status: "approved",
    reviewedBy: params.reviewedBy,
    reviewedAt,
  };

  let nextDoc: FinanceWorkspaceDocument = {
    ...document,
    pendingApprovals: (document.pendingApprovals ?? []).map((a) =>
      a.id === params.approvalId ? updatedApproval : a,
    ),
  };

  // Execute the approved operation
  if (approval.kind === "destroy-transaction") {
    const destroyResult = destroyTransaction(nextDoc, approval.entityId, {
      audit: { ...options.audit, disabled: true },
      logger: options.logger,
    });
    if (!destroyResult.ok) {
      logger.warn("workspace command validation failed — destroy failed after grant", {
        errors: destroyResult.errors,
      });
      return { ok: false, errors: destroyResult.errors, document };
    }
    nextDoc = destroyResult.document;
  }

  const nextDocument = appendAuditEvent(
    nextDoc,
    {
      entityIds: [params.approvalId, approval.entityId],
      eventType: "approval.granted",
      summary: {
        approvalId: params.approvalId,
        kind: approval.kind,
        entityId: approval.entityId,
        requestedBy: approval.requestedBy,
        reviewedBy: params.reviewedBy,
      },
    },
    options.audit,
  );

  logger.info("workspace command completed", { approvalId: params.approvalId });

  return { ok: true, errors: [], document: nextDocument };
}

export function denyApproval(
  document: FinanceWorkspaceDocument,
  params: {
    approvalId: string;
    reviewedBy: string;
    reviewedAt?: string;
  },
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    command: "denyApproval",
    approvalId: params.approvalId,
    workspaceId: document.id,
  });
  logger.info("workspace command started");

  const approval = (document.pendingApprovals ?? []).find((a) => a.id === params.approvalId);

  if (!approval) {
    const errors = [`Approval ${params.approvalId} not found.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  if (approval.status !== "pending") {
    const errors = [`Approval ${params.approvalId} is already ${approval.status}.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  const reviewedAt = params.reviewedAt ?? new Date().toISOString();

  const updatedApproval: PendingApproval = {
    ...approval,
    status: "denied",
    reviewedBy: params.reviewedBy,
    reviewedAt,
  };

  const nextDocument = appendAuditEvent(
    {
      ...document,
      pendingApprovals: (document.pendingApprovals ?? []).map((a) =>
        a.id === params.approvalId ? updatedApproval : a,
      ),
    },
    {
      entityIds: [params.approvalId, approval.entityId],
      eventType: "approval.denied",
      summary: {
        approvalId: params.approvalId,
        kind: approval.kind,
        entityId: approval.entityId,
        requestedBy: approval.requestedBy,
        reviewedBy: params.reviewedBy,
      },
    },
    options.audit,
  );

  logger.info("workspace command completed", { approvalId: params.approvalId });

  return { ok: true, errors: [], document: nextDocument };
}

const VALID_ACCOUNT_TYPES: AccountType[] = ["asset", "liability", "equity", "income", "expense"];

function isAccountType(value: unknown): value is AccountType {
  return VALID_ACCOUNT_TYPES.includes(value as AccountType);
}

export function upsertAccount(
  document: FinanceWorkspaceDocument,
  account: Account,
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    command: "upsertAccount",
    accountId: account.id,
    workspaceId: document.id,
  });
  logger.info("workspace command started");

  const errors: string[] = [];

  if (!account.id || account.id.trim().length === 0) {
    errors.push("account.id is required.");
  }

  if (!account.code || account.code.trim().length === 0) {
    errors.push("account.code is required.");
  }

  if (!account.name || account.name.trim().length === 0) {
    errors.push("account.name is required.");
  }

  if (!isAccountType(account.type)) {
    errors.push("account.type must be asset, liability, equity, income, or expense.");
  }

  if (account.parentAccountId !== undefined) {
    const parentExists = document.accounts.some((a) => a.id === account.parentAccountId);
    if (!parentExists) {
      errors.push(`account.parentAccountId ${account.parentAccountId} does not exist.`);
    }
  }

  if (errors.length > 0) {
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  const existing = document.accounts.find((a) => a.id === account.id);
  const isCreate = !existing;

  const nextDocument = appendAuditEvent(
    {
      ...document,
      accounts: upsertById(document.accounts, account),
    },
    {
      entityIds: [account.id],
      eventType: "account.upserted",
      summary: {
        accountId: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        isCreate,
      },
    },
    options.audit,
  );

  logger.info("workspace command completed", { accountId: account.id, isCreate });

  return { ok: true, errors: [], document: nextDocument };
}

export function archiveAccount(
  document: FinanceWorkspaceDocument,
  params: {
    accountId: string;
    archivedAt?: string;
  },
  options: CommandOptions = {},
): CommandResult {
  const logger = (options.logger ?? createNoopLogger()).child({
    command: "archiveAccount",
    accountId: params.accountId,
    workspaceId: document.id,
  });
  logger.info("workspace command started");

  const account = document.accounts.find((a) => a.id === params.accountId);

  if (!account) {
    const errors = [`Account ${params.accountId} not found.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  if (account.archivedAt) {
    const errors = [`Account ${params.accountId} is already archived.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  const hasUndeletedTransactions = listActiveTransactions(document.transactions).some((t) =>
    t.postings.some((p) => p.accountId === params.accountId),
  );

  if (hasUndeletedTransactions) {
    const errors = [`Account ${params.accountId} has undeleted transactions and cannot be archived.`];
    logger.warn("workspace command validation failed", { errors });
    return { ok: false, errors, document };
  }

  const archivedAt = params.archivedAt ?? new Date().toISOString();

  const nextDocument = appendAuditEvent(
    {
      ...document,
      accounts: document.accounts.map((a) =>
        a.id === params.accountId ? { ...a, archivedAt } : a,
      ),
    },
    {
      entityIds: [params.accountId],
      eventType: "account.archived",
      summary: {
        accountId: params.accountId,
        archivedAt,
      },
    },
    options.audit,
  );

  logger.info("workspace command completed", { accountId: params.accountId });

  return { ok: true, errors: [], document: nextDocument };
}
