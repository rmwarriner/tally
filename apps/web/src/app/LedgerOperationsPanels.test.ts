import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LedgerOperationsPanels } from "./LedgerOperationsPanels";

describe("LedgerOperationsPanels", () => {
  it("renders reconciliation summary and empty candidate hint", () => {
    const html = renderToStaticMarkup(
      createElement(LedgerOperationsPanels, {
        bookVersion: 42,
        busy: null,
        liquidAccounts: [
          { code: "1000", id: "acct-checking", name: "Checking", type: "asset" },
        ],
        reconciliationForm: {
          accountId: "acct-checking",
          statementBalance: "100",
          statementDate: "2026-04-01",
        },
        reconciliationBook: {
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

  it("disables submit and shows reconciling label while busy", () => {
    const html = renderToStaticMarkup(
      createElement(LedgerOperationsPanels, {
        bookVersion: 42,
        busy: "Reconciliation",
        liquidAccounts: [
          { code: "1000", id: "acct-checking", name: "Checking", type: "asset" },
        ],
        reconciliationForm: {
          accountId: "acct-checking",
          statementBalance: "100",
          statementDate: "2026-04-01",
        },
        reconciliationBook: {
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

    expect(html).toContain("Reconciling...");
    expect(html).toContain("disabled");
  });

  it("renders balanced and warning difference states", () => {
    const balancedHtml = renderToStaticMarkup(
      createElement(LedgerOperationsPanels, {
        bookVersion: 42,
        busy: null,
        liquidAccounts: [
          { code: "1000", id: "acct-checking", name: "Checking", type: "asset" },
        ],
        reconciliationForm: {
          accountId: "acct-checking",
          statementBalance: "100",
          statementDate: "2026-04-01",
        },
        reconciliationBook: {
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
    const warningHtml = renderToStaticMarkup(
      createElement(LedgerOperationsPanels, {
        bookVersion: 42,
        busy: null,
        liquidAccounts: [
          { code: "1000", id: "acct-checking", name: "Checking", type: "asset" },
        ],
        reconciliationForm: {
          accountId: "acct-checking",
          statementBalance: "100",
          statementDate: "2026-04-01",
        },
        reconciliationBook: {
          candidateTransactions: [],
          clearedTotal: 0,
          difference: 15,
          latestSession: undefined,
          selectedAccount: null,
          statementBalance: 100,
        },
        runMutation: async () => undefined,
        setReconciliationForm: vi.fn(),
        setSelectedReconciliationTransactionIds: vi.fn(),
      }),
    );

    expect(balancedHtml).toContain("balanced");
    expect(warningHtml).toContain("warning");
  });

  it("renders reconciliation candidates with selected and open states", () => {
    const html = renderToStaticMarkup(
      createElement(LedgerOperationsPanels, {
        bookVersion: 42,
        busy: null,
        liquidAccounts: [
          { code: "1000", id: "acct-checking", name: "Checking", type: "asset" },
        ],
        reconciliationForm: {
          accountId: "acct-checking",
          statementBalance: "100",
          statementDate: "2026-04-01",
        },
        reconciliationBook: {
          candidateTransactions: [
            {
              accountAmount: -85,
              description: "Grocery run",
              id: "txn-a",
              occurredOn: "2026-04-01",
              payee: "Market",
              selected: true,
            },
            {
              accountAmount: -45,
              description: "Bus pass",
              id: "txn-b",
              occurredOn: "2026-04-03",
              payee: null,
              selected: false,
            },
          ],
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

    expect(html).toContain("Grocery run");
    expect(html).toContain("Bus pass");
    expect(html).toContain("Cleared");
    expect(html).toContain("Open");
  });
});
