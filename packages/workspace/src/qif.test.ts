import { describe, expect, it } from "vitest";
import { createDemoWorkspace } from "./factory";
import { buildQifExport, parseQif } from "./qif";

describe("qif adapter", () => {
  it("parses bank-style qif entries", () => {
    const result = parseQif(`!Type:Bank
D04/03/2026
T-45.12
PCity Utilities
MElectric bill
Lacct-expense-utilities
^
D04/04/2026
T3200.00
PEmployer
MPayroll
Lacct-income-salary
^
`);

    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual([
      {
        amount: -45.12,
        category: "acct-expense-utilities",
        date: "2026-04-03",
        memo: "Electric bill",
        payee: "City Utilities",
      },
      {
        amount: 3200,
        category: "acct-income-salary",
        date: "2026-04-04",
        memo: "Payroll",
        payee: "Employer",
      },
    ]);
  });

  it("exports account transactions to qif", () => {
    const workspace = createDemoWorkspace();
    const result = buildQifExport({
      accountId: "acct-checking",
      from: "2026-04-01",
      to: "2026-04-30",
      workspace,
    });

    expect(result.transactionCount).toBeGreaterThan(0);
    expect(result.contents).toContain("!Type:Bank");
    expect(result.contents).toContain("D04/01/2026");
    expect(result.contents).toContain("T3200");
    expect(result.contents).toContain("PEmployer");
  });

  it("parses iso and apostrophe dates and reports unsupported records", () => {
    const result = parseQif(`!Type:Bank
D2026-04-03
T-45.12
PCity Utilities
Ssplit one
^
D04/03'26
Tbad
^
`);

    expect(result.entries).toEqual([
      {
        amount: -45.12,
        date: "2026-04-03",
        payee: "City Utilities",
      },
    ]);
    expect(result.errors).toContain("entry 1: split transactions are not supported.");
    expect(result.errors).toContain("entry 2: amount must be numeric.");
    expect(result.errors).toContain("entry 2: amount is required.");
  });

  it("exports split transactions with fallback categories and sanitized text", () => {
    const workspace = createDemoWorkspace();
    workspace.transactions.push({
      description: "  Split groceries ^ trip  ",
      id: "txn-split-1",
      occurredOn: "2026-04-20",
      payee: "Store\nName",
      postings: [
        { accountId: "acct-checking", amount: { commodityCode: "USD", quantity: -75 } },
        { accountId: "acct-expense-groceries", amount: { commodityCode: "USD", quantity: 50 }, memo: " Food^" },
        { accountId: "acct-expense-transport", amount: { commodityCode: "USD", quantity: 25 } },
      ],
    });

    const result = buildQifExport({
      accountId: "acct-checking",
      from: "2026-04-01",
      to: "2026-04-30",
      workspace,
    });

    expect(result.contents).toContain("PStore Name");
    expect(result.contents).toContain("MSplit groceries   trip");
    expect(result.contents).toContain("L[Split]");
  });
});
