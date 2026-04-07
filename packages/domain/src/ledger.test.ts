import { describe, expect, it } from "vitest";
import { createMoney } from "./accounting";
import { starterChartOfAccounts } from "./chart-of-accounts";
import { demoTransactions } from "./demo-data";
import {
  calculateNetWorth,
  computeAccountBalances,
  listTransactionsForAccount,
  postTransaction,
  sumPostingsForAccount,
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

  it("reports duplicate ids and posting validation failures", () => {
    const ledger = {
      accounts: starterChartOfAccounts,
      transactions: [demoTransactions[0]],
    };

    const result = postTransaction(ledger, {
      id: "txn-paycheck-1",
      occurredOn: "2026/04/01",
      description: " ",
      postings: [
        { accountId: "acct-missing", amount: createMoney("", 0) },
        { accountId: "acct-checking", amount: createMoney("USD", 10) },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Transaction txn-paycheck-1 already exists.");
    expect(result.errors).toContain("Transaction description is required.");
    expect(result.errors).toContain("Transaction occurredOn must use ISO date format YYYY-MM-DD.");
    expect(result.errors).toContain("Posting references unknown account acct-missing.");
    expect(result.errors).toContain("Posting commodity code is required.");
    expect(result.errors).toContain("Posting amount cannot be zero.");
  });

  it("lists and sums account activity through a cutoff date", () => {
    const checkingTransactions = listTransactionsForAccount("acct-checking", demoTransactions);
    const throughFirstDay = sumPostingsForAccount("acct-checking", demoTransactions, "USD", "2026-04-01");

    expect(checkingTransactions).toHaveLength(2);
    expect(throughFirstDay.quantity).toBeCloseTo(3200);
  });

  it("skips unknown accounts when computing balances and handles liabilities in net worth", () => {
    const balances = computeAccountBalances(
      starterChartOfAccounts,
      [
        ...demoTransactions,
        {
          description: "Credit card purchase",
          id: "txn-liability-1",
          occurredOn: "2026-04-03",
          postings: [
            { accountId: "acct-expense-groceries", amount: createMoney("USD", 25) },
            { accountId: "acct-credit-card", amount: createMoney("USD", -25) },
          ],
        },
        {
          description: "Unknown account import",
          id: "txn-unknown-1",
          occurredOn: "2026-04-03",
          postings: [{ accountId: "acct-unknown", amount: createMoney("USD", 10) }],
        },
      ],
      "2026-04-30",
    );
    const netWorth = calculateNetWorth(
      starterChartOfAccounts,
      [
        ...demoTransactions,
        {
          description: "Credit card purchase",
          id: "txn-liability-1",
          occurredOn: "2026-04-03",
          postings: [
            { accountId: "acct-expense-groceries", amount: createMoney("USD", 25) },
            { accountId: "acct-credit-card", amount: createMoney("USD", -25) },
          ],
        },
      ],
      "USD",
      "2026-04-30",
    );

    expect(balances.some((balance) => balance.accountId === "acct-unknown")).toBe(false);
    expect(netWorth.quantity).toBeCloseTo(3076.58);
  });
});
