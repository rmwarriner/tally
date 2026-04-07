import type { Transaction } from "@tally-core/domain";
import type { FinanceWorkspaceDocument } from "./types";

function compareTransactions(left: Transaction, right: Transaction): number {
  return left.occurredOn.localeCompare(right.occurredOn) || left.id.localeCompare(right.id);
}

export function isTransactionDeleted(transaction: Transaction): boolean {
  return transaction.deletion !== undefined;
}

export function listActiveTransactions(transactions: Transaction[]): Transaction[] {
  return transactions.filter((transaction) => !isTransactionDeleted(transaction));
}

export function listDeletedTransactions(transactions: Transaction[]): Transaction[] {
  return transactions.filter(isTransactionDeleted);
}

export function replaceActiveTransactions(
  document: FinanceWorkspaceDocument,
  nextActiveTransactions: Transaction[],
): Transaction[] {
  return [...listDeletedTransactions(document.transactions), ...nextActiveTransactions].sort(compareTransactions);
}

export function buildOperationalWorkspaceView(
  document: FinanceWorkspaceDocument,
): FinanceWorkspaceDocument {
  return {
    ...document,
    transactions: listActiveTransactions(document.transactions),
  };
}
