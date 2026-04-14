import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { FinanceBookDocument } from "@tally/book";
import { LedgerRegisterPanel } from "./LedgerRegisterPanel";
import { createLedgerBookModel } from "./shell";

const book: FinanceBookDocument = {
  accounts: [
    { code: "1000", id: "acct-checking", name: "Checking", type: "asset" as const },
    { code: "6100", id: "acct-groceries", name: "Groceries", type: "expense" as const },
  ],
  auditEvents: [],
  baseCommodityCode: "USD",
  baselineBudgetLines: [],
  closePeriods: [],
  commodities: [],
  envelopeAllocations: [],
  envelopes: [],
  householdMemberRoles: {},
  householdMembers: ["Primary"],
  id: "workspace",
  importBatches: [],
  name: "Household",
  pendingApprovals: [],
  reconciliationSessions: [],
  schemaVersion: 1 as const,
  version: 1,
  scheduledTransactions: [],
  transactions: [
    {
      description: "Groceries",
      id: "txn-1",
      occurredOn: "2026-04-01",
      payee: "Market",
      postings: [
        { accountId: "acct-groceries", amount: { commodityCode: "USD", quantity: 75 } },
        { accountId: "acct-checking", amount: { commodityCode: "USD", quantity: -75 }, cleared: true },
      ],
      tags: ["food"],
    },
  ],
};

describe("LedgerRegisterPanel", () => {
  it("omits register header labels and deprecated toolbar controls", () => {
    const ledgerBook = createLedgerBookModel({
      accountBalances: [
        {
          accountId: "acct-checking",
          accountName: "Checking",
          accountType: "asset",
          balance: 1200,
          commodityCode: "USD",
        },
      ],
      book,
      rangeEnd: "2026-04-30",
      rangeStart: "2026-04-01",
      selectedAccountId: "acct-checking",
      selectedTransactionId: "txn-1",
      statusFilter: "all",
    });

    const html = renderToStaticMarkup(
      createElement(LedgerRegisterPanel, {
        activeLedgerRegisterTabId: "tab-all",
        amountStyle: "both" as const,
        busy: null,
        expenseAccounts: [book.accounts[1]],
        formatCurrency: (amount: number) => `$${amount.toFixed(2)}`,
        formatTransactionStatus: (status: "cleared" | "open" | "reconciled") => status,
        inlineEditDraft: null,
        inlineEditingTransactionId: null,
        isFiltered: false,
        ledgerBook,
        ledgerRegisterTabs: [{ accountId: null, id: "tab-all", label: "All accounts" }],
        liquidAccounts: [book.accounts[0]],
        onActivateLedgerRegisterTab: () => undefined,
        onCancelInlineEdit: () => undefined,
        onCloseLedgerRegisterTab: () => undefined,
        onCreateInlineTransaction: () => undefined,
        onDeleteInlineTransaction: () => undefined,
        onOpenAdvancedEditor: () => undefined,
        onOpenLedgerRegisterTabForAccount: () => undefined,
        onOpenLinkedRegisterTabs: () => undefined,
        onOpenNewTab: () => undefined,
        onSaveInlineEdit: () => undefined,
        onSaveInlineSplitEdit: () => undefined,
        onStartInlineEdit: () => undefined,
        onUpdateInlineEditField: () => undefined,
        openingBalance: 0,
        selectedLedgerAccountId: null,
        selectedLedgerTransactionId: "txn-1",
        setSelectedLedgerAccountId: () => undefined,
        setSelectedLedgerTransactionId: () => undefined,
        totalCount: ledgerBook.totalCount,
      }),
    );

    expect(html).not.toContain("Register");
    expect(html).not.toContain("Double-entry ledger");
    expect(html).not.toContain("Active balance");
    expect(html).not.toContain("All statuses");
    expect(html).not.toContain(">From<");
    expect(html).not.toContain(">To<");
    expect(html).toContain("All accounts");
  });
});
