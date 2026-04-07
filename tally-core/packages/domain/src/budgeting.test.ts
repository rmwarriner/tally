import { describe, expect, it } from "vitest";
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
  validateBudgetConfiguration,
} from "./budgeting";

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
});
