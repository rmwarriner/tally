import { describe, expect, it } from "vitest";
import type { LedgerTransactionDetail } from "./shell";
import {
  getInlineSplitAccountApplyKeyAction,
  getLedgerRegisterTabHotkeyAction,
  createLedgerInlineRowEditDraft,
  getInlineSplitAccountGuidance,
  getInlineSplitAccountResolution,
  getLedgerRowHotkeyAction,
  getSplitQuickEditKeyAction,
  getSplitReorderKeyAction,
  getLedgerHotkeySelectionUpdate,
  getSyncedLedgerSelectionId,
  moveInlineSplitDraft,
  updateLedgerInlineRowEditDraft,
  validateInlineLedgerSplitDrafts,
} from "./ledger-state";

function createTransaction(id: string): LedgerTransactionDetail {
  return {
    description: `Transaction ${id}`,
    id,
    matchedAccountIds: ["acct-checking"],
    occurredOn: "2026-04-01",
    payee: "Vendor",
    postings: [
      {
        accountCode: "1000",
        accountId: "acct-checking",
        accountName: "Checking",
        amount: -20,
        cleared: false,
        commodityCode: "USD",
        memo: null,
      },
      {
        accountCode: "6000",
        accountId: "acct-expense",
        accountName: "Expense",
        amount: 20,
        cleared: false,
        commodityCode: "USD",
        memo: null,
      },
    ],
    status: "open",
    tags: ["test"],
  };
}

describe("getLedgerHotkeySelectionUpdate", () => {
  const transactions = [createTransaction("txn-1"), createTransaction("txn-2"), createTransaction("txn-3")];

  it("moves selection down with j", () => {
    expect(
      getLedgerHotkeySelectionUpdate({
        eventKey: "j",
        filteredTransactions: transactions,
        selectedLedgerTransactionId: "txn-1",
        target: { tagName: "DIV" } as unknown as EventTarget,
      }),
    ).toMatchObject({
      handled: true,
      nextSelectedLedgerTransactionId: "txn-2",
    });
  });

  it("ignores hotkeys while target is an input field", () => {
    const input = { tagName: "INPUT" } as unknown as EventTarget;
    expect(
      getLedgerHotkeySelectionUpdate({
        eventKey: "j",
        filteredTransactions: transactions,
        selectedLedgerTransactionId: "txn-1",
        target: input,
      }),
    ).toEqual({
      handled: false,
      nextSelectedLedgerTransactionId: "txn-1",
    });
  });
});

describe("getLedgerRowHotkeyAction", () => {
  it("returns begin-inline-edit for e on non-input target", () => {
    expect(getLedgerRowHotkeyAction({ key: "e", target: { tagName: "DIV" } as unknown as EventTarget })).toEqual({
      type: "begin-inline-edit",
    });
  });

  it("returns none for e on input target", () => {
    expect(getLedgerRowHotkeyAction({ key: "e", target: { tagName: "INPUT" } as unknown as EventTarget })).toEqual({
      type: "none",
    });
  });

  it("returns none for other keys", () => {
    expect(getLedgerRowHotkeyAction({ key: "k", target: { tagName: "DIV" } as unknown as EventTarget })).toEqual({
      type: "none",
    });
  });
});

describe("getSyncedLedgerSelectionId", () => {
  it("keeps selection when selected transaction is still visible", () => {
    const transactions = [createTransaction("txn-1"), createTransaction("txn-2")];
    expect(
      getSyncedLedgerSelectionId({
        filteredTransactions: transactions,
        selectedLedgerTransactionId: "txn-2",
      }),
    ).toBe("txn-2");
  });

  it("falls back to first filtered transaction when selected transaction disappears", () => {
    const transactions = [createTransaction("txn-3"), createTransaction("txn-4")];
    expect(
      getSyncedLedgerSelectionId({
        filteredTransactions: transactions,
        selectedLedgerTransactionId: "txn-2",
      }),
    ).toBe("txn-3");
  });
});

describe("ledger inline row edit draft", () => {
  it("creates a draft and normalizes null payee to empty string", () => {
    expect(
      createLedgerInlineRowEditDraft({
        accountAmount: "-20",
        counterpartyAccountId: "acct-expense",
        description: "Groceries",
        occurredOn: "2026-04-01",
        payee: null,
        status: "open",
      }),
    ).toEqual({
      accountAmount: "-20",
      counterpartyAccountId: "acct-expense",
      description: "Groceries",
      occurredOn: "2026-04-01",
      payee: "",
      status: "open",
    });
  });

  it("updates a single field without mutating other draft fields", () => {
    expect(
      updateLedgerInlineRowEditDraft({
        draft: {
          accountAmount: "-20",
          counterpartyAccountId: "acct-expense",
          description: "Groceries",
          occurredOn: "2026-04-01",
          payee: "",
          status: "open",
        },
        field: "description",
        value: "Market groceries",
      }),
    ).toEqual({
      accountAmount: "-20",
      counterpartyAccountId: "acct-expense",
      description: "Market groceries",
      occurredOn: "2026-04-01",
      payee: "",
      status: "open",
    });
  });

  it("updates status without mutating other draft fields", () => {
    expect(
      updateLedgerInlineRowEditDraft({
        draft: {
          accountAmount: "-20",
          counterpartyAccountId: "acct-expense",
          description: "Groceries",
          occurredOn: "2026-04-01",
          payee: "",
          status: "open",
        },
        field: "status",
        value: "cleared",
      }),
    ).toEqual({
      accountAmount: "-20",
      counterpartyAccountId: "acct-expense",
      description: "Groceries",
      occurredOn: "2026-04-01",
      payee: "",
      status: "cleared",
    });
  });
});

describe("getSplitQuickEditKeyAction", () => {
  it("returns cancel on escape from memo field", () => {
    expect(
      getSplitQuickEditKeyAction({
        field: "memo",
        key: "Escape",
        splitCount: 3,
        splitIndex: 0,
      }),
    ).toEqual({ type: "cancel" });
  });

  it("moves focus from memo to amount on enter", () => {
    expect(
      getSplitQuickEditKeyAction({
        field: "memo",
        key: "Enter",
        splitCount: 3,
        splitIndex: 1,
      }),
    ).toEqual({ splitIndex: 1, type: "focus-amount" });
  });

  it("moves focus from amount to cleared on enter", () => {
    expect(
      getSplitQuickEditKeyAction({
        field: "amount",
        key: "Enter",
        splitCount: 3,
        splitIndex: 1,
      }),
    ).toEqual({ splitIndex: 1, type: "focus-cleared" });
  });

  it("moves focus from cleared to next memo when not on last split", () => {
    expect(
      getSplitQuickEditKeyAction({
        field: "cleared",
        key: "Enter",
        splitCount: 3,
        splitIndex: 1,
      }),
    ).toEqual({ splitIndex: 2, type: "focus-memo" });
  });

  it("moves focus from cleared to save when on last split", () => {
    expect(
      getSplitQuickEditKeyAction({
        field: "cleared",
        key: "Enter",
        splitCount: 3,
        splitIndex: 2,
      }),
    ).toEqual({ type: "focus-save" });
  });
});

describe("validateInlineLedgerSplitDrafts", () => {
  it("returns a save-ready result for balanced splits with accounts", () => {
    expect(
      validateInlineLedgerSplitDrafts({
        splits: [
          { accountId: "acct-checking", amount: "-25.50" },
          { accountId: "acct-expense-food", amount: "25.50" },
        ],
      }),
    ).toMatchObject({
      allAccountsValid: true,
      allAmountsValid: true,
      canSave: true,
      hasMinimumRows: true,
      isBalanced: true,
      parsedAmounts: [-25.5, 25.5],
    });
  });

  it("blocks save when splits are missing account ids or minimum rows", () => {
    expect(
      validateInlineLedgerSplitDrafts({
        splits: [{ accountId: " ", amount: "10" }],
      }),
    ).toMatchObject({
      allAccountsValid: false,
      canSave: false,
      hasMinimumRows: false,
    });
  });

  it("blocks save when amounts are invalid or out of balance", () => {
    expect(
      validateInlineLedgerSplitDrafts({
        splits: [
          { accountId: "acct-checking", amount: "x" },
          { accountId: "acct-expense-food", amount: "12.34" },
        ],
      }),
    ).toMatchObject({
      allAmountsValid: false,
      canSave: false,
      isBalanced: false,
    });

    expect(
      validateInlineLedgerSplitDrafts({
        splits: [
          { accountId: "acct-checking", amount: "-10" },
          { accountId: "acct-expense-food", amount: "9.99" },
        ],
      }),
    ).toMatchObject({
      allAmountsValid: true,
      canSave: false,
      isBalanced: false,
    });
  });

  it("returns splitBalance as the sum of parseable split amounts", () => {
    expect(
      validateInlineLedgerSplitDrafts({
        splits: [
          { accountId: "acct-checking", amount: "100" },
          { accountId: "acct-expense-food", amount: "-60" },
        ],
      }).splitBalance,
    ).toBe(40);
  });
});

describe("moveInlineSplitDraft", () => {
  it("moves a split up and preserves the other rows", () => {
    expect(
      moveInlineSplitDraft({
        direction: "up",
        splitIndex: 1,
        splits: [
          { accountId: "acct-a", amount: "1", memo: "a" },
          { accountId: "acct-b", amount: "2", memo: "b" },
          { accountId: "acct-c", amount: "3", memo: "c" },
        ],
      }),
    ).toEqual([
      { accountId: "acct-b", amount: "2", memo: "b" },
      { accountId: "acct-a", amount: "1", memo: "a" },
      { accountId: "acct-c", amount: "3", memo: "c" },
    ]);
  });

  it("returns original order when move is out of bounds", () => {
    const splits = [
      { accountId: "acct-a", amount: "1" },
      { accountId: "acct-b", amount: "2" },
    ];
    expect(
      moveInlineSplitDraft({
        direction: "up",
        splitIndex: 0,
        splits,
      }),
    ).toEqual(splits);
    expect(
      moveInlineSplitDraft({
        direction: "down",
        splitIndex: 1,
        splits,
      }),
    ).toEqual(splits);
  });
});

describe("getSplitReorderKeyAction", () => {
  it("requires alt modifier for reorder actions", () => {
    expect(
      getSplitReorderKeyAction({
        altKey: false,
        key: "ArrowUp",
        splitCount: 3,
        splitIndex: 1,
      }),
    ).toEqual({ type: "none" });
  });

  it("returns move up and move down actions in bounds", () => {
    expect(
      getSplitReorderKeyAction({
        altKey: true,
        key: "ArrowUp",
        splitCount: 3,
        splitIndex: 1,
      }),
    ).toEqual({ nextIndex: 0, type: "move-up" });
    expect(
      getSplitReorderKeyAction({
        altKey: true,
        key: "ArrowDown",
        splitCount: 3,
        splitIndex: 1,
      }),
    ).toEqual({ nextIndex: 2, type: "move-down" });
  });

  it("returns none when attempted reorder is out of bounds", () => {
    expect(
      getSplitReorderKeyAction({
        altKey: true,
        key: "ArrowUp",
        splitCount: 3,
        splitIndex: 0,
      }),
    ).toEqual({ type: "none" });
    expect(
      getSplitReorderKeyAction({
        altKey: true,
        key: "ArrowDown",
        splitCount: 3,
        splitIndex: 2,
      }),
    ).toEqual({ type: "none" });
  });
});

describe("inline split account guidance", () => {
  it("classifies account resolution states", () => {
    expect(
      getInlineSplitAccountResolution({
        accountId: "",
        accountQuery: "",
      }),
    ).toBe("empty");
    expect(
      getInlineSplitAccountResolution({
        accountId: "acct-checking",
        accountQuery: "Checking",
      }),
    ).toBe("resolved");
    expect(
      getInlineSplitAccountResolution({
        accountId: "",
        accountQuery: "checki",
      }),
    ).toBe("unresolved");
  });

  it("returns guidance for empty, single-match, multi-match, and no-match states", () => {
    expect(
      getInlineSplitAccountGuidance({
        accountQuery: "",
        matchCount: 0,
      }),
    ).toBe("Search by account name, code, or id.");
    expect(
      getInlineSplitAccountGuidance({
        accountQuery: "checking",
        matchCount: 1,
      }),
    ).toBe("Press Enter to choose the highlighted account.");
    expect(
      getInlineSplitAccountGuidance({
        accountQuery: "cash",
        matchCount: 3,
      }),
    ).toBe("Use Arrow Up/Down, then Enter, to choose an existing account.");
    expect(
      getInlineSplitAccountGuidance({
        accountQuery: "missing",
        matchCount: 0,
      }),
    ).toBe("No exact match. Pick an existing account from the chart.");
  });
});

describe("getInlineSplitAccountApplyKeyAction", () => {
  it("applies first match on tab when matches are available", () => {
    expect(
      getInlineSplitAccountApplyKeyAction({
        ctrlKey: false,
        key: "Tab",
        matchCount: 2,
      }),
    ).toEqual({ type: "apply-first-match" });
  });

  it("applies first match on ctrl+enter when matches are available", () => {
    expect(
      getInlineSplitAccountApplyKeyAction({
        ctrlKey: true,
        key: "Enter",
        matchCount: 1,
      }),
    ).toEqual({ type: "apply-first-match" });
  });

  it("returns none when there are no matches or unsupported keys", () => {
    expect(
      getInlineSplitAccountApplyKeyAction({
        ctrlKey: false,
        key: "Tab",
        matchCount: 0,
      }),
    ).toEqual({ type: "none" });
    expect(
      getInlineSplitAccountApplyKeyAction({
        ctrlKey: false,
        key: "Enter",
        matchCount: 3,
      }),
    ).toEqual({ type: "none" });
  });
});

describe("getLedgerRegisterTabHotkeyAction", () => {
  it("activates adjacent tabs with primary+shift bracket hotkeys", () => {
    expect(
      getLedgerRegisterTabHotkeyAction({
        activeTabIndex: 1,
        ctrlKey: true,
        key: "]",
        metaKey: false,
        shiftKey: true,
        tabCount: 3,
      }),
    ).toEqual({ type: "activate-next-tab" });
    expect(
      getLedgerRegisterTabHotkeyAction({
        activeTabIndex: 1,
        ctrlKey: false,
        key: "[",
        metaKey: true,
        shiftKey: true,
        tabCount: 3,
      }),
    ).toEqual({ type: "activate-previous-tab" });
  });

  it("moves tabs with primary+shift arrow hotkeys", () => {
    expect(
      getLedgerRegisterTabHotkeyAction({
        activeTabIndex: 1,
        ctrlKey: true,
        key: "ArrowRight",
        metaKey: false,
        shiftKey: true,
        tabCount: 3,
      }),
    ).toEqual({ type: "move-tab-right" });
    expect(
      getLedgerRegisterTabHotkeyAction({
        activeTabIndex: 1,
        ctrlKey: true,
        key: "ArrowLeft",
        metaKey: false,
        shiftKey: true,
        tabCount: 3,
      }),
    ).toEqual({ type: "move-tab-left" });
  });

  it("returns close action for primary+shift backspace", () => {
    expect(
      getLedgerRegisterTabHotkeyAction({
        activeTabIndex: 1,
        ctrlKey: true,
        key: "Backspace",
        metaKey: false,
        shiftKey: true,
        tabCount: 3,
      }),
    ).toEqual({ type: "close-tab" });
  });

  it("returns none for unsupported combinations and edges", () => {
    expect(
      getLedgerRegisterTabHotkeyAction({
        activeTabIndex: 0,
        ctrlKey: false,
        key: "]",
        metaKey: false,
        shiftKey: true,
        tabCount: 3,
      }),
    ).toEqual({ type: "none" });
    expect(
      getLedgerRegisterTabHotkeyAction({
        activeTabIndex: 0,
        ctrlKey: true,
        key: "[",
        metaKey: false,
        shiftKey: true,
        tabCount: 3,
      }),
    ).toEqual({ type: "none" });
  });
});
