import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ShellInspectorContent, ShellSidebarContent } from "./ShellSidePanels";
import { createLedgerBookModel, getBookViewDefinition } from "./shell";

const ledgerBook = createLedgerBookModel({
  accountBalances: [],
  searchText: "",
  selectedAccountId: "acct-checking",
  selectedTransactionId: "txn-1",
  book: {
    accounts: [
      { code: "1000", id: "acct-checking", name: "Checking", type: "asset" },
      { code: "6100", id: "acct-expense-groceries", name: "Groceries", type: "expense" },
    ],
    auditEvents: [],
    baseCommodityCode: "USD",
    baselineBudgetLines: [],
    commodities: [],
    envelopeAllocations: [],
    envelopes: [
      {
        availableAmount: { commodityCode: "USD", quantity: 100 },
        expenseAccountId: "acct-expense-groceries",
        fundingAccountId: "acct-checking",
        id: "env-groceries",
        name: "Groceries",
        rolloverEnabled: true,
        targetAmount: { commodityCode: "USD", quantity: 200 },
      },
    ],
    householdMembers: ["Primary"],
    id: "workspace",
    importBatches: [],
    name: "Household",
    reconciliationSessions: [],
    schemaVersion: 1,
    version: 1,
    scheduledTransactions: [
      {
        autoPost: false,
        frequency: "monthly",
        id: "sched-1",
        name: "Utilities",
        nextDueOn: "2026-05-01",
        templateTransaction: {
          description: "Utilities",
          postings: [
            { accountId: "acct-expense-groceries", amount: { commodityCode: "USD", quantity: 40 } },
            { accountId: "acct-checking", amount: { commodityCode: "USD", quantity: -40 } },
          ],
          tags: ["scheduled"],
        },
      },
    ],
    transactions: [
      {
        description: "Weekly groceries",
        id: "txn-1",
        occurredOn: "2026-04-01",
        payee: "Market",
        postings: [
          { accountId: "acct-expense-groceries", amount: { commodityCode: "USD", quantity: 40 } },
          { accountId: "acct-checking", amount: { commodityCode: "USD", quantity: -40 }, cleared: true },
        ],
        tags: ["household"],
      },
    ],
  },
});

const sharedProps = {
  baselineSnapshot: [],
  budgetConfigurationErrors: [],
  dueTransactions: [],
  getBookViewDefinition,
  ledgerValidationErrors: [],
  ledgerBook,
  overviewCards: [],
  selectedLedgerAccountId: "acct-checking" as string | null,
  selectedLedgerTransactionId: "txn-1" as string | null,
  setActiveView: vi.fn(),
  setSelectedLedgerAccountId: vi.fn(),
  setSelectedLedgerTransactionId: vi.fn(),
  bookAccounts: ledgerBook.availableAccounts,
  bookEnvelopes: [
    {
      availableAmount: { commodityCode: "USD", quantity: 100 },
      expenseAccountId: "acct-expense-groceries",
      fundingAccountId: "acct-checking",
      id: "env-groceries",
      name: "Groceries",
      rolloverEnabled: true,
      targetAmount: { commodityCode: "USD", quantity: 200 },
    },
  ],
  bookSchedules: [
    {
      autoPost: false,
      frequency: "monthly" as const,
      id: "sched-1",
      name: "Utilities",
      nextDueOn: "2026-05-01",
      templateTransaction: {
        description: "Utilities",
        postings: [
          { accountId: "acct-expense-groceries", amount: { commodityCode: "USD", quantity: 40 } },
          { accountId: "acct-checking", amount: { commodityCode: "USD", quantity: -40 } },
        ],
        tags: ["scheduled"],
      },
    },
  ],
};

describe("Shell side panels", () => {
  it("renders ledger sidebar content", () => {
    const html = renderToStaticMarkup(
      createElement(ShellSidebarContent, { ...sharedProps, activeView: "ledger" }),
    );
    expect(html).toContain("Ledger accounts");
  });

  it("renders ledger inspector selected transaction details", () => {
    const html = renderToStaticMarkup(
      createElement(ShellInspectorContent, { ...sharedProps, activeView: "ledger" }),
    );
    expect(html).toContain("Selected transaction");
    expect(html).toContain("Weekly groceries");
  });
});
