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
});
