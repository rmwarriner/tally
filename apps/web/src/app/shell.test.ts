import { describe, expect, it } from "vitest";
import {
  createReconciliationWorkspaceModel,
  createLedgerWorkspaceModel,
  createOverviewCards,
  getNextPostingAmountFocusTarget,
  getNextPostingFocusTarget,
  getNextLedgerTransactionId,
  getTransactionEditorHotkeyAction,
  getLedgerSelectionIndex,
  getWorkspaceViewDefinition,
  movePostingIndex,
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
    expect(shouldHandleLedgerHotkey({ tagName: "DIV" } as unknown as EventTarget)).toBe(true);
    expect(shouldHandleLedgerHotkey({ tagName: "INPUT" } as unknown as EventTarget)).toBe(false);
    expect(shouldHandleLedgerHotkey({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(false);
  });

  it("maps transaction editor shortcuts to save and reset actions", () => {
    expect(
      getTransactionEditorHotkeyAction({
        ctrlKey: true,
        key: "s",
        metaKey: false,
      }),
    ).toBe("save");
    expect(
      getTransactionEditorHotkeyAction({
        ctrlKey: false,
        key: "Enter",
        metaKey: true,
      }),
    ).toBe("save");
    expect(
      getTransactionEditorHotkeyAction({
        ctrlKey: false,
        key: "Escape",
        metaKey: false,
      }),
    ).toBe("reset");
    expect(
      getTransactionEditorHotkeyAction({
        ctrlKey: false,
        key: "Enter",
        metaKey: false,
      }),
    ).toBeNull();
  });

  it("computes next posting amount focus targets for inline editing", () => {
    expect(
      getNextPostingAmountFocusTarget({
        postingCount: 3,
        postingIndex: 0,
      }),
    ).toEqual({
      addPosting: false,
      focusIndex: 1,
    });
    expect(
      getNextPostingAmountFocusTarget({
        postingCount: 3,
        postingIndex: 2,
      }),
    ).toEqual({
      addPosting: true,
      focusIndex: 3,
    });
  });

  it("computes per-field posting focus flow across rows", () => {
    expect(
      getNextPostingFocusTarget({
        field: "account",
        postingCount: 2,
        postingIndex: 0,
      }),
    ).toEqual({
      addPosting: false,
      field: "amount",
      focusIndex: 0,
    });
    expect(
      getNextPostingFocusTarget({
        field: "amount",
        postingCount: 2,
        postingIndex: 0,
      }),
    ).toEqual({
      addPosting: false,
      field: "memo",
      focusIndex: 0,
    });
    expect(
      getNextPostingFocusTarget({
        field: "memo",
        postingCount: 2,
        postingIndex: 1,
      }),
    ).toEqual({
      addPosting: true,
      field: "account",
      focusIndex: 2,
    });
  });

  it("bounds posting reordering targets within the current list", () => {
    expect(
      movePostingIndex({
        direction: "up",
        postingCount: 4,
        postingIndex: 0,
      }),
    ).toBe(0);
    expect(
      movePostingIndex({
        direction: "down",
        postingCount: 4,
        postingIndex: 1,
      }),
    ).toBe(2);
  });

  it("builds reconciliation matching state with cleared totals and latest session", () => {
    const model = createReconciliationWorkspaceModel({
      selectedAccountId: "acct-checking",
      selectedTransactionIds: {
        "txn-grocery-1": true,
        "txn-paycheck-1": true,
      },
      statementBalanceText: "3051.58",
      statementDate: "2026-04-02",
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
        reconciliationSessions: [
          {
            accountId: "acct-checking",
            clearedTransactionIds: ["txn-grocery-1"],
            difference: { commodityCode: "USD", quantity: 12.11 },
            id: "recon:checking:2026-03-31",
            statementBalance: { commodityCode: "USD", quantity: 3120.42 },
            statementDate: "2026-03-31",
          },
        ],
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
            tags: ["income"],
          },
          {
            description: "Weekly groceries",
            id: "txn-grocery-1",
            occurredOn: "2026-04-02",
            payee: "Neighborhood Market",
            postings: [
              { accountId: "acct-expense-groceries", amount: { commodityCode: "USD", quantity: 148.42 } },
              { accountId: "acct-checking", amount: { commodityCode: "USD", quantity: -148.42 }, cleared: true },
            ],
            tags: ["household"],
          },
        ],
      },
    });

    expect(model.selectedAccount?.id).toBe("acct-checking");
    expect(model.candidateTransactions.map((candidate) => candidate.id)).toEqual([
      "txn-grocery-1",
      "txn-paycheck-1",
    ]);
    expect(model.clearedTotal).toBeCloseTo(3051.58);
    expect(model.difference).toBeCloseTo(0);
    expect(model.latestSession?.statementDate).toBe("2026-03-31");
  });
});
