import { describe, expect, it } from "vitest";
import { createMoney } from "./accounting";
import { starterChartOfAccounts } from "./chart-of-accounts";
import {
  demoBaselineBudget,
  demoEnvelopeAllocations,
  demoEnvelopes,
  demoTransactions,
} from "./demo-data";
import {
  buildBaselineBudgetSnapshot,
  buildEnvelopeBudgetSnapshot,
  buildPeriodCloseRollover,
  computeRemainingToAllocate,
  validateBudgetConfiguration,
} from "./budgeting";
import type { Account, Envelope, EnvelopeAllocation, Transaction } from "./types";

describe("budgeting", () => {
  const range = { from: "2026-04-01", to: "2026-04-30" };

  it("builds a baseline budget snapshot against actual transactions", () => {
    const snapshot = buildBaselineBudgetSnapshot(
      demoBaselineBudget,
      starterChartOfAccounts,
      demoTransactions,
      range,
    );
    const groceries = snapshot.find((line) => line.accountId === "acct-expense-groceries");

    expect(groceries?.planned.quantity).toBe(650);
    expect(groceries?.actual.quantity).toBeCloseTo(148.42);
    expect(groceries?.variance.quantity).toBeCloseTo(501.58);
  });

  it("builds an envelope snapshot from allocations plus spending", () => {
    const snapshot = buildEnvelopeBudgetSnapshot(
      demoEnvelopes,
      demoEnvelopeAllocations,
      demoBaselineBudget,
      starterChartOfAccounts,
      demoTransactions,
      range,
    );
    const groceries = snapshot.find((line) => line.envelopeId === "env-groceries");

    expect(groceries?.funded.quantity).toBe(650);
    expect(groceries?.spent.quantity).toBeCloseTo(148.42);
    expect(groceries?.available.quantity).toBeCloseTo(1003.16);
    expect(groceries?.overspent).toBe(false);
  });

  it("marks envelope lines as overspent when available drops below zero", () => {
    const envelopes: Envelope[] = [
      {
        id: "env-groceries",
        name: "Groceries",
        expenseAccountId: "acct-expense-groceries",
        fundingAccountId: "acct-checking",
        targetAmount: createMoney("USD", 100),
        availableAmount: createMoney("USD", 0),
        rolloverEnabled: true,
      },
    ];
    const allocations: EnvelopeAllocation[] = [
      {
        id: "alloc-fund-groceries",
        envelopeId: "env-groceries",
        occurredOn: "2026-04-01",
        amount: createMoney("USD", 100),
        type: "fund",
      },
    ];
    const transactions: Transaction[] = [
      {
        id: "txn-grocery-overspend",
        occurredOn: "2026-04-10",
        description: "Large grocery run",
        postings: [
          { accountId: "acct-expense-groceries", amount: createMoney("USD", 120) },
          { accountId: "acct-checking", amount: createMoney("USD", -120) },
        ],
      },
    ];

    const snapshot = buildEnvelopeBudgetSnapshot(
      envelopes,
      allocations,
      demoBaselineBudget,
      starterChartOfAccounts,
      transactions,
      range,
    );

    expect(snapshot[0]?.available.quantity).toBe(-20);
    expect(snapshot[0]?.overspent).toBe(true);
  });

  it("applies cover-overspend allocations across donor and covered envelopes", () => {
    const envelopes: Envelope[] = [
      {
        id: "env-groceries",
        name: "Groceries",
        expenseAccountId: "acct-expense-groceries",
        fundingAccountId: "acct-checking",
        targetAmount: createMoney("USD", 100),
        availableAmount: createMoney("USD", 0),
        rolloverEnabled: true,
      },
      {
        id: "env-utilities",
        name: "Utilities",
        expenseAccountId: "acct-expense-utilities",
        fundingAccountId: "acct-checking",
        targetAmount: createMoney("USD", 50),
        availableAmount: createMoney("USD", 0),
        rolloverEnabled: true,
      },
    ];
    const allocations: EnvelopeAllocation[] = [
      {
        id: "alloc-fund-groceries",
        envelopeId: "env-groceries",
        occurredOn: "2026-04-01",
        amount: createMoney("USD", 100),
        type: "fund",
      },
      {
        id: "alloc-fund-utilities",
        envelopeId: "env-utilities",
        occurredOn: "2026-04-01",
        amount: createMoney("USD", 50),
        type: "fund",
      },
      {
        id: "alloc-cover-groceries",
        envelopeId: "env-groceries",
        occurredOn: "2026-04-15",
        amount: createMoney("USD", 20),
        type: "cover-overspend",
      },
      {
        id: "alloc-cover-utilities",
        envelopeId: "env-utilities",
        occurredOn: "2026-04-15",
        amount: createMoney("USD", -20),
        type: "cover-overspend",
      },
    ];
    const transactions: Transaction[] = [
      {
        id: "txn-grocery-overspend",
        occurredOn: "2026-04-10",
        description: "Large grocery run",
        postings: [
          { accountId: "acct-expense-groceries", amount: createMoney("USD", 120) },
          { accountId: "acct-checking", amount: createMoney("USD", -120) },
        ],
      },
    ];

    const snapshot = buildEnvelopeBudgetSnapshot(
      envelopes,
      allocations,
      demoBaselineBudget,
      starterChartOfAccounts,
      transactions,
      range,
    );
    const groceries = snapshot.find((line) => line.envelopeId === "env-groceries");
    const utilities = snapshot.find((line) => line.envelopeId === "env-utilities");

    expect(groceries?.available.quantity).toBe(0);
    expect(groceries?.overspent).toBe(false);
    expect(utilities?.available.quantity).toBe(30);
  });

  it("derives remaining-to-budget from funding-source inflows minus fund allocations", () => {
    const accounts: Account[] = [
      ...starterChartOfAccounts,
      {
        id: "acct-cash-envelope",
        code: "1020",
        name: "Cash Envelope Source",
        type: "asset",
        isEnvelopeFundingSource: true,
      },
    ];
    const transactions: Transaction[] = [
      {
        id: "txn-paycheck",
        occurredOn: "2026-04-01",
        description: "Paycheck",
        postings: [
          { accountId: "acct-checking", amount: createMoney("USD", 3000) },
          { accountId: "acct-income-salary", amount: createMoney("USD", -3000) },
        ],
      },
      {
        id: "txn-cash-inflow",
        occurredOn: "2026-04-05",
        description: "Cash deposit",
        postings: [
          { accountId: "acct-cash-envelope", amount: createMoney("USD", 200) },
          { accountId: "acct-income-interest", amount: createMoney("USD", -200) },
        ],
      },
      {
        id: "txn-expense",
        occurredOn: "2026-04-10",
        description: "Expense",
        postings: [
          { accountId: "acct-expense-groceries", amount: createMoney("USD", 100) },
          { accountId: "acct-checking", amount: createMoney("USD", -100) },
        ],
      },
    ];
    const allocations: EnvelopeAllocation[] = [
      {
        id: "alloc-fund-groceries",
        envelopeId: "env-groceries",
        occurredOn: "2026-04-01",
        amount: createMoney("USD", 1000),
        type: "fund",
      },
      {
        id: "alloc-fund-utilities",
        envelopeId: "env-utilities",
        occurredOn: "2026-04-01",
        amount: createMoney("USD", 300),
        type: "fund",
      },
      {
        id: "alloc-release-utilities",
        envelopeId: "env-utilities",
        occurredOn: "2026-04-20",
        amount: createMoney("USD", 50),
        type: "release",
      },
      {
        id: "alloc-cover",
        envelopeId: "env-groceries",
        occurredOn: "2026-04-21",
        amount: createMoney("USD", 20),
        type: "cover-overspend",
      },
    ];

    const remaining = computeRemainingToAllocate(accounts, transactions, allocations, range);

    expect(remaining).toEqual([createMoney("USD", 1900)]);
  });

  it("builds period-close rollover balances and cleans up non-rollover envelopes", () => {
    const envelopes: Envelope[] = [
      {
        id: "env-rollover-on",
        name: "Rollover On",
        expenseAccountId: "acct-expense-groceries",
        fundingAccountId: "acct-checking",
        targetAmount: createMoney("USD", 100),
        availableAmount: createMoney("USD", 999),
        rolloverEnabled: true,
      },
      {
        id: "env-rollover-off",
        name: "Rollover Off",
        expenseAccountId: "acct-expense-utilities",
        fundingAccountId: "acct-checking",
        targetAmount: createMoney("USD", 100),
        availableAmount: createMoney("USD", 999),
        rolloverEnabled: false,
      },
      {
        id: "env-negative",
        name: "Negative",
        expenseAccountId: "acct-expense-transport",
        fundingAccountId: "acct-checking",
        targetAmount: createMoney("USD", 100),
        availableAmount: createMoney("USD", 999),
        rolloverEnabled: true,
      },
    ];
    const snapshot = [
      {
        envelopeId: "env-rollover-on",
        name: "Rollover On",
        planned: createMoney("USD", 100),
        funded: createMoney("USD", 100),
        spent: createMoney("USD", 40),
        available: createMoney("USD", 60),
        overspent: false,
      },
      {
        envelopeId: "env-rollover-off",
        name: "Rollover Off",
        planned: createMoney("USD", 100),
        funded: createMoney("USD", 100),
        spent: createMoney("USD", 20),
        available: createMoney("USD", 80),
        overspent: false,
      },
      {
        envelopeId: "env-negative",
        name: "Negative",
        planned: createMoney("USD", 100),
        funded: createMoney("USD", 100),
        spent: createMoney("USD", 140),
        available: createMoney("USD", -40),
        overspent: true,
      },
    ];

    const rolled = buildPeriodCloseRollover(envelopes, snapshot);

    expect(rolled.find((envelope) => envelope.id === "env-rollover-on")?.availableAmount.quantity).toBe(60);
    expect(rolled.find((envelope) => envelope.id === "env-rollover-off")?.availableAmount.quantity).toBe(0);
    expect(rolled.find((envelope) => envelope.id === "env-negative")?.availableAmount.quantity).toBe(0);
    expect(envelopes[0]?.availableAmount.quantity).toBe(999);
  });

  it("flags envelopes that are not backed by baseline budget lines", () => {
    const errors = validateBudgetConfiguration(
      demoBaselineBudget,
      [
        ...demoEnvelopes,
        {
          id: "env-transport",
          name: "Transport",
          expenseAccountId: "acct-expense-transport",
          fundingAccountId: "acct-checking",
          availableAmount: { commodityCode: "USD", quantity: 0 },
          rolloverEnabled: true,
        },
      ],
      starterChartOfAccounts,
    );

    expect(errors).toContain("Envelope Transport is not backed by a baseline budget line.");
  });

  it("flags overspent envelopes with no cover-overspend allocation in range", () => {
    const envelopes: Envelope[] = [
      {
        id: "env-groceries",
        name: "Groceries",
        expenseAccountId: "acct-expense-groceries",
        fundingAccountId: "acct-checking",
        availableAmount: createMoney("USD", 0),
        rolloverEnabled: true,
      },
    ];
    const allocations: EnvelopeAllocation[] = [
      {
        id: "alloc-fund-groceries",
        envelopeId: "env-groceries",
        occurredOn: "2026-04-01",
        amount: createMoney("USD", 100),
        type: "fund",
      },
    ];
    const transactions: Transaction[] = [
      {
        id: "txn-grocery-overspend",
        occurredOn: "2026-04-10",
        description: "Large grocery run",
        postings: [
          { accountId: "acct-expense-groceries", amount: createMoney("USD", 120) },
          { accountId: "acct-checking", amount: createMoney("USD", -120) },
        ],
      },
    ];
    const snapshot = buildEnvelopeBudgetSnapshot(
      envelopes,
      allocations,
      demoBaselineBudget,
      starterChartOfAccounts,
      transactions,
      range,
    );

    const errors = validateBudgetConfiguration(demoBaselineBudget, envelopes, starterChartOfAccounts, {
      allocations,
      envelopeSnapshot: snapshot,
      range,
    });

    expect(errors).toContain(
      "Envelope Groceries is overspent and has no cover allocation in the period.",
    );
  });

  it("does not flag overspent envelopes when covered in-range", () => {
    const envelopes: Envelope[] = [
      {
        id: "env-groceries",
        name: "Groceries",
        expenseAccountId: "acct-expense-groceries",
        fundingAccountId: "acct-checking",
        availableAmount: createMoney("USD", 0),
        rolloverEnabled: true,
      },
    ];
    const allocations: EnvelopeAllocation[] = [
      {
        id: "alloc-fund-groceries",
        envelopeId: "env-groceries",
        occurredOn: "2026-04-01",
        amount: createMoney("USD", 100),
        type: "fund",
      },
      {
        id: "alloc-cover-groceries",
        envelopeId: "env-groceries",
        occurredOn: "2026-04-20",
        amount: createMoney("USD", 25),
        type: "cover-overspend",
      },
    ];
    const transactions: Transaction[] = [
      {
        id: "txn-grocery-overspend",
        occurredOn: "2026-04-10",
        description: "Large grocery run",
        postings: [
          { accountId: "acct-expense-groceries", amount: createMoney("USD", 120) },
          { accountId: "acct-checking", amount: createMoney("USD", -120) },
        ],
      },
    ];
    const snapshot = buildEnvelopeBudgetSnapshot(
      envelopes,
      allocations,
      demoBaselineBudget,
      starterChartOfAccounts,
      transactions,
      range,
    );

    const errors = validateBudgetConfiguration(demoBaselineBudget, envelopes, starterChartOfAccounts, {
      allocations,
      envelopeSnapshot: snapshot,
      range,
    });

    expect(errors).not.toContain(
      "Envelope Groceries is overspent and has no cover allocation in the period.",
    );
  });
});
