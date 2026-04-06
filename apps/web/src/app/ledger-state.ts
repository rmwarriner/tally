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

export type SplitQuickEditField = "memo" | "amount" | "cleared";

export function moveInlineSplitDraft<T>(input: {
  direction: "up" | "down";
  splitIndex: number;
  splits: T[];
}): T[] {
  if (input.splits.length < 2) {
    return input.splits;
  }

  const nextIndex = input.direction === "up" ? input.splitIndex - 1 : input.splitIndex + 1;
  if (nextIndex < 0 || nextIndex >= input.splits.length) {
    return input.splits;
  }

  const nextSplits = [...input.splits];
  const candidate = nextSplits[input.splitIndex];
  nextSplits[input.splitIndex] = nextSplits[nextIndex];
  nextSplits[nextIndex] = candidate;
  return nextSplits;
}

export function getSplitReorderKeyAction(input: {
  altKey: boolean;
  key: string;
  splitCount: number;
  splitIndex: number;
}):
  | { type: "none" }
  | { nextIndex: number; type: "move-up" }
  | { nextIndex: number; type: "move-down" } {
  if (!input.altKey) {
    return { type: "none" };
  }

  if (input.key === "ArrowUp" && input.splitIndex > 0) {
    return { nextIndex: input.splitIndex - 1, type: "move-up" };
  }

  if (input.key === "ArrowDown" && input.splitIndex + 1 < input.splitCount) {
    return { nextIndex: input.splitIndex + 1, type: "move-down" };
  }

  return { type: "none" };
}

export interface InlineLedgerSplitDraft {
  accountId: string;
  amount: string;
}

export interface InlineLedgerSplitValidation {
  allAccountsValid: boolean;
  allAmountsValid: boolean;
  canSave: boolean;
  hasMinimumRows: boolean;
  isBalanced: boolean;
  parsedAmounts: number[];
}

export type InlineSplitAccountResolution = "empty" | "resolved" | "unresolved";

export function getInlineSplitAccountResolution(input: {
  accountId: string;
  accountQuery: string;
}): InlineSplitAccountResolution {
  if (input.accountQuery.trim().length === 0) {
    return "empty";
  }

  if (input.accountId.trim().length > 0) {
    return "resolved";
  }

  return "unresolved";
}

export function getInlineSplitAccountGuidance(input: {
  accountQuery: string;
  matchCount: number;
}): string {
  if (input.accountQuery.trim().length === 0) {
    return "Search by account name, code, or id.";
  }

  if (input.matchCount === 0) {
    return "No exact match. Pick an existing account from the chart.";
  }

  if (input.matchCount === 1) {
    return "Press Enter to choose the highlighted account.";
  }

  return "Use Arrow Up/Down, then Enter, to choose an existing account.";
}

export function validateInlineLedgerSplitDrafts(input: {
  splits: InlineLedgerSplitDraft[];
}): InlineLedgerSplitValidation {
  const hasMinimumRows = input.splits.length >= 2;
  const allAccountsValid = input.splits.every((split) => split.accountId.trim().length > 0);
  const parsedAmounts = input.splits.map((split) => Number.parseFloat(split.amount));
  const allAmountsValid = parsedAmounts.every((amount) => Number.isFinite(amount));
  const splitBalance = allAmountsValid ? parsedAmounts.reduce((sum, amount) => sum + amount, 0) : NaN;
  const isBalanced = allAmountsValid && Math.abs(splitBalance) <= 0.000001;

  return {
    allAccountsValid,
    allAmountsValid,
    canSave: hasMinimumRows && allAccountsValid && allAmountsValid && isBalanced,
    hasMinimumRows,
    isBalanced,
    parsedAmounts,
  };
}

export function getSplitQuickEditKeyAction(input: {
  field: SplitQuickEditField;
  key: string;
  splitCount: number;
  splitIndex: number;
}):
  | { type: "none" }
  | { type: "cancel" }
  | { splitIndex: number; type: "focus-amount" }
  | { splitIndex: number; type: "focus-memo" }
  | { splitIndex: number; type: "focus-cleared" }
  | { type: "focus-save" } {
  if (input.key === "Escape") {
    return { type: "cancel" };
  }

  if (input.key !== "Enter") {
    return { type: "none" };
  }

  if (input.field === "memo") {
    return { splitIndex: input.splitIndex, type: "focus-amount" };
  }

  if (input.field === "amount") {
    return { splitIndex: input.splitIndex, type: "focus-cleared" };
  }

  const nextMemoSplitIndex = input.splitIndex + 1;
  if (nextMemoSplitIndex < input.splitCount) {
    return { splitIndex: nextMemoSplitIndex, type: "focus-memo" };
  }

  return { type: "focus-save" };
}

interface UseLedgerFiltersAndSelectionInput {
  initialRange: LedgerRange;
}

export interface LedgerInlineRowEditDraft {
  description: string;
  occurredOn: string;
  payee: string;
}

export function createLedgerInlineRowEditDraft(input: {
  description: string;
  occurredOn: string;
  payee: string | null;
}): LedgerInlineRowEditDraft {
  return {
    description: input.description,
    occurredOn: input.occurredOn,
    payee: input.payee ?? "",
  };
}

export function updateLedgerInlineRowEditDraft(input: {
  draft: LedgerInlineRowEditDraft;
  field: keyof LedgerInlineRowEditDraft;
  value: string;
}): LedgerInlineRowEditDraft {
  return {
    ...input.draft,
    [input.field]: input.value,
  };
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

export function useLedgerInlineRowEditState() {
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<LedgerInlineRowEditDraft | null>(null);

  function startInlineEdit(input: {
    description: string;
    occurredOn: string;
    payee: string | null;
    transactionId: string;
  }) {
    setEditingTransactionId(input.transactionId);
    setEditingDraft(createLedgerInlineRowEditDraft(input));
  }

  function cancelInlineEdit() {
    setEditingTransactionId(null);
    setEditingDraft(null);
  }

  function finishInlineEdit() {
    setEditingTransactionId(null);
    setEditingDraft(null);
  }

  function setInlineDraftField(field: keyof LedgerInlineRowEditDraft, value: string) {
    setEditingDraft((current) => {
      if (!current) {
        return current;
      }

      return updateLedgerInlineRowEditDraft({
        draft: current,
        field,
        value,
      });
    });
  }

  return {
    cancelInlineEdit,
    editingDraft,
    editingTransactionId,
    finishInlineEdit,
    setInlineDraftField,
    startInlineEdit,
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
