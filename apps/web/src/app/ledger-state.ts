import { useEffect, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import {
  createLedgerWorkspaceModel,
  getNextLedgerTransactionId,
  shouldHandleLedgerHotkey,
  type WorkspaceView,
} from "./shell";

interface LedgerRange {
  from: string;
  to: string;
}

interface UseLedgerFiltersAndSelectionInput {
  initialRange: LedgerRange;
}

export function useLedgerFiltersAndSelection(input: UseLedgerFiltersAndSelectionInput) {
  const [ledgerSearchText, setLedgerSearchText] = useState("");
  const [ledgerRange, setLedgerRange] = useState(input.initialRange);
  const [selectedLedgerAccountId, setSelectedLedgerAccountId] = useState<string | null>(null);
  const [selectedLedgerTransactionId, setSelectedLedgerTransactionId] = useState<string | null>(null);

  return {
    ledgerRange,
    ledgerSearchText,
    selectedLedgerAccountId,
    selectedLedgerTransactionId,
    setLedgerRange,
    setLedgerSearchText,
    setSelectedLedgerAccountId,
    setSelectedLedgerTransactionId,
  };
}

interface UseLedgerKeyboardAndSelectionSyncInput {
  activeView: WorkspaceView;
  filteredTransactions: ReturnType<typeof createLedgerWorkspaceModel>["filteredTransactions"];
  ledgerSearchInputRef: RefObject<HTMLInputElement | null>;
  selectedLedgerTransactionId: string | null;
  setSelectedLedgerTransactionId: Dispatch<SetStateAction<string | null>>;
}

export function useLedgerKeyboardAndSelectionSync(input: UseLedgerKeyboardAndSelectionSyncInput) {
  useEffect(() => {
    if (input.activeView !== "ledger") {
      return;
    }

    function handleKeydown(event: KeyboardEvent) {
      if (!shouldHandleLedgerHotkey(event.target)) {
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        input.ledgerSearchInputRef.current?.focus();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        input.setSelectedLedgerTransactionId(null);
        return;
      }

      if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        input.setSelectedLedgerTransactionId((current) =>
          getNextLedgerTransactionId({
            direction: "next",
            selectedTransactionId: current,
            transactions: input.filteredTransactions,
          }),
        );
        return;
      }

      if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        input.setSelectedLedgerTransactionId((current) =>
          getNextLedgerTransactionId({
            direction: "previous",
            selectedTransactionId: current,
            transactions: input.filteredTransactions,
          }),
        );
      }
    }

    window.addEventListener("keydown", handleKeydown);

    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [input.activeView, input.filteredTransactions, input.ledgerSearchInputRef, input.setSelectedLedgerTransactionId]);

  useEffect(() => {
    if (
      input.selectedLedgerTransactionId &&
      !input.filteredTransactions.some((transaction) => transaction.id === input.selectedLedgerTransactionId)
    ) {
      input.setSelectedLedgerTransactionId(input.filteredTransactions[0]?.id ?? null);
    }
  }, [
    input.filteredTransactions,
    input.selectedLedgerTransactionId,
    input.setSelectedLedgerTransactionId,
  ]);
}
