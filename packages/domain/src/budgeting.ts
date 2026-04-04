import { createMoney, validateBaselineBudgetLine, validateEnvelope } from "./accounting";
import type {
  Account,
  BaselineBudgetLine,
  DateRange,
  Envelope,
  EnvelopeAllocation,
  MoneyAmount,
  Transaction,
} from "./types";

export interface BaselineBudgetSnapshotLine {
  accountId: string;
  accountName: string;
  planned: MoneyAmount;
  actual: MoneyAmount;
  variance: MoneyAmount;
}

export interface EnvelopeBudgetSnapshotLine {
  envelopeId: string;
  name: string;
  planned: MoneyAmount;
  funded: MoneyAmount;
  spent: MoneyAmount;
  available: MoneyAmount;
}

function isWithinRange(occurredOn: string, range: DateRange): boolean {
  return occurredOn >= range.from && occurredOn <= range.to;
}

function sumTransactionsForAccount(
  accountId: string,
  commodityCode: string,
  transactions: Transaction[],
  range: DateRange,
): number {
  return transactions.reduce((total, transaction) => {
    if (!isWithinRange(transaction.occurredOn, range)) {
      return total;
    }

    return (
      total +
      transaction.postings
        .filter(
          (posting) =>
            posting.accountId === accountId && posting.amount.commodityCode === commodityCode,
        )
        .reduce((postingTotal, posting) => postingTotal + posting.amount.quantity, 0)
    );
  }, 0);
}

function sumEnvelopeAllocations(
  envelopeId: string,
  commodityCode: string,
  allocations: EnvelopeAllocation[],
  range: DateRange,
): number {
  return allocations.reduce((total, allocation) => {
    if (
      allocation.envelopeId !== envelopeId ||
      allocation.amount.commodityCode !== commodityCode ||
      !isWithinRange(allocation.occurredOn, range)
    ) {
      return total;
    }

    if (allocation.type === "release") {
      return total - allocation.amount.quantity;
    }

    return total + allocation.amount.quantity;
  }, 0);
}

export function buildBaselineBudgetSnapshot(
  budgetLines: BaselineBudgetLine[],
  accounts: Account[],
  transactions: Transaction[],
  range: DateRange,
): BaselineBudgetSnapshotLine[] {
  return budgetLines
    .filter((line) => validateBaselineBudgetLine(line, accounts).ok)
    .map((line) => {
      const account = accounts.find((candidate) => candidate.id === line.accountId);
      const actualQuantity = sumTransactionsForAccount(
        line.accountId,
        line.plannedAmount.commodityCode,
        transactions,
        range,
      );
      const actual = createMoney(line.plannedAmount.commodityCode, actualQuantity);

      return {
        accountId: line.accountId,
        accountName: account?.name ?? line.accountId,
        planned: line.plannedAmount,
        actual,
        variance: createMoney(
          line.plannedAmount.commodityCode,
          line.plannedAmount.quantity - actual.quantity,
        ),
      } satisfies BaselineBudgetSnapshotLine;
    })
    .sort((left, right) => left.accountName.localeCompare(right.accountName));
}

export function buildEnvelopeBudgetSnapshot(
  envelopes: Envelope[],
  allocations: EnvelopeAllocation[],
  budgetLines: BaselineBudgetLine[],
  accounts: Account[],
  transactions: Transaction[],
  range: DateRange,
): EnvelopeBudgetSnapshotLine[] {
  return envelopes
    .filter((envelope) => validateEnvelope(envelope, accounts).ok)
    .map((envelope) => {
      const plannedAmount =
        budgetLines.find((line) => line.accountId === envelope.expenseAccountId)?.plannedAmount ??
        envelope.targetAmount ??
        createMoney(envelope.availableAmount.commodityCode, 0);
      const fundedQuantity = sumEnvelopeAllocations(
        envelope.id,
        envelope.availableAmount.commodityCode,
        allocations,
        range,
      );
      const spentQuantity = sumTransactionsForAccount(
        envelope.expenseAccountId,
        envelope.availableAmount.commodityCode,
        transactions,
        range,
      );

      return {
        envelopeId: envelope.id,
        name: envelope.name,
        planned: plannedAmount,
        funded: createMoney(envelope.availableAmount.commodityCode, fundedQuantity),
        spent: createMoney(envelope.availableAmount.commodityCode, spentQuantity),
        available: createMoney(
          envelope.availableAmount.commodityCode,
          envelope.availableAmount.quantity + fundedQuantity - spentQuantity,
        ),
      } satisfies EnvelopeBudgetSnapshotLine;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function validateBudgetConfiguration(
  budgetLines: BaselineBudgetLine[],
  envelopes: Envelope[],
  accounts: Account[],
): string[] {
  const errors = [
    ...budgetLines.flatMap((line) => validateBaselineBudgetLine(line, accounts).errors),
    ...envelopes.flatMap((envelope) => validateEnvelope(envelope, accounts).errors),
  ];

  for (const envelope of envelopes) {
    if (!budgetLines.some((line) => line.accountId === envelope.expenseAccountId)) {
      errors.push(`Envelope ${envelope.name} is not backed by a baseline budget line.`);
    }
  }

  return errors;
}
