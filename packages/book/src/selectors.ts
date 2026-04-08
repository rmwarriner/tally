import {
  buildBaselineBudgetSnapshot,
  buildEnvelopeBudgetSnapshot,
  calculateNetWorth,
  computeAccountBalances,
  materializeDueTransactions,
  validateBudgetConfiguration,
  validateTransactionForLedger,
} from "@tally/domain";
import { listActiveTransactions } from "./transaction-lifecycle";
import type { FinanceBookDocument } from "./types";

export function buildDashboardSnapshot(
  document: FinanceBookDocument,
  range: { from: string; to: string },
) {
  const transactions = listActiveTransactions(document.transactions);

  return {
    budgetSnapshot: buildBaselineBudgetSnapshot(
      document.baselineBudgetLines,
      document.accounts,
      transactions,
      range,
    ),
    envelopeSnapshot: buildEnvelopeBudgetSnapshot(
      document.envelopes,
      document.envelopeAllocations,
      document.baselineBudgetLines,
      document.accounts,
      transactions,
      range,
    ),
    accountBalances: computeAccountBalances(document.accounts, transactions, range.to),
    netWorth: calculateNetWorth(
      document.accounts,
      transactions,
      document.baseCommodityCode,
      range.to,
    ),
    dueTransactions: materializeDueTransactions(document.scheduledTransactions, range.to),
    ledgerErrors: transactions.flatMap((transaction) =>
      validateTransactionForLedger(transaction, document.accounts).errors.map(
        (error) => `${transaction.id}: ${error}`,
      ),
    ),
    budgetErrors: validateBudgetConfiguration(
      document.baselineBudgetLines,
      document.envelopes,
      document.accounts,
    ),
  };
}
