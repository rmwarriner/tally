import { describe, expect, it } from "vitest";
import { createDemoBook } from "./factory";
import { buildCloseSummary, buildBookReport } from "./reports";

describe("book reports", () => {
  it("builds a net worth report", () => {
    const book = createDemoBook();
    const report = buildBookReport(book, {
      from: "2026-04-01",
      kind: "net-worth",
      to: "2026-04-30",
    });

    expect(report.kind).toBe("net-worth");
    expect(report.total.quantity).toBeCloseTo(3051.58);
    expect(report.balances.some((balance) => balance.accountId === "acct-checking")).toBe(true);
  });

  it("builds an income statement report", () => {
    const book = createDemoBook();
    const report = buildBookReport(book, {
      from: "2026-04-01",
      kind: "income-statement",
      to: "2026-04-30",
    });

    expect(report.kind).toBe("income-statement");
    expect(report.incomeTotal.quantity).toBeCloseTo(3200);
    expect(report.expenseTotal.quantity).toBeCloseTo(148.42);
    expect(report.netIncome.quantity).toBeCloseTo(3051.58);
  });

  it("builds a cash-flow report", () => {
    const book = createDemoBook();
    const report = buildBookReport(book, {
      from: "2026-04-01",
      kind: "cash-flow",
      to: "2026-04-30",
    });

    expect(report.kind).toBe("cash-flow");
    expect(report.totals.inflow.quantity).toBeCloseTo(3200);
    expect(report.totals.outflow.quantity).toBeCloseTo(148.42);
    expect(report.totals.net.quantity).toBeCloseTo(3051.58);
  });

  it("builds cash flow with range filtering and sorted asset lines", () => {
    const book = createDemoBook();
    book.transactions = [
      ...book.transactions,
      {
        description: "Savings transfer",
        id: "txn-savings-1",
        occurredOn: "2026-04-15",
        postings: [
          { accountId: "acct-savings", amount: { commodityCode: "USD", quantity: 100 } },
          { accountId: "acct-income-interest", amount: { commodityCode: "USD", quantity: -100 } },
        ],
      },
      {
        description: "Out of range expense",
        id: "txn-out-of-range-1",
        occurredOn: "2026-03-15",
        postings: [
          { accountId: "acct-checking", amount: { commodityCode: "USD", quantity: -999 } },
          { accountId: "acct-expense-groceries", amount: { commodityCode: "USD", quantity: 999 } },
        ],
      },
    ];
    const report = buildBookReport(book, {
      from: "2026-04-01",
      kind: "cash-flow",
      to: "2026-04-30",
    });

    expect(report.lines.map((line) => line.accountName)).toEqual(["Checking", "Savings"]);
    expect(report.totals.inflow.quantity).toBeCloseTo(3300);
    expect(report.totals.outflow.quantity).toBeCloseTo(148.42);
  });

  it("builds budget and envelope reports", () => {
    const book = createDemoBook();
    const budgetVsActual = buildBookReport(book, {
      from: "2026-04-01",
      kind: "budget-vs-actual",
      to: "2026-04-30",
    });
    const envelopeSummary = buildBookReport(book, {
      from: "2026-04-01",
      kind: "envelope-summary",
      to: "2026-04-30",
    });

    expect(budgetVsActual.kind).toBe("budget-vs-actual");
    expect(budgetVsActual.lines.length).toBeGreaterThan(0);
    expect(budgetVsActual.totals.planned.quantity).toBeGreaterThan(0);
    expect(budgetVsActual.totals.actual.quantity).toBeGreaterThan(0);
    expect(envelopeSummary.kind).toBe("envelope-summary");
    expect(envelopeSummary.lines.length).toBeGreaterThan(0);
    expect(envelopeSummary.totals.funded.quantity).toBeGreaterThan(0);
    expect(envelopeSummary.totals.spent.quantity).toBeGreaterThan(0);
  });

  it("builds a close summary with reconciliation gaps", () => {
    const book = createDemoBook();
    book.closePeriods = [
      {
        id: "close-2026-03",
        closedAt: "2026-04-01T00:00:00Z",
        closedBy: "Primary",
        from: "2026-03-01",
        to: "2026-03-31",
      },
    ];
    const summary = buildCloseSummary(book, {
      from: "2026-04-01",
      to: "2026-04-30",
    });

    expect(summary.netIncome.quantity).toBeCloseTo(3051.58);
    expect(summary.netWorth.quantity).toBeCloseTo(3051.58);
    expect(summary.transactionCount).toBeGreaterThan(0);
    expect(summary.checks.find((check) => check.id === "reconciliation")?.status).toBe("attention");
    expect(summary.latestClosePeriod?.id).toBe("close-2026-03");
    expect(summary.readyToClose).toBe(false);
  });

  it("builds a close summary with no reconciliation gaps", () => {
    const book = createDemoBook();
    book.transactions = book.transactions.map((transaction, index) =>
      index === 0
        ? {
            ...transaction,
            source: {
              fingerprint: "imported-txn-paycheck-1",
              importedAt: "2026-04-03T10:15:00Z",
              provider: "csv",
            },
          }
        : transaction,
    );
    book.reconciliationSessions = [
      {
        accountId: "acct-checking",
        clearedTransactionIds: ["txn-paycheck-1"],
        difference: { commodityCode: "USD", quantity: 0 },
        id: "recon-checking-april-old",
        statementBalance: { commodityCode: "USD", quantity: 3000 },
        statementDate: "2026-04-15",
      },
      {
        accountId: "acct-checking",
        clearedTransactionIds: ["txn-paycheck-1", "txn-grocery-1"],
        difference: { commodityCode: "USD", quantity: 0 },
        id: "recon-checking-april",
        statementBalance: { commodityCode: "USD", quantity: 3051.58 },
        statementDate: "2026-04-30",
      },
    ];
    book.closePeriods = [
      {
        id: "close-2026-04-a",
        closedAt: "2026-05-01T00:00:00Z",
        closedBy: "Primary",
        from: "2026-04-01",
        to: "2026-04-30",
      },
      {
        id: "close-2026-04-b",
        closedAt: "2026-05-02T00:00:00Z",
        closedBy: "Primary",
        from: "2026-04-01",
        to: "2026-04-30",
      },
    ];

    const summary = buildCloseSummary(book, {
      from: "2026-04-01",
      to: "2026-04-30",
    });

    expect(summary.reconciliationGaps).toHaveLength(0);
    expect(summary.checks.find((check) => check.id === "reconciliation")?.status).toBe("ok");
    expect(summary.readyToClose).toBe(true);
    expect(summary.importedTransactionCount).toBe(1);
    expect(summary.latestClosePeriod?.id).toBe("close-2026-04-b");
  });

  it("sorts reconciliation gaps by account name", () => {
    const book = createDemoBook();
    book.transactions = [
      ...book.transactions,
      {
        description: "Credit card purchase",
        id: "txn-cc-1",
        occurredOn: "2026-04-12",
        postings: [
          { accountId: "acct-expense-transport", amount: { commodityCode: "USD", quantity: 55 } },
          { accountId: "acct-credit-card", amount: { commodityCode: "USD", quantity: -55 } },
        ],
      },
    ];

    const summary = buildCloseSummary(book, {
      from: "2026-04-01",
      to: "2026-04-30",
    });

    expect(summary.reconciliationGaps.map((gap) => gap.accountName)).toEqual(["Checking", "Credit Card"]);
  });
});
