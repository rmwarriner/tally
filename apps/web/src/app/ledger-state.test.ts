import { describe, expect, it } from "vitest";
import type { LedgerTransactionDetail } from "./shell";
import {
  createLedgerInlineRowEditDraft,
  getSplitQuickEditKeyAction,
  getLedgerHotkeySelectionUpdate,
  getSyncedLedgerSelectionId,
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

  it("returns focus intent for slash hotkey", () => {
    expect(
      getLedgerHotkeySelectionUpdate({
        eventKey: "/",
        filteredTransactions: transactions,
        selectedLedgerTransactionId: "txn-1",
        target: { tagName: "DIV" } as unknown as EventTarget,
      }),
    ).toEqual({
      handled: true,
      focusSearch: true,
      nextSelectedLedgerTransactionId: "txn-1",
    });
  });

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
      focusSearch: false,
      nextSelectedLedgerTransactionId: "txn-2",
    });
  });

  it("ignores hotkeys while target is an input field", () => {
    expect(
      getLedgerHotkeySelectionUpdate({
        eventKey: "j",
        filteredTransactions: transactions,
        selectedLedgerTransactionId: "txn-1",
        target: { tagName: "INPUT" } as unknown as EventTarget,
      }),
    ).toEqual({
      handled: false,
      focusSearch: false,
      nextSelectedLedgerTransactionId: "txn-1",
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
        description: "Groceries",
        occurredOn: "2026-04-01",
        payee: null,
      }),
    ).toEqual({
      description: "Groceries",
      occurredOn: "2026-04-01",
      payee: "",
    });
  });

  it("updates a single field without mutating other draft fields", () => {
    expect(
      updateLedgerInlineRowEditDraft({
        draft: {
          description: "Groceries",
          occurredOn: "2026-04-01",
          payee: "",
        },
        field: "description",
        value: "Market groceries",
      }),
    ).toEqual({
      description: "Market groceries",
      occurredOn: "2026-04-01",
      payee: "",
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
});
