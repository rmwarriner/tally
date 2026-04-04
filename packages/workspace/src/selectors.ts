import {
  buildBaselineBudgetSnapshot,
  buildEnvelopeBudgetSnapshot,
  calculateNetWorth,
  computeAccountBalances,
  materializeDueTransactions,
  validateBudgetConfiguration,
  validateTransactionForLedger,
} from "@gnucash-ng/domain";
import type { FinanceWorkspaceDocument } from "./types";

export function buildDashboardSnapshot(
  document: FinanceWorkspaceDocument,
  range: { from: string; to: string },
) {
  return {
    budgetSnapshot: buildBaselineBudgetSnapshot(
      document.baselineBudgetLines,
      document.accounts,
      document.transactions,
      range,
    ),
    envelopeSnapshot: buildEnvelopeBudgetSnapshot(
      document.envelopes,
      document.envelopeAllocations,
      document.baselineBudgetLines,
      document.accounts,
      document.transactions,
      range,
    ),
    accountBalances: computeAccountBalances(document.accounts, document.transactions, range.to),
    netWorth: calculateNetWorth(
      document.accounts,
      document.transactions,
      document.baseCommodityCode,
      range.to,
    ),
    dueTransactions: materializeDueTransactions(document.scheduledTransactions, range.to),
    ledgerErrors: document.transactions.flatMap((transaction) =>
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
