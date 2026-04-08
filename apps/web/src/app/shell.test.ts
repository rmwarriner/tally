import { describe, expect, it } from "vitest";
import {
  createLedgerBookModel,
  createOverviewCards,
  createReconciliationBookModel,
  findAccountSearchExactMatch,
  getAccountSearchMatches,
  getNextPostingAmountFocusTarget,
  getNextPostingFocusTarget,
  getNextLedgerTransactionId,
  getPostingBalanceSummary,
  getTransactionEditorHotkeyAction,
  getPreferredAccountTypesForPostingAmount,
  getLedgerSelectionIndex,
  getBookViewDefinition,
  movePostingIndex,
  shouldHandleLedgerHotkey,
  bookViews,
} from "./shell";

describe("web shell view model", () => {
  it("exposes stable book views for navigation", () => {
    expect(bookViews.map((view) => view.id)).toEqual([
      "overview",
      "ledger",
      "budget",
      "envelopes",
      "imports",
      "automations",
      "reports",
    ]);
    expect(getBookViewDefinition("ledger")).toMatchObject({
      detail: "Double-entry ledger",
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
    const model = createLedgerBookModel({
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
      book: {
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
    expect(model.selectedAccountBalance).toMatchObject({
      accountId: "acct-checking",
      balance: 3051.58,
    });
    expect(model.selectedTransaction).toMatchObject({
      id: "txn-grocery-1",
      status: "cleared",
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
        status: "open" as const,
        tags: [],
      },
      {
        description: "Two",
        id: "txn-2",
        matchedAccountIds: ["acct-1"],
        occurredOn: "2026-04-02",
        payee: null,
        postings: [],
        status: "open" as const,
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

  it("ranks account search matches by exactness and keeps the selected account visible", () => {
    const accounts = [
      { code: "1000", id: "acct-checking", name: "Checking", type: "asset" as const },
      { code: "1010", id: "acct-savings", name: "Savings", type: "asset" as const },
      { code: "6100", id: "acct-expense-groceries", name: "Groceries", type: "expense" as const },
      { code: "2100", id: "acct-credit-card", name: "Credit Card", type: "liability" as const },
    ];

    expect(
      getAccountSearchMatches({
        accounts,
        query: "gro",
      }).map((match) => match.account.id),
    ).toEqual(["acct-expense-groceries"]);

    expect(
      getAccountSearchMatches({
        accounts,
        query: "checking 1000",
      }).map((match) => match.account.id),
    ).toEqual(["acct-checking"]);

    expect(
      getAccountSearchMatches({
        accounts,
        query: "",
        selectedAccountId: "acct-savings",
      }).map((match) => match.account.id),
    ).toEqual(["acct-savings", "acct-checking", "acct-credit-card", "acct-expense-groceries"]);
    expect(
      getAccountSearchMatches({
        accounts,
        preferredAccountTypes: ["liability"],
        query: "",
      }).map((match) => ({
        id: match.account.id,
        recommended: match.recommended,
      })),
    ).toEqual([
      { id: "acct-credit-card", recommended: true },
      { id: "acct-checking", recommended: false },
      { id: "acct-expense-groceries", recommended: false },
      { id: "acct-savings", recommended: false },
    ]);
  });

  it("resolves exact account matches from id, name, code, or composed label", () => {
    const accounts = [
      { code: "1000", id: "acct-checking", name: "Checking", type: "asset" as const },
      { code: "6100", id: "acct-expense-groceries", name: "Groceries", type: "expense" as const },
    ];

    expect(
      findAccountSearchExactMatch({
        accounts,
        query: "acct-checking",
      })?.id,
    ).toBe("acct-checking");
    expect(
      findAccountSearchExactMatch({
        accounts,
        query: "groceries",
      })?.id,
    ).toBe("acct-expense-groceries");
    expect(
      findAccountSearchExactMatch({
        accounts,
        query: "6100",
      })?.id,
    ).toBe("acct-expense-groceries");
    expect(
      findAccountSearchExactMatch({
        accounts,
        query: "Checking (1000)",
      })?.id,
    ).toBe("acct-checking");
  });

  it("maps posting amount direction to preferred account types", () => {
    expect(getPreferredAccountTypesForPostingAmount("25")).toEqual(["asset", "expense"]);
    expect(getPreferredAccountTypesForPostingAmount("-25")).toEqual([
      "liability",
      "equity",
      "income",
    ]);
    expect(getPreferredAccountTypesForPostingAmount("0")).toEqual([]);
    expect(getPreferredAccountTypesForPostingAmount("not-a-number")).toEqual([]);
  });

  it("computes posting balance summaries for editor defaults", () => {
    expect(getPostingBalanceSummary(["100", "-40"])).toEqual({
      balance: 60,
      defaultAmount: "-60",
      isBalanced: false,
    });
    expect(getPostingBalanceSummary(["100", "-100"])).toEqual({
      balance: 0,
      defaultAmount: "0",
      isBalanced: true,
    });
    expect(getPostingBalanceSummary(["100", "not-a-number"])).toEqual({
      balance: null,
      defaultAmount: "0",
      isBalanced: false,
    });
  });

  it("builds reconciliation matching state with cleared totals and latest session", () => {
    const model = createReconciliationBookModel({
      selectedAccountId: "acct-checking",
      selectedTransactionIds: {
        "txn-grocery-1": true,
        "txn-paycheck-1": true,
      },
      statementBalanceText: "3051.58",
      statementDate: "2026-04-02",
      book: {
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
              {
                accountId: "acct-checking",
                amount: { commodityCode: "USD", quantity: 3200 },
                reconciledAt: "2026-04-01T09:00:00.000Z",
              },
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

  it("matches ledger searches across multiple tokens and date range filters", () => {
    const model = createLedgerBookModel({
      accountBalances: [],
      rangeEnd: "2026-04-15",
      rangeStart: "2026-04-01",
      searchText: "checking 1000 household cleared",
      selectedAccountId: "acct-checking",
      selectedTransactionId: "txn-grocery-1",
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
            description: "Weekly groceries",
            id: "txn-grocery-1",
            occurredOn: "2026-04-02",
            payee: "Neighborhood Market",
            postings: [
              {
                accountId: "acct-expense-groceries",
                amount: { commodityCode: "USD", quantity: 148.42 },
              },
              {
                accountId: "acct-checking",
                amount: { commodityCode: "USD", quantity: -148.42 },
                cleared: true,
              },
            ],
            tags: ["household"],
          },
          {
            description: "Later groceries",
            id: "txn-grocery-2",
            occurredOn: "2026-04-20",
            payee: "Neighborhood Market",
            postings: [
              {
                accountId: "acct-expense-groceries",
                amount: { commodityCode: "USD", quantity: 22.15 },
              },
              {
                accountId: "acct-checking",
                amount: { commodityCode: "USD", quantity: -22.15 },
              },
            ],
            tags: ["household"],
          },
        ],
      },
    });

    expect(model.filteredTransactions.map((transaction) => transaction.id)).toEqual(["txn-grocery-1"]);
  });

  it("filters ledger transactions by explicit status filter", () => {
    const model = createLedgerBookModel({
      accountBalances: [],
      searchText: "",
      selectedAccountId: "acct-checking",
      selectedTransactionId: null,
      statusFilter: "cleared",
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
            description: "Weekly groceries",
            id: "txn-grocery-1",
            occurredOn: "2026-04-02",
            payee: "Neighborhood Market",
            postings: [
              {
                accountId: "acct-expense-groceries",
                amount: { commodityCode: "USD", quantity: 148.42 },
              },
              {
                accountId: "acct-checking",
                amount: { commodityCode: "USD", quantity: -148.42 },
                cleared: true,
              },
            ],
            tags: ["household"],
          },
          {
            description: "Later groceries",
            id: "txn-grocery-2",
            occurredOn: "2026-04-20",
            payee: "Neighborhood Market",
            postings: [
              {
                accountId: "acct-expense-groceries",
                amount: { commodityCode: "USD", quantity: 22.15 },
              },
              {
                accountId: "acct-checking",
                amount: { commodityCode: "USD", quantity: -22.15 },
              },
            ],
            tags: ["household"],
          },
        ],
      },
    });

    expect(model.filteredTransactions.map((transaction) => transaction.id)).toEqual(["txn-grocery-1"]);
  });
});
