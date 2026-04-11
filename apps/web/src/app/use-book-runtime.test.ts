import { describe, expect, it } from "vitest";
import { resolveInitialLedgerAccountId } from "./use-book-runtime";

describe("resolveInitialLedgerAccountId", () => {
  it("returns the stored account when it still exists", () => {
    expect(
      resolveInitialLedgerAccountId({
        accounts: [
          { id: "acct-checking", name: "Checking", type: "asset", code: "1000" },
          { id: "acct-cash", name: "Cash", type: "asset", code: "1010" },
        ],
        storedAccountId: "acct-cash",
      }),
    ).toBe("acct-cash");
  });

  it("falls back to the first asset account sorted by code", () => {
    expect(
      resolveInitialLedgerAccountId({
        accounts: [
          { id: "acct-income", name: "Salary", type: "income", code: "4000" },
          { id: "acct-savings", name: "Savings", type: "asset", code: "2000" },
          { id: "acct-checking", name: "Checking", type: "asset", code: "1000" },
        ],
        storedAccountId: "acct-missing",
      }),
    ).toBe("acct-checking");
  });

  it("falls back to the first account when no asset account exists", () => {
    expect(
      resolveInitialLedgerAccountId({
        accounts: [
          { id: "acct-income", name: "Salary", type: "income", code: "4000" },
          { id: "acct-expense", name: "Groceries", type: "expense", code: "6100" },
        ],
        storedAccountId: null,
      }),
    ).toBe("acct-income");
  });

  it("returns null when there are no accounts", () => {
    expect(
      resolveInitialLedgerAccountId({
        accounts: [],
        storedAccountId: "acct-anything",
      }),
    ).toBeNull();
  });
});
