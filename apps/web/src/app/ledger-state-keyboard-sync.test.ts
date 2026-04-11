import { afterEach, describe, expect, it, vi } from "vitest";
import type { LedgerTransactionDetail } from "./shell";

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

describe("useLedgerKeyboardAndSelectionSync", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("begins inline edit on e for the selected transaction", async () => {
    const useEffectCleanupCallbacks: Array<() => void> = [];
    const useEffectMock = vi.fn((callback: () => void | (() => void)) => {
      const cleanup = callback();
      if (typeof cleanup === "function") {
        useEffectCleanupCallbacks.push(cleanup);
      }
    });

    vi.doMock("react", async () => {
      const actual = await vi.importActual<typeof import("react")>("react");
      return {
        ...actual,
        useEffect: useEffectMock,
      };
    });

    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal("window", {
      addEventListener,
      removeEventListener,
    });

    const { useLedgerKeyboardAndSelectionSync } = await import("./ledger-state");
    const transaction = createTransaction("txn-1");
    const onBeginInlineEdit = vi.fn();
    const setSelectedLedgerTransactionId = vi.fn();
    const focusSearch = vi.fn();

    useLedgerKeyboardAndSelectionSync({
      activeView: "ledger",
      filteredTransactions: [transaction],
      ledgerSearchInputRef: { current: { focus: focusSearch } as unknown as HTMLInputElement },
      onBeginInlineEdit,
      selectedLedgerTransactionId: transaction.id,
      setSelectedLedgerTransactionId,
    });

    expect(addEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
    const onKeydown = addEventListener.mock.calls[0]?.[1] as
      | ((event: KeyboardEvent) => void)
      | undefined;
    expect(onKeydown).toBeDefined();

    const preventDefault = vi.fn();
    onKeydown?.({
      key: "e",
      preventDefault,
      target: { tagName: "DIV" } as unknown as EventTarget,
    } as unknown as KeyboardEvent);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onBeginInlineEdit).toHaveBeenCalledWith(transaction);
    expect(setSelectedLedgerTransactionId).not.toHaveBeenCalled();

    useEffectCleanupCallbacks.forEach((callback) => callback());
    expect(removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
  });
});
