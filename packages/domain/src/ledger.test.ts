import { describe, expect, it } from "vitest";
import { createMoney } from "./accounting";
import { starterChartOfAccounts } from "./chart-of-accounts";
import { demoTransactions } from "./demo-data";
import {
  calculateNetWorth,
  computeAccountBalances,
  postTransaction,
  validateTransactionForLedger,
} from "./ledger";
import type { Transaction } from "./types";

describe("ledger", () => {
  it("rejects unbalanced transactions", () => {
    const transaction: Transaction = {
      id: "txn-invalid",
      occurredOn: "2026-04-03",
      description: "Invalid groceries",
      postings: [
        { accountId: "acct-expense-groceries", amount: createMoney("USD", 25) },
        { accountId: "acct-checking", amount: createMoney("USD", -20) },
      ],
    };

    const result = validateTransactionForLedger(transaction, starterChartOfAccounts);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Transaction is not balanced for commodity USD.");
  });

  it("posts valid transactions and sorts them by date", () => {
    const ledger = {
      accounts: starterChartOfAccounts,
      transactions: [demoTransactions[1]],
    };
    const earlierTransaction: Transaction = {
      id: "txn-earlier",
      occurredOn: "2026-04-01",
      description: "Opening transfer",
      postings: [
        { accountId: "acct-checking", amount: createMoney("USD", 500) },
        { accountId: "acct-equity", amount: createMoney("USD", -500) },
      ],
    };

    const result = postTransaction(ledger, earlierTransaction);

    expect(result.ok).toBe(true);
    expect(result.ledger.transactions.map((transaction) => transaction.id)).toEqual([
      "txn-earlier",
      "txn-grocery-1",
    ]);
  });

  it("computes balances and net worth from posted transactions", () => {
    const balances = computeAccountBalances(starterChartOfAccounts, demoTransactions, "2026-04-30");
    const checking = balances.find((balance) => balance.accountId === "acct-checking");
    const netWorth = calculateNetWorth(
      starterChartOfAccounts,
      demoTransactions,
      "USD",
      "2026-04-30",
    );

    expect(checking?.balance).toBeCloseTo(3051.58);
    expect(netWorth.quantity).toBeCloseTo(3051.58);
  });
});
