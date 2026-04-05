import { describe, expect, it } from "vitest";
import { starterChartOfAccounts } from "./chart-of-accounts";
import {
  createMoney,
  validateBalancedTransaction,
  validateBaselineBudgetLine,
  validateEnvelope,
} from "./accounting";

describe("accounting validation", () => {
  it("requires balanced multi-posting transactions by commodity", () => {
    expect(
      validateBalancedTransaction({
        description: "Single posting",
        id: "txn-1",
        occurredOn: "2026-04-01",
        postings: [{ accountId: "acct-checking", amount: createMoney("USD", 50) }],
      }),
    ).toEqual({
      ok: false,
      errors: ["A transaction must contain at least two postings."],
    });

    const multiCommodity = validateBalancedTransaction({
      description: "FX purchase",
      id: "txn-2",
      occurredOn: "2026-04-01",
      postings: [
        { accountId: "acct-checking", amount: createMoney("USD", -10) },
        { accountId: "acct-expense-groceries", amount: createMoney("USD", 10) },
        { accountId: "acct-checking", amount: createMoney("EUR", -5) },
        { accountId: "acct-expense-groceries", amount: createMoney("EUR", 4) },
      ],
    });

    expect(multiCommodity.ok).toBe(false);
    expect(multiCommodity.errors).toEqual(["Transaction is not balanced for commodity EUR."]);
  });

  it("validates envelope account types and available amount", () => {
    const result = validateEnvelope(
      {
        availableAmount: createMoney("USD", -1),
        expenseAccountId: "acct-checking",
        fundingAccountId: "acct-expense-groceries",
        id: "env-invalid",
        name: "Invalid Envelope",
        rolloverEnabled: false,
      },
      starterChartOfAccounts,
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Envelope expense account must reference an expense account.");
    expect(result.errors).toContain("Envelope funding account must reference an asset account.");
    expect(result.errors).toContain("Envelope available amount cannot start negative.");
  });

  it("validates baseline budget account eligibility", () => {
    expect(
      validateBaselineBudgetLine(
        {
          accountId: "acct-missing",
          budgetPeriod: "monthly",
          period: "2026-04",
          plannedAmount: createMoney("USD", 50),
        },
        starterChartOfAccounts,
      ),
    ).toEqual({
      ok: false,
      errors: ["Budget line references an unknown account."],
    });

    expect(
      validateBaselineBudgetLine(
        {
          accountId: "acct-checking",
          budgetPeriod: "monthly",
          period: "2026-04",
          plannedAmount: createMoney("USD", 50),
        },
        starterChartOfAccounts,
      ),
    ).toEqual({
      ok: false,
      errors: ["Baseline budgets should point to income or expense accounts only."],
    });
  });
});
