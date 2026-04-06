import { describe, expect, it } from "vitest";
import type { LedgerTransactionDetail } from "./shell";
import { getLedgerHotkeySelectionUpdate, getSyncedLedgerSelectionId } from "./ledger-state";

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
