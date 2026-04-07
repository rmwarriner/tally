import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LedgerOperationsPanels } from "./LedgerOperationsPanels";

describe("LedgerOperationsPanels", () => {
  it("renders reconciliation summary and empty candidate hint", () => {
    const html = renderToStaticMarkup(
      createElement(LedgerOperationsPanels, {
        busy: null,
        liquidAccounts: [
          { code: "1000", id: "acct-checking", name: "Checking", type: "asset" },
        ],
        reconciliationForm: {
          accountId: "acct-checking",
          statementBalance: "100",
          statementDate: "2026-04-01",
        },
        reconciliationWorkspace: {
          candidateTransactions: [],
          clearedTotal: 0,
          difference: 0,
          latestSession: undefined,
          selectedAccount: null,
          statementBalance: 100,
        },
        runMutation: async () => undefined,
        setReconciliationForm: vi.fn(),
        setSelectedReconciliationTransactionIds: vi.fn(),
      }),
    );

    expect(html).toContain("Reconcile");
    expect(html).toContain("Cleared total");
    expect(html).toContain("No transactions are available for the selected account and statement date.");
  });
});
