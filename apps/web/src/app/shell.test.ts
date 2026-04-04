import { describe, expect, it } from "vitest";
import {
  createLedgerWorkspaceModel,
  createOverviewCards,
  getNextLedgerTransactionId,
  getLedgerSelectionIndex,
  getWorkspaceViewDefinition,
  shouldHandleLedgerHotkey,
  workspaceViews,
} from "./shell";

describe("web shell view model", () => {
  it("exposes stable workspace views for navigation", () => {
    expect(workspaceViews.map((view) => view.id)).toEqual([
      "overview",
      "ledger",
      "budget",
      "envelopes",
      "imports",
      "automations",
      "reports",
    ]);
    expect(getWorkspaceViewDefinition("ledger")).toMatchObject({
      detail: "Double-entry workspace",
      label: "Ledger",
      title: "Ledger register",
    });
  });

  it("builds overview cards with readable singular and plural summaries", () => {
    expect(
      createOverviewCards({
        accountBalanceCount: 4,
        budgetIssueCount: 1,
        dueTransactionCount: 2,
        envelopeCount: 1,
        ledgerIssueCount: 0,
      }),
    ).toEqual([
      {
        id: "ledger",
        metric: "4",
        summary: "accounts with live balances",
      },
      {
        id: "budget",
        metric: "1",
        summary: "budget issue to review",
      },
      {
        id: "envelopes",
        metric: "1",
        summary: "envelope category active",
      },
      {
        id: "automations",
        metric: "2",
        summary: "scheduled items due soon",
      },
      {
        id: "reports",
        metric: "0",
        summary: "ledger warnings surfaced",
      },
    ]);
  });

  it("builds account-filtered ledger drill-down state with posting details", () => {
    const model = createLedgerWorkspaceModel({
      accountBalances: [
        {
          accountId: "acct-checking",
          accountName: "Checking",
          accountType: "asset",
          balance: 3051.58,
          commodityCode: "USD",
        },
        {
          accountId: "acct-expense-groceries",
          accountName: "Groceries",
          accountType: "expense",
          balance: 148.42,
          commodityCode: "USD",
        },
      ],
      searchText: "market",
      selectedAccountId: "acct-checking",
      selectedTransactionId: "txn-grocery-1",
      workspace: {
        accounts: [
          { code: "1000", id: "acct-checking", name: "Checking", type: "asset" },
          { code: "6100", id: "acct-expense-groceries", name: "Groceries", type: "expense" },
          { code: "4000", id: "acct-income-salary", name: "Salary", type: "income" },
        ],
        auditEvents: [],
        baseCommodityCode: "USD",
        baselineBudgetLines: [],
        commodities: [],
        envelopeAllocations: [],
        envelopes: [],
        householdMembers: ["Primary"],
        id: "workspace-household-demo",
        importBatches: [],
        name: "Household",
        reconciliationSessions: [],
        schemaVersion: 1,
        scheduledTransactions: [],
        transactions: [
          {
            description: "April paycheck",
            id: "txn-paycheck-1",
            occurredOn: "2026-04-01",
            payee: "Employer Inc.",
            postings: [
              { accountId: "acct-checking", amount: { commodityCode: "USD", quantity: 3200 } },
              { accountId: "acct-income-salary", amount: { commodityCode: "USD", quantity: -3200 } },
            ],
            tags: ["income", "payroll"],
          },
          {
            description: "Weekly groceries",
            id: "txn-grocery-1",
            occurredOn: "2026-04-02",
            payee: "Neighborhood Market",
            postings: [
              {
                accountId: "acct-expense-groceries",
                amount: { commodityCode: "USD", quantity: 148.42 },
                memo: "Family weekly run",
              },
              {
                accountId: "acct-checking",
                amount: { commodityCode: "USD", quantity: -148.42 },
                cleared: true,
              },
            ],
            tags: ["household"],
          },
        ],
      },
    });

    expect(model.filteredBalances).toEqual([
      {
        accountId: "acct-checking",
        accountName: "Checking",
        accountType: "asset",
        balance: 3051.58,
        commodityCode: "USD",
      },
    ]);
    expect(model.filteredTransactions.map((transaction) => transaction.id)).toEqual(["txn-grocery-1"]);
    expect(model.selectedAccount).toMatchObject({
      balanceCount: 1,
      id: "acct-checking",
      transactionCount: 2,
    });
    expect(model.selectedTransaction).toMatchObject({
      id: "txn-grocery-1",
      postings: [
        expect.objectContaining({
          accountId: "acct-expense-groceries",
          accountName: "Groceries",
          memo: "Family weekly run",
        }),
        expect.objectContaining({
          accountId: "acct-checking",
          amount: -148.42,
          cleared: true,
        }),
      ],
    });
  });

  it("computes ledger selection movement for keyboard navigation", () => {
    const transactions = [
      {
        description: "One",
        id: "txn-1",
        matchedAccountIds: ["acct-1"],
        occurredOn: "2026-04-01",
        payee: null,
        postings: [],
        tags: [],
      },
      {
        description: "Two",
        id: "txn-2",
        matchedAccountIds: ["acct-1"],
        occurredOn: "2026-04-02",
        payee: null,
        postings: [],
        tags: [],
      },
    ];

    expect(
      getLedgerSelectionIndex({
        selectedTransactionId: "txn-2",
        transactions,
      }),
    ).toBe(1);
    expect(
      getNextLedgerTransactionId({
        direction: "next",
        selectedTransactionId: null,
        transactions,
      }),
    ).toBe("txn-1");
    expect(
      getNextLedgerTransactionId({
        direction: "previous",
        selectedTransactionId: null,
        transactions,
      }),
    ).toBe("txn-2");
    expect(
      getNextLedgerTransactionId({
        direction: "next",
        selectedTransactionId: "txn-2",
        transactions,
      }),
    ).toBe("txn-2");
  });

  it("avoids handling ledger hotkeys while typing into form controls", () => {
    expect(shouldHandleLedgerHotkey(null)).toBe(true);
    expect(shouldHandleLedgerHotkey({ tagName: "DIV" } as EventTarget)).toBe(true);
    expect(shouldHandleLedgerHotkey({ tagName: "INPUT" } as EventTarget)).toBe(false);
    expect(shouldHandleLedgerHotkey({ tagName: "TEXTAREA" } as EventTarget)).toBe(false);
  });
});
