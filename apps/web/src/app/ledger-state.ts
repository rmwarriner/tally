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

export function getLedgerHotkeySelectionUpdate(input: {
  eventKey: string;
  filteredTransactions: ReturnType<typeof createLedgerWorkspaceModel>["filteredTransactions"];
  selectedLedgerTransactionId: string | null;
  target: EventTarget | null;
}): {
  handled: boolean;
  focusSearch: boolean;
  nextSelectedLedgerTransactionId: string | null;
} {
  if (!shouldHandleLedgerHotkey(input.target)) {
    return {
      handled: false,
      focusSearch: false,
      nextSelectedLedgerTransactionId: input.selectedLedgerTransactionId,
    };
  }

  if (input.eventKey === "/") {
    return {
      handled: true,
      focusSearch: true,
      nextSelectedLedgerTransactionId: input.selectedLedgerTransactionId,
    };
  }

  if (input.eventKey === "Escape") {
    return {
      handled: true,
      focusSearch: false,
      nextSelectedLedgerTransactionId: null,
    };
  }

  if (input.eventKey === "ArrowDown" || input.eventKey === "j") {
    return {
      handled: true,
      focusSearch: false,
      nextSelectedLedgerTransactionId: getNextLedgerTransactionId({
        direction: "next",
        selectedTransactionId: input.selectedLedgerTransactionId,
        transactions: input.filteredTransactions,
      }),
    };
  }

  if (input.eventKey === "ArrowUp" || input.eventKey === "k") {
    return {
      handled: true,
      focusSearch: false,
      nextSelectedLedgerTransactionId: getNextLedgerTransactionId({
        direction: "previous",
        selectedTransactionId: input.selectedLedgerTransactionId,
        transactions: input.filteredTransactions,
      }),
    };
  }

  return {
    handled: false,
    focusSearch: false,
    nextSelectedLedgerTransactionId: input.selectedLedgerTransactionId,
  };
}

export function getSyncedLedgerSelectionId(input: {
  filteredTransactions: ReturnType<typeof createLedgerWorkspaceModel>["filteredTransactions"];
  selectedLedgerTransactionId: string | null;
}): string | null {
  if (!input.selectedLedgerTransactionId) {
    return input.selectedLedgerTransactionId;
  }

  const selectedStillVisible = input.filteredTransactions.some(
    (transaction) => transaction.id === input.selectedLedgerTransactionId,
  );

  if (selectedStillVisible) {
    return input.selectedLedgerTransactionId;
  }

  return input.filteredTransactions[0]?.id ?? null;
}

export function useLedgerKeyboardAndSelectionSync(input: UseLedgerKeyboardAndSelectionSyncInput) {
  useEffect(() => {
    if (input.activeView !== "ledger") {
      return;
    }

    function handleKeydown(event: KeyboardEvent) {
      const hotkeyUpdate = getLedgerHotkeySelectionUpdate({
        eventKey: event.key,
        filteredTransactions: input.filteredTransactions,
        selectedLedgerTransactionId: input.selectedLedgerTransactionId,
        target: event.target,
      });

      if (!hotkeyUpdate.handled) {
        return;
      }

      event.preventDefault();

      if (hotkeyUpdate.focusSearch) {
        input.ledgerSearchInputRef.current?.focus();
        return;
      }

      input.setSelectedLedgerTransactionId(hotkeyUpdate.nextSelectedLedgerTransactionId);
    }

    window.addEventListener("keydown", handleKeydown);

    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [input.activeView, input.filteredTransactions, input.ledgerSearchInputRef, input.setSelectedLedgerTransactionId]);

  useEffect(() => {
    const syncedSelectionId = getSyncedLedgerSelectionId({
      filteredTransactions: input.filteredTransactions,
      selectedLedgerTransactionId: input.selectedLedgerTransactionId,
    });

    if (syncedSelectionId !== input.selectedLedgerTransactionId) {
      input.setSelectedLedgerTransactionId(syncedSelectionId);
    }
  }, [
    input.filteredTransactions,
    input.selectedLedgerTransactionId,
    input.setSelectedLedgerTransactionId,
  ]);
}
