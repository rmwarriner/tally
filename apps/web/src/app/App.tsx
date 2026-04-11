import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  deleteTransaction,
  postBaselineBudgetLine,
  postAccount,
  postCsvImport,
  postEnvelope,
  postEnvelopeAllocation,
  postScheduledTransaction,
  postTransaction,
  putTransaction,
} from "./api";
import {
  findAccountSearchExactMatch,
  createReconciliationBookModel,
  createLedgerBookModel,
  createOverviewCards,
  getPostingBalanceSummary,
  getBookViewDefinition,
  movePostingIndex,
  shouldHandleLedgerHotkey,
  type PostingFocusField,
  type BookView,
} from "./shell";
import {
  getLedgerRegisterTabHotkeyAction,
  useLedgerInlineRowEditState,
  useLedgerKeyboardAndSelectionSync,
  validateInlineLedgerSplitDrafts,
} from "./ledger-state";
import { LedgerMainPanels } from "./LedgerMainPanels";
import { LedgerTransactionEditorPanel } from "./LedgerTransactionEditorPanel";
import { NonLedgerMainPanels } from "./NonLedgerMainPanels";
import { ShellInspectorContent } from "./ShellSidePanels";
import { APRIL_RANGE, BOOK_ID } from "./app-constants";
import {
  createTransactionId,
  createEntityId,
  formatAccountOptionLabel,
  formatCurrency,
  formatPeriodLabel,
  formatTransactionStatus,
  parsePeriodExpression,
  parseCsvRows,
} from "./app-format";
import {
  canSaveCoaAccountDraft,
  createCoaAccountDraft,
  type CoaAccountDraft,
} from "./coa-account-form";
import {
  createTransactionEditorState,
  type TransactionEditorState,
  validateTransactionEditorState,
} from "./transaction-editor";
import {
  useBookRuntime,
  clearStoredAccountId,
  readStoredAccountId,
  resolveInitialLedgerAccountId,
  writeStoredAccountId,
} from "./use-book-runtime";
import { useNonLedgerFormState } from "./non-ledger-state";
import { usePreferences } from "./use-preferences";
import { ShellTopbar } from "./ShellTopbar";
import { ShellActivityBar } from "./ShellActivityBar";
import { CoaSidebar } from "./CoaSidebar";
import { ShellStatusBar } from "./ShellStatusBar";
import type { AccountType } from "@tally/domain";
import "../app/styles.css";

function ShellState(props: { message: string; title: string }) {
  return (
    <main className="shell-state">
      <h1>{props.title}</h1>
      <p>{props.message}</p>
    </main>
  );
}

function getAccountSideAmountForTransaction(input: {
  selectedAccountId: string | null;
  transaction: {
    postings: Array<{
      accountId: string;
      amount: number;
    }>;
  };
}): number {
  if (!input.selectedAccountId) {
    return 0;
  }

  return input.transaction.postings.reduce((sum, posting) => {
    if (posting.accountId !== input.selectedAccountId) {
      return sum;
    }
    return sum + posting.amount;
  }, 0);
}

interface LedgerRegisterTabState {
  id: string;
  ledgerSearchText: string;
  ledgerStatusFilter: "all" | "cleared" | "open" | "reconciled";
  selectedLedgerAccountId: string | null;
  selectedLedgerTransactionId: string | null;
}

const COA_ACCOUNT_TYPES: AccountType[] = ["asset", "liability", "income", "expense", "equity"];

export function App() {
  const [activeView, setActiveView] = useState<BookView>("ledger");
  const [currentPeriod, setCurrentPeriod] = useState(APRIL_RANGE);
  const [isPeriodInputOpen, setIsPeriodInputOpen] = useState(false);
  const [isLedgerDetailOpen, setIsLedgerDetailOpen] = useState(false);
  const [isLedgerOperationsOpen, setIsLedgerOperationsOpen] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [coaAccountDraft, setCoaAccountDraft] = useState<CoaAccountDraft | null>(null);
  const [transactionEditor, setTransactionEditor] = useState<TransactionEditorState | null>(null);
  const [activePostingAccountSearchIndex, setActivePostingAccountSearchIndex] = useState<number | null>(
    null,
  );
  const [highlightedPostingAccountMatchIndex, setHighlightedPostingAccountMatchIndex] = useState(0);
  const [pendingPostingFocusTarget, setPendingPostingFocusTarget] = useState<{
    field: PostingFocusField;
    focusIndex: number;
  } | null>(null);
  const ledgerSearchInputRef = useRef<HTMLInputElement | null>(null);
  const postingAccountInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const postingAmountInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const postingMemoInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const initializedBookIdRef = useRef<string | null>(null);

  const {
    budgetLineForm,
    csvForm,
    envelopeAllocationForm,
    envelopeForm,
    reconciliationForm,
    scheduleForm,
    selectedReconciliationTransactionIds,
    setBudgetLineForm,
    setCsvForm,
    setEnvelopeAllocationForm,
    setEnvelopeForm,
    setReconciliationForm,
    setScheduleForm,
    setSelectedReconciliationTransactionIds,
  } = useNonLedgerFormState();
  const [ledgerRegisterTabs, setLedgerRegisterTabs] = useState<LedgerRegisterTabState[]>([
    {
      id: "tab-all",
      ledgerSearchText: "",
      ledgerStatusFilter: "all",
      selectedLedgerAccountId: null,
      selectedLedgerTransactionId: null,
    },
  ]);
  const [activeLedgerRegisterTabId, setActiveLedgerRegisterTabId] = useState("tab-all");
  const { preferences, setAmountStyle, setDensity, setTheme } = usePreferences();
  const activeLedgerRegisterTab =
    ledgerRegisterTabs.find((tab) => tab.id === activeLedgerRegisterTabId) ?? ledgerRegisterTabs[0];
  const activeLedgerRegisterTabIndex = Math.max(
    0,
    ledgerRegisterTabs.findIndex((tab) => tab.id === activeLedgerRegisterTabId),
  );
  const ledgerSearchText = activeLedgerRegisterTab?.ledgerSearchText ?? "";
  const ledgerStatusFilter = activeLedgerRegisterTab?.ledgerStatusFilter ?? "all";
  const selectedLedgerAccountId = activeLedgerRegisterTab?.selectedLedgerAccountId ?? null;
  const selectedLedgerTransactionId = activeLedgerRegisterTab?.selectedLedgerTransactionId ?? null;
  const {
    cancelInlineEdit,
    editingDraft: inlineEditDraft,
    editingTransactionId: inlineEditingTransactionId,
    finishInlineEdit,
    setInlineDraftField,
    startInlineEdit,
  } = useLedgerInlineRowEditState();
  const { activeBookId, book, busy, dashboard, error, loading, runMutation } =
    useBookRuntime({
      range: currentPeriod,
      bookId: BOOK_ID,
    });

  const loadedBook = book;
  const loadedDashboard = dashboard;
  const bookAccounts = loadedBook?.accounts ?? [];
  const bookEnvelopes = loadedBook?.envelopes ?? [];
  const bookSchedules = loadedBook?.scheduledTransactions ?? [];
  const bookTransactions = loadedBook?.transactions ?? [];
  const expenseAccounts = bookAccounts.filter((account) => account.type === "expense");
  const liquidAccounts = bookAccounts.filter(
    (account) => account.type === "asset" || account.type === "liability",
  );
  const fundingAccounts = bookAccounts.filter((account) => account.type === "asset");
  const currentPeriodLabel = formatPeriodLabel(currentPeriod.from);
  const apiStatus = loading ? "unknown" : error ? "offline" : "online";
  const {
    budgetSnapshot: baselineSnapshot = [],
    envelopeSnapshot = [],
    accountBalances = [],
    netWorth = {
      commodityCode: "USD",
      quantity: 0,
    },
    dueTransactions = [],
    budgetErrors: budgetConfigurationErrors = [],
    ledgerErrors: ledgerValidationErrors = [],
  } = loadedDashboard ?? {};

  const overviewCards = createOverviewCards({
    accountBalanceCount: accountBalances.length,
    budgetIssueCount: budgetConfigurationErrors.length,
    dueTransactionCount: dueTransactions.length,
    envelopeCount: bookEnvelopes.length,
    ledgerIssueCount: ledgerValidationErrors.length,
  });

  const recentTransactions = [...bookTransactions]
    .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn))
    .slice(0, 6);
  const topBudgetVarianceRows = [...baselineSnapshot]
    .sort((left, right) => Math.abs(right.variance.quantity) - Math.abs(left.variance.quantity))
    .slice(0, 4);
  const nextScheduledTransactions = [...bookSchedules]
    .sort((left, right) => left.nextDueOn.localeCompare(right.nextDueOn))
    .slice(0, 5);
  const selectedTransactionRecord =
    bookTransactions.find((transaction) => transaction.id === selectedLedgerTransactionId) ?? null;
  const ledgerBook = loadedBook
      ? createLedgerBookModel({
        accountBalances,
        rangeEnd: currentPeriod.to,
        rangeStart: currentPeriod.from,
        searchText: ledgerSearchText,
        statusFilter: ledgerStatusFilter,
        selectedAccountId: selectedLedgerAccountId,
        selectedTransactionId: selectedLedgerTransactionId,
        book: loadedBook,
      })
    : {
        availableAccounts: [],
        filteredBalances: [],
        filteredTransactions: [],
        isFiltered: false,
        openingBalance: 0,
        selectedAccountBalance: null,
        selectedAccount: null,
        selectedTransaction: null,
        totalCount: 0,
      };
  const filteredTotal = ledgerBook.filteredTransactions.reduce((sum, transaction) => {
    return (
      sum +
      getAccountSideAmountForTransaction({
        selectedAccountId: selectedLedgerAccountId,
        transaction,
      })
    );
  }, 0);
  const runningBalance = ledgerBook.openingBalance + filteredTotal;
  const registerStatus =
    selectedLedgerAccountId === null
      ? ledgerBook.isFiltered
        ? `showing ${ledgerBook.filteredTransactions.length} of ${ledgerBook.totalCount} · select an account to see filtered total`
        : `${ledgerBook.filteredTransactions.length} transactions · select an account to see balance`
      : ledgerBook.isFiltered
        ? `showing ${ledgerBook.filteredTransactions.length} of ${ledgerBook.totalCount} · filtered total ${formatCurrency(filteredTotal)}`
        : `${ledgerBook.filteredTransactions.length} transactions · balance ${formatCurrency(runningBalance)}`;
  const canSaveNewCoaAccount = coaAccountDraft ? canSaveCoaAccountDraft(coaAccountDraft) : false;
  const reconciliationBook = loadedBook
    ? createReconciliationBookModel({
        selectedAccountId: reconciliationForm.accountId,
        selectedTransactionIds: selectedReconciliationTransactionIds,
        statementBalanceText: reconciliationForm.statementBalance,
        statementDate: reconciliationForm.statementDate,
        book: loadedBook,
      })
    : {
        candidateTransactions: [],
        clearedTotal: 0,
        difference: null,
        latestSession: undefined,
        selectedAccount: null,
        statementBalance: null,
      };
  const transactionEditorErrors = transactionEditor ? validateTransactionEditorState(transactionEditor) : [];
  const postingBalanceSummary = transactionEditor
    ? getPostingBalanceSummary(transactionEditor.postings.map((posting) => posting.amount))
    : {
        balance: null,
        defaultAmount: "0",
        isBalanced: false,
      };
  useLedgerKeyboardAndSelectionSync({
    activeView,
    filteredTransactions: ledgerBook.filteredTransactions,
    ledgerSearchInputRef,
    onBeginInlineEdit: (transaction) =>
      startInlineEdit({
        description: transaction.description,
        occurredOn: transaction.occurredOn,
        payee: transaction.payee,
        transactionId: transaction.id,
      }),
    selectedLedgerTransactionId,
    setSelectedLedgerTransactionId: (nextValue) => {
      setLedgerRegisterTabs((currentTabs) =>
        currentTabs.map((tab) => {
          if (tab.id !== activeLedgerRegisterTabId) {
            return tab;
          }

          const resolvedValue =
            typeof nextValue === "function"
              ? nextValue(tab.selectedLedgerTransactionId)
              : nextValue;
          return {
            ...tab,
            selectedLedgerTransactionId: resolvedValue,
          };
        }),
      );
    },
  });

  useEffect(() => {
    if (!loadedBook) {
      return;
    }

    if (initializedBookIdRef.current === activeBookId) {
      return;
    }

    const resolvedAccountId = resolveInitialLedgerAccountId({
      accounts: loadedBook.accounts,
      storedAccountId: readStoredAccountId(),
    });
    setActiveView("ledger");
    setLedgerRegisterTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.id === activeLedgerRegisterTabId
          ? {
              ...tab,
              selectedLedgerAccountId: resolvedAccountId,
              selectedLedgerTransactionId: null,
            }
          : tab,
      ),
    );
    initializedBookIdRef.current = activeBookId;
  }, [activeBookId, activeLedgerRegisterTabId, loadedBook]);

  useEffect(() => {
    if (selectedLedgerAccountId) {
      writeStoredAccountId(selectedLedgerAccountId);
      return;
    }

    clearStoredAccountId();
  }, [selectedLedgerAccountId]);

  useEffect(() => {
    if (activeView !== "ledger") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const action = getLedgerRegisterTabHotkeyAction({
        activeTabIndex: activeLedgerRegisterTabIndex,
        ctrlKey: event.ctrlKey,
        key: event.key,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        tabCount: ledgerRegisterTabs.length,
      });
      if (action.type === "none") {
        return;
      }

      event.preventDefault();

      if (action.type === "activate-next-tab") {
        const nextTab = ledgerRegisterTabs[activeLedgerRegisterTabIndex + 1];
        if (nextTab) {
          setActiveLedgerRegisterTabId(nextTab.id);
        }
        return;
      }

      if (action.type === "activate-previous-tab") {
        const previousTab = ledgerRegisterTabs[activeLedgerRegisterTabIndex - 1];
        if (previousTab) {
          setActiveLedgerRegisterTabId(previousTab.id);
        }
        return;
      }

      if (action.type === "move-tab-left") {
        const activeTab = ledgerRegisterTabs[activeLedgerRegisterTabIndex];
        if (activeTab) {
          moveLedgerRegisterTab("left", activeTab.id);
        }
        return;
      }

      if (action.type === "move-tab-right") {
        const activeTab = ledgerRegisterTabs[activeLedgerRegisterTabIndex];
        if (activeTab) {
          moveLedgerRegisterTab("right", activeTab.id);
        }
        return;
      }

      const activeTab = ledgerRegisterTabs[activeLedgerRegisterTabIndex];
      if (activeTab && activeTab.id !== "tab-all") {
        closeLedgerRegisterTab(activeTab.id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    activeLedgerRegisterTabIndex,
    activeView,
    ledgerRegisterTabs,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key.toLowerCase() === "i" &&
        shouldHandleLedgerHotkey(event.target)
      ) {
        event.preventDefault();
        setIsInspectorOpen((current) => !current);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsCommandPaletteOpen((current) => !current);
        return;
      }

      if (event.key === "Escape") {
        setIsCommandPaletteOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    cancelInlineEdit();
    setActivePostingAccountSearchIndex(null);
  }, [activeLedgerRegisterTabId, cancelInlineEdit]);

  useEffect(() => {
    if (!loadedBook) {
      return;
    }

    if (!selectedTransactionRecord) {
      setTransactionEditor(null);
      setActivePostingAccountSearchIndex(null);
      return;
    }

    setTransactionEditor((current) => {
      if (current?.transactionId === selectedTransactionRecord.id) {
        return current;
      }

      return createTransactionEditorState(selectedTransactionRecord, bookAccounts);
    });
  }, [selectedTransactionRecord, bookAccounts]);

  useEffect(() => {
    if (!inlineEditingTransactionId) {
      return;
    }

    const editedRowStillVisible = ledgerBook.filteredTransactions.some(
      (transaction) => transaction.id === inlineEditingTransactionId,
    );

    if (!editedRowStillVisible) {
      cancelInlineEdit();
    }
  }, [cancelInlineEdit, inlineEditingTransactionId, ledgerBook.filteredTransactions]);

  useEffect(() => {
    if (!pendingPostingFocusTarget) {
      return;
    }

    const refsByField = {
      account: postingAccountInputRefs.current,
      amount: postingAmountInputRefs.current,
      memo: postingMemoInputRefs.current,
    };

    refsByField[pendingPostingFocusTarget.field][pendingPostingFocusTarget.focusIndex]?.focus();
    setPendingPostingFocusTarget(null);
  }, [pendingPostingFocusTarget, transactionEditor]);

  if (loading) {
    return (
      <ShellState
        title="Loading book"
        message="Fetching book and dashboard projections from the service layer."
      />
    );
  }

  if (error || !loadedBook || !loadedDashboard) {
    return (
      <ShellState
        title="Service unavailable"
        message={error ?? "Book data could not be loaded from the API."}
      />
    );
  }
  const bookVersion = loadedBook.version;

  function addPostingToEditor() {
    setTransactionEditor((current) => {
      if (!current) {
        return current;
      }

      const nextIndex = current.postings.length;
      const defaultAccount = bookAccounts[0];
      const nextAmount = getPostingBalanceSummary(current.postings.map((posting) => posting.amount));
      setPendingPostingFocusTarget({
        field: "account",
        focusIndex: nextIndex,
      });
      setActivePostingAccountSearchIndex(nextIndex);
      setHighlightedPostingAccountMatchIndex(0);

      return {
        ...current,
        postings: [
          ...current.postings,
          {
            accountId: defaultAccount?.id ?? "",
            accountQuery: defaultAccount ? formatAccountOptionLabel(defaultAccount) : "",
            amount: nextAmount.defaultAmount,
            cleared: false,
            memo: "",
          },
        ],
      };
    });
  }

  function setLedgerRange(
    nextValue:
      | { from: string; to: string }
      | ((current: { from: string; to: string }) => { from: string; to: string }),
  ) {
    setCurrentPeriod((current) => (typeof nextValue === "function" ? nextValue(current) : nextValue));
  }

  function setLedgerSearchText(nextValue: string | ((current: string) => string)) {
    setLedgerRegisterTabs((currentTabs) =>
      currentTabs.map((tab) => {
        if (tab.id !== activeLedgerRegisterTabId) {
          return tab;
        }
        return {
          ...tab,
          ledgerSearchText:
            typeof nextValue === "function" ? nextValue(tab.ledgerSearchText) : nextValue,
        };
      }),
    );
  }

  function setLedgerStatusFilter(
    nextValue:
      | "all"
      | "cleared"
      | "open"
      | "reconciled"
      | ((
          current: "all" | "cleared" | "open" | "reconciled",
        ) => "all" | "cleared" | "open" | "reconciled"),
  ) {
    setLedgerRegisterTabs((currentTabs) =>
      currentTabs.map((tab) => {
        if (tab.id !== activeLedgerRegisterTabId) {
          return tab;
        }
        return {
          ...tab,
          ledgerStatusFilter:
            typeof nextValue === "function"
              ? nextValue(tab.ledgerStatusFilter)
              : nextValue,
        };
      }),
    );
  }

  function setSelectedLedgerAccountId(nextValue: string | null | ((current: string | null) => string | null)) {
    setLedgerRegisterTabs((currentTabs) =>
      currentTabs.map((tab) => {
        if (tab.id !== activeLedgerRegisterTabId) {
          return tab;
        }
        return {
          ...tab,
          selectedLedgerAccountId:
            typeof nextValue === "function"
              ? nextValue(tab.selectedLedgerAccountId)
              : nextValue,
        };
      }),
    );
  }

  function setSelectedLedgerTransactionId(nextValue: string | null | ((current: string | null) => string | null)) {
    setLedgerRegisterTabs((currentTabs) =>
      currentTabs.map((tab) => {
        if (tab.id !== activeLedgerRegisterTabId) {
          return tab;
        }
        return {
          ...tab,
          selectedLedgerTransactionId:
            typeof nextValue === "function"
              ? nextValue(tab.selectedLedgerTransactionId)
              : nextValue,
        };
      }),
    );
  }

  function openLedgerRegisterTabForAccount(accountId: string) {
    setLedgerRegisterTabs((currentTabs) => {
      const existingTab = currentTabs.find((tab) => tab.selectedLedgerAccountId === accountId);
      if (existingTab) {
        setActiveLedgerRegisterTabId(existingTab.id);
        return currentTabs;
      }

      const nextTab: LedgerRegisterTabState = {
        id: `tab-${accountId}-${currentTabs.length + 1}`,
        ledgerSearchText: "",
        ledgerStatusFilter: "all",
        selectedLedgerAccountId: accountId,
        selectedLedgerTransactionId: null,
      };
      setActiveLedgerRegisterTabId(nextTab.id);
      return [...currentTabs, nextTab];
    });
  }

  function openLinkedRegisterTabsForTransaction(transactionId: string) {
    const transaction = ledgerBook.filteredTransactions.find((candidate) => candidate.id === transactionId);
    if (!transaction) {
      return;
    }

    for (const accountId of transaction.matchedAccountIds) {
      openLedgerRegisterTabForAccount(accountId);
    }
  }

  function closeLedgerRegisterTab(tabId: string) {
    setLedgerRegisterTabs((currentTabs) => {
      if (currentTabs.length <= 1) {
        return currentTabs;
      }
      const tabIndex = currentTabs.findIndex((tab) => tab.id === tabId);
      if (tabIndex < 0) {
        return currentTabs;
      }
      const nextTabs = currentTabs.filter((tab) => tab.id !== tabId);
      if (activeLedgerRegisterTabId === tabId) {
        const fallbackTab = nextTabs[Math.max(0, tabIndex - 1)] ?? nextTabs[0];
        if (fallbackTab) {
          setActiveLedgerRegisterTabId(fallbackTab.id);
        }
      }
      return nextTabs;
    });
  }

  function moveLedgerRegisterTab(direction: "left" | "right", tabId: string) {
    setLedgerRegisterTabs((currentTabs) => {
      const index = currentTabs.findIndex((tab) => tab.id === tabId);
      if (index < 0) {
        return currentTabs;
      }
      const nextIndex = direction === "left" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= currentTabs.length) {
        return currentTabs;
      }
      const nextTabs = [...currentTabs];
      const [movedTab] = nextTabs.splice(index, 1);
      nextTabs.splice(nextIndex, 0, movedTab);
      return nextTabs;
    });
  }

  function movePosting(direction: "up" | "down", postingIndex: number) {
    setTransactionEditor((current) => {
      if (!current) {
        return current;
      }

      const targetIndex = movePostingIndex({
        direction,
        postingCount: current.postings.length,
        postingIndex,
      });

      if (targetIndex === postingIndex) {
        return current;
      }

      const nextPostings = [...current.postings];
      const [movedPosting] = nextPostings.splice(postingIndex, 1);
      nextPostings.splice(targetIndex, 0, movedPosting);
      setPendingPostingFocusTarget({
        field: "account",
        focusIndex: targetIndex,
      });
      setActivePostingAccountSearchIndex(targetIndex);
      setHighlightedPostingAccountMatchIndex(0);

      return {
        ...current,
        postings: nextPostings,
      };
    });
  }

  function resetTransactionEditorDraft() {
    if (!selectedTransactionRecord) {
      setTransactionEditor(null);
      return;
    }

    setTransactionEditor(createTransactionEditorState(selectedTransactionRecord, bookAccounts));
    setActivePostingAccountSearchIndex(null);
    setHighlightedPostingAccountMatchIndex(0);
  }

  function updatePostingAccountSearch(index: number, nextQuery: string) {
    const exactMatch = findAccountSearchExactMatch({
      accounts: bookAccounts,
      query: nextQuery,
    });

    setTransactionEditor((current) =>
      current
        ? {
            ...current,
            postings: current.postings.map((candidate, candidateIndex) =>
              candidateIndex === index
                ? {
                    ...candidate,
                    accountId: exactMatch?.id ?? "",
                    accountQuery: nextQuery,
                  }
                : candidate,
            ),
          }
        : current,
    );
    setActivePostingAccountSearchIndex(index);
    setHighlightedPostingAccountMatchIndex(0);
  }

  function selectPostingAccount(index: number, accountId: string) {
    const account = bookAccounts.find((candidate) => candidate.id === accountId);

    if (!account) {
      return;
    }

    setTransactionEditor((current) =>
      current
        ? {
            ...current,
            postings: current.postings.map((candidate, candidateIndex) =>
              candidateIndex === index
                ? {
                    ...candidate,
                    accountId: account.id,
                    accountQuery: formatAccountOptionLabel(account),
                  }
                : candidate,
            ),
          }
        : current,
    );
    setActivePostingAccountSearchIndex(null);
    setHighlightedPostingAccountMatchIndex(0);
  }

  async function saveTransactionEditor() {
    if (!transactionEditor || transactionEditorErrors.length > 0) {
      return;
    }

    await runMutation("Transaction update", async () => {
      await putTransaction(activeBookId, bookVersion, transactionEditor.transactionId, {
        actor: "Primary",
        transaction: {
          description: transactionEditor.description.trim(),
          id: transactionEditor.transactionId,
          occurredOn: transactionEditor.occurredOn.trim(),
          payee: transactionEditor.payee.trim() || undefined,
          postings: transactionEditor.postings.map((posting) => ({
            accountId: posting.accountId.trim(),
            amount: {
              commodityCode: loadedBook?.baseCommodityCode ?? "USD",
              quantity: Number.parseFloat(posting.amount),
            },
            cleared: posting.cleared || undefined,
            memo: posting.memo.trim() || undefined,
          })),
          tags: transactionEditor.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        },
      });
    });
  }

  async function saveInlineLedgerRow(transactionId: string) {
    if (!inlineEditDraft) {
      return;
    }

    const trimmedDate = inlineEditDraft.occurredOn.trim();
    const trimmedDescription = inlineEditDraft.description.trim();

    if (!trimmedDescription || !/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
      return;
    }

    const sourceTransaction = bookTransactions.find((transaction) => transaction.id === transactionId);

    if (!sourceTransaction) {
      return;
    }

    await runMutation("Transaction update", async () => {
      await putTransaction(activeBookId, bookVersion, sourceTransaction.id, {
        actor: "Primary",
        transaction: {
          description: trimmedDescription,
          id: sourceTransaction.id,
          occurredOn: trimmedDate,
          payee: inlineEditDraft.payee.trim() || undefined,
          postings: sourceTransaction.postings.map((posting) => ({
            accountId: posting.accountId.trim(),
            amount: {
              commodityCode: posting.amount.commodityCode,
              quantity: posting.amount.quantity,
            },
            cleared: posting.cleared || undefined,
            memo: posting.memo?.trim() || undefined,
          })),
          tags: sourceTransaction.tags ?? [],
        },
      });
    });

    finishInlineEdit();
  }

  async function postInlineLedgerTransaction(input: {
    amount: string;
    date: string;
    description: string;
    expenseAccountId: string;
    payee: string;
  }) {
    await runMutation("Transaction post", async () => {
      const amount = Number.parseFloat(input.amount);
      await postTransaction(activeBookId, bookVersion, {
        actor: "Primary",
        transaction: {
          description: input.description,
          id: createTransactionId(),
          occurredOn: input.date,
          payee: input.payee || undefined,
          postings: [
            {
              accountId: input.expenseAccountId,
              amount: { commodityCode: "USD", quantity: amount },
            },
            {
              accountId: "acct-checking",
              amount: { commodityCode: "USD", quantity: -amount },
              cleared: true,
            },
          ],
        },
      });
    });
  }

  async function deleteInlineLedgerTransaction(transactionId: string) {
    await runMutation("Transaction delete", async () => {
      await deleteTransaction(activeBookId, bookVersion, transactionId, {
        actor: "Primary",
      });
    });
  }

  async function saveInlineLedgerSplits(input: {
    splits: Array<{
      accountId: string;
      accountQuery?: string;
      amount: string;
      cleared: boolean;
      commodityCode: string;
      memo: string;
    }>;
    transactionId: string;
  }) {
    const sourceTransaction = bookTransactions.find(
      (transaction) => transaction.id === input.transactionId,
    );

    if (!sourceTransaction) {
      return;
    }

    const splitValidation = validateInlineLedgerSplitDrafts({
      splits: input.splits,
    });
    if (!splitValidation.canSave) {
      return;
    }

    await runMutation("Transaction update", async () => {
      await putTransaction(activeBookId, bookVersion, sourceTransaction.id, {
        actor: "Primary",
        transaction: {
          description: sourceTransaction.description,
          id: sourceTransaction.id,
          occurredOn: sourceTransaction.occurredOn,
          payee: sourceTransaction.payee ?? undefined,
          postings: input.splits.map((split, postingIndex) => ({
            accountId: split.accountId.trim(),
            amount: {
              commodityCode: split.commodityCode,
              quantity: splitValidation.parsedAmounts[postingIndex] ?? 0,
            },
            cleared: split.cleared || undefined,
            memo: split.memo.trim() || undefined,
          })),
          tags: sourceTransaction.tags ?? [],
        },
      });
    });
  }

  function openCoaAddTransactionFlow() {
    setActiveView("ledger");
    setIsLedgerDetailOpen(false);
    setIsLedgerOperationsOpen(false);
    if (selectedLedgerAccountId) {
      openLedgerRegisterTabForAccount(selectedLedgerAccountId);
    }
  }

  function openCoaNewAccountFlow(parentAccountId: string | null) {
    const parentAccountType = parentAccountId
      ? bookAccounts.find((account) => account.id === parentAccountId)?.type
      : undefined;
    setCoaAccountDraft(
      createCoaAccountDraft({
        parentAccountId,
        parentAccountType,
      }),
    );
  }

  function closeCoaNewAccountFlow() {
    setCoaAccountDraft(null);
  }

  function updateCoaAccountDraftField<Key extends keyof CoaAccountDraft>(
    field: Key,
    value: CoaAccountDraft[Key],
  ) {
    setCoaAccountDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  async function saveCoaAccount() {
    if (!coaAccountDraft || !canSaveCoaAccountDraft(coaAccountDraft)) {
      return;
    }

    await runMutation("Account create", async () => {
      await postAccount(activeBookId, bookVersion, {
        id: createEntityId("acct-web"),
        code: coaAccountDraft.code.trim(),
        name: coaAccountDraft.name.trim(),
        type: coaAccountDraft.type,
        parentAccountId: coaAccountDraft.parentAccountId,
      });
    });
    closeCoaNewAccountFlow();
  }

  function openCoaReconciliationFlow() {
    setActiveView("ledger");
    setIsLedgerOperationsOpen(true);
    if (selectedLedgerAccountId) {
      openLedgerRegisterTabForAccount(selectedLedgerAccountId);
      setReconciliationForm((current) => ({
        ...current,
        accountId: selectedLedgerAccountId,
      }));
    }
  }

  function renderTransactionEditorPanel() {
    return (
      <LedgerTransactionEditorPanel
        activePostingAccountSearchIndex={activePostingAccountSearchIndex}
        addPostingToEditor={addPostingToEditor}
        busy={busy}
        highlightedPostingAccountMatchIndex={highlightedPostingAccountMatchIndex}
        ledgerBook={ledgerBook}
        movePosting={movePosting}
        pendingPostingFocusTargetSetter={setPendingPostingFocusTarget}
        postingAccountInputRefs={postingAccountInputRefs}
        postingAmountInputRefs={postingAmountInputRefs}
        postingBalanceSummary={postingBalanceSummary}
        postingMemoInputRefs={postingMemoInputRefs}
        resetTransactionEditorDraft={resetTransactionEditorDraft}
        saveTransactionEditor={saveTransactionEditor}
        selectPostingAccount={selectPostingAccount}
        setActivePostingAccountSearchIndex={setActivePostingAccountSearchIndex}
        setHighlightedPostingAccountMatchIndex={setHighlightedPostingAccountMatchIndex}
        setTransactionEditor={setTransactionEditor}
        transactionEditor={transactionEditor}
        transactionEditorErrors={transactionEditorErrors}
        updatePostingAccountSearch={updatePostingAccountSearch}
        bookAccounts={bookAccounts}
      />
    );
  }

  function renderMainPanels() {
    if (activeView === "ledger") {
      const labeledLedgerRegisterTabs = ledgerRegisterTabs.map((tab) => {
        const account = bookAccounts.find((candidate) => candidate.id === tab.selectedLedgerAccountId);
        return {
          accountId: tab.selectedLedgerAccountId,
          id: tab.id,
          label: account ? account.name : "All accounts",
        };
      });

      return (
        <LedgerMainPanels
          activeLedgerRegisterTabId={activeLedgerRegisterTabId}
          amountStyle={preferences.amountStyle}
          busy={busy}
          expenseAccounts={expenseAccounts}
          formatCurrency={formatCurrency}
          formatTransactionStatus={formatTransactionStatus}
          inlineEditDraft={inlineEditDraft}
          inlineEditingTransactionId={inlineEditingTransactionId}
          isLedgerDetailOpen={isLedgerDetailOpen}
          isLedgerOperationsOpen={isLedgerOperationsOpen}
          ledgerRange={currentPeriod}
          ledgerRegisterTabs={labeledLedgerRegisterTabs}
          ledgerSearchInputRef={ledgerSearchInputRef}
          ledgerSearchText={ledgerSearchText}
          ledgerStatusFilter={ledgerStatusFilter}
          ledgerBook={ledgerBook}
          ledgerIsFiltered={ledgerBook.isFiltered}
          ledgerOpeningBalance={ledgerBook.openingBalance}
          ledgerTotalCount={ledgerBook.totalCount}
          bookVersion={bookVersion}
          liquidAccounts={liquidAccounts}
          onActivateLedgerRegisterTab={setActiveLedgerRegisterTabId}
          onCancelInlineEdit={cancelInlineEdit}
          onCloseLedgerRegisterTab={closeLedgerRegisterTab}
          onCreateInlineTransaction={(draft) => {
            void postInlineLedgerTransaction(draft);
          }}
          onDeleteInlineTransaction={(transactionId) => {
            void deleteInlineLedgerTransaction(transactionId);
          }}
          onMoveLedgerRegisterTab={moveLedgerRegisterTab}
          onOpenAdvancedEditor={() => setIsLedgerDetailOpen(true)}
          onOpenLedgerRegisterTabForAccount={openLedgerRegisterTabForAccount}
          onOpenLinkedRegisterTabs={openLinkedRegisterTabsForTransaction}
          onSaveInlineEdit={(transactionId) => {
            void saveInlineLedgerRow(transactionId);
          }}
          onSaveInlineSplitEdit={(input) => {
            void saveInlineLedgerSplits(input);
          }}
          onStartInlineEdit={(transaction) =>
            startInlineEdit({
              description: transaction.description,
              occurredOn: transaction.occurredOn,
              payee: transaction.payee,
              transactionId: transaction.id,
            })
          }
          onToggleLedgerDetailOpen={() => setIsLedgerDetailOpen(false)}
          onToggleLedgerOperationsOpen={() => setIsLedgerOperationsOpen((current) => !current)}
          onUpdateInlineEditField={setInlineDraftField}
          reconciliationForm={reconciliationForm}
          reconciliationBook={reconciliationBook}
          runMutation={runMutation}
          selectedLedgerAccountId={selectedLedgerAccountId}
          selectedLedgerTransactionId={selectedLedgerTransactionId}
          setLedgerRange={setLedgerRange}
          setLedgerSearchText={setLedgerSearchText}
          setLedgerStatusFilter={setLedgerStatusFilter}
          setReconciliationForm={setReconciliationForm}
          setSelectedLedgerAccountId={setSelectedLedgerAccountId}
          setSelectedLedgerTransactionId={setSelectedLedgerTransactionId}
          setSelectedReconciliationTransactionIds={setSelectedReconciliationTransactionIds}
          transactionEditorPanel={renderTransactionEditorPanel()}
        />
      );
    }

    return (
      <NonLedgerMainPanels
        activeView={activeView}
        baselineSnapshot={baselineSnapshot}
        bookVersion={bookVersion}
        budgetLineForm={budgetLineForm}
        busy={busy}
        createEntityId={createEntityId}
        csvForm={csvForm}
        dueTransactions={dueTransactions}
        envelopeAllocationForm={envelopeAllocationForm}
        envelopeForm={envelopeForm}
        envelopeSnapshot={envelopeSnapshot}
        expenseAccounts={expenseAccounts}
        formatCurrency={formatCurrency}
        fundingAccounts={fundingAccounts}
        getBookViewDefinition={getBookViewDefinition}
        nextScheduledTransactions={nextScheduledTransactions}
        overviewCards={overviewCards}
        parseCsvRows={parseCsvRows}
        postBaselineBudgetLine={postBaselineBudgetLine}
        postCsvImport={postCsvImport}
        postEnvelope={postEnvelope}
        postEnvelopeAllocation={postEnvelopeAllocation}
        postScheduledTransaction={postScheduledTransaction}
        recentTransactions={recentTransactions}
        runMutation={runMutation}
        scheduleForm={scheduleForm}
        setActiveView={setActiveView}
        setBudgetLineForm={setBudgetLineForm}
        setCsvForm={setCsvForm}
        setEnvelopeAllocationForm={setEnvelopeAllocationForm}
        setEnvelopeForm={setEnvelopeForm}
        setAmountStyle={setAmountStyle}
        setDensity={setDensity}
        setScheduleForm={setScheduleForm}
        setTheme={setTheme}
        topBudgetVarianceRows={topBudgetVarianceRows}
        bookEnvelopes={bookEnvelopes}
        preferences={preferences}
      />
    );
  }

  function renderInspectorContent() {
    return (
      <ShellInspectorContent
        activeView={activeView}
        book={loadedBook!}
        currentPeriod={currentPeriod}
        isInspectorOpen={isInspectorOpen}
        ledgerBook={ledgerBook}
        onToggleInspector={() => setIsInspectorOpen((current) => !current)}
      />
    );
  }

  const workspaceStyle = {
    "--inspector-width": isInspectorOpen ? "280px" : "0px",
  } as CSSProperties;

  return (
    <div
      className="workspace"
      data-theme={preferences.theme}
      data-density={preferences.density}
      data-amount-style={preferences.amountStyle}
      style={workspaceStyle}
    >
      <ShellTopbar
        currentPeriodLabel={currentPeriodLabel}
        isPeriodInputOpen={isPeriodInputOpen}
        onPeriodClick={() => setIsPeriodInputOpen(true)}
        onPeriodSubmit={(text) => {
          const parsedRange = parsePeriodExpression(text);
          if (parsedRange) {
            setCurrentPeriod(parsedRange);
          }
          setIsPeriodInputOpen(false);
        }}
        onPeriodCancel={() => setIsPeriodInputOpen(false)}
        onCommandPaletteClick={() => setIsCommandPaletteOpen(true)}
      />
      <ShellActivityBar activeView={activeView} onViewChange={setActiveView} />
      <CoaSidebar
        accounts={bookAccounts}
        selectedAccountId={selectedLedgerAccountId}
        onAccountSelect={setSelectedLedgerAccountId}
        onAddTransaction={openCoaAddTransactionFlow}
        onNewAccount={openCoaNewAccountFlow}
        onReconcile={openCoaReconciliationFlow}
      />

      <main className="editor-area">
        <section className={`editor-grid view-${activeView}`}>{renderMainPanels()}</section>
      </main>

      <aside className="inspector">
        {renderInspectorContent()}
      </aside>

      <ShellStatusBar apiStatus={apiStatus} registerStatus={registerStatus} />

      {coaAccountDraft ? (
        <div className="command-palette-overlay" role="dialog" aria-modal="true">
          <div className="command-palette">
            <div className="panel-header">
              <span>
                {coaAccountDraft.parentAccountId ? "Create sub-account" : "Create account"}
              </span>
              <span className="muted">Chart of accounts</span>
            </div>
            <div className="form-stack">
              <label>
                Code
                <input
                  type="text"
                  value={coaAccountDraft.code}
                  onChange={(event) => updateCoaAccountDraftField("code", event.target.value)}
                />
              </label>
              <label>
                Name
                <input
                  type="text"
                  value={coaAccountDraft.name}
                  onChange={(event) => updateCoaAccountDraftField("name", event.target.value)}
                />
              </label>
              <label>
                Type
                <select
                  value={coaAccountDraft.type}
                  onChange={(event) =>
                    updateCoaAccountDraftField("type", event.target.value as AccountType)
                  }
                >
                  {COA_ACCOUNT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="detail-stack">
              <button
                className="btn-primary"
                disabled={!canSaveNewCoaAccount || busy !== null}
                type="button"
                onClick={() => {
                  void saveCoaAccount();
                }}
              >
                Save account
              </button>
              <button className="btn-secondary" type="button" onClick={closeCoaNewAccountFlow}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCommandPaletteOpen ? (
        <div className="command-palette-overlay" role="dialog" aria-modal="true">
          <div className="command-palette">
            <div className="panel-header">
              <span>Command palette</span>
              <span className="muted">Register-first shortcuts</span>
            </div>
            <div className="detail-stack">
              <button
                type="button"
                onClick={() => {
                  setActiveView("ledger");
                  setIsCommandPaletteOpen(false);
                  ledgerSearchInputRef.current?.focus();
                }}
              >
                Focus register search
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveView("ledger");
                  setIsLedgerDetailOpen((current) => !current);
                  setIsCommandPaletteOpen(false);
                }}
              >
                Toggle advanced editor
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveView("ledger");
                  setIsLedgerOperationsOpen((current) => !current);
                  setIsCommandPaletteOpen(false);
                }}
              >
                Toggle reconciliation workspace
              </button>
              <button
                disabled={!selectedLedgerTransactionId}
                type="button"
                onClick={() => {
                  if (selectedLedgerTransactionId) {
                    openLinkedRegisterTabsForTransaction(selectedLedgerTransactionId);
                  }
                  setIsCommandPaletteOpen(false);
                }}
              >
                Open linked registers for selected transaction
              </button>
              <button type="button" onClick={() => setIsCommandPaletteOpen(false)}>
                Close palette
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
