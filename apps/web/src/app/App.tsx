import { useEffect, useRef, useState } from "react";
import { colors, typography } from "@gnucash-ng/ui";
import {
  postBaselineBudgetLine,
  postCsvImport,
  postEnvelope,
  postEnvelopeAllocation,
  postScheduledTransaction,
  postTransaction,
  putTransaction,
} from "./api";
import {
  findAccountSearchExactMatch,
  createReconciliationWorkspaceModel,
  createLedgerWorkspaceModel,
  createOverviewCards,
  getPostingBalanceSummary,
  getWorkspaceViewDefinition,
  movePostingIndex,
  type PostingFocusField,
  type WorkspaceView,
  workspaceViews
} from "./shell";
import {
  getLedgerRegisterTabHotkeyAction,
  useLedgerInlineRowEditState,
  useLedgerKeyboardAndSelectionSync,
  validateInlineLedgerSplitDrafts,
} from "./ledger-state";
import { LedgerOperationsPanels } from "./LedgerOperationsPanels";
import { LedgerRegisterPanel } from "./LedgerRegisterPanel";
import { LedgerTransactionEditorPanel } from "./LedgerTransactionEditorPanel";
import { NonLedgerMainPanels } from "./NonLedgerMainPanels";
import { ShellInspectorContent, ShellSidebarContent } from "./ShellSidePanels";
import { APRIL_RANGE, WORKSPACE_ID } from "./app-constants";
import {
  createTransactionId,
  createEntityId,
  formatAccountOptionLabel,
  formatCurrency,
  formatTransactionStatus,
  parseCsvRows,
} from "./app-format";
import {
  createTransactionEditorState,
  type TransactionEditorState,
  validateTransactionEditorState,
} from "./transaction-editor";
import { useWorkspaceRuntime } from "./use-workspace-runtime";
import "../app/styles.css";

function ShellState(props: { message: string; title: string }) {
  return (
    <main className="shell-state">
      <h1>{props.title}</h1>
      <p>{props.message}</p>
    </main>
  );
}

interface LedgerRegisterTabState {
  id: string;
  ledgerRange: { from: string; to: string };
  ledgerSearchText: string;
  ledgerStatusFilter: "all" | "cleared" | "open" | "reconciled";
  selectedLedgerAccountId: string | null;
  selectedLedgerTransactionId: string | null;
}

export function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>("overview");
  const [isLedgerDetailOpen, setIsLedgerDetailOpen] = useState(false);
  const [isLedgerOperationsOpen, setIsLedgerOperationsOpen] = useState(false);
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

  const [reconciliationForm, setReconciliationForm] = useState({
    accountId: "acct-checking",
    statementBalance: "3051.58",
    statementDate: "2026-04-02",
  });
  const [selectedReconciliationTransactionIds, setSelectedReconciliationTransactionIds] = useState<
    Record<string, boolean>
  >({
    "txn-grocery-1": true,
    "txn-paycheck-1": true,
  });
  const [csvForm, setCsvForm] = useState({
    csvText: "2026-04-04,Bus pass,45,acct-expense-transport,acct-checking",
    sourceLabel: "manual.csv",
  });
  const [budgetLineForm, setBudgetLineForm] = useState({
    accountId: "acct-expense-groceries",
    budgetPeriod: "monthly",
    period: "2026-05",
    plannedAmount: "700",
  });
  const [envelopeForm, setEnvelopeForm] = useState({
    availableAmount: "150",
    expenseAccountId: "acct-expense-housing",
    fundingAccountId: "acct-checking",
    id: "env-housing",
    name: "Housing Buffer",
    rolloverEnabled: true,
    targetAmount: "150",
  });
  const [envelopeAllocationForm, setEnvelopeAllocationForm] = useState({
    amount: "50",
    envelopeId: "env-groceries",
    note: "Mid-month top-up",
    occurredOn: "2026-04-15",
    type: "fund",
  });
  const [scheduleForm, setScheduleForm] = useState({
    amount: "120",
    autoPost: false,
    description: "Monthly utilities",
    expenseAccountId: "acct-expense-utilities",
    frequency: "monthly",
    fundingAccountId: "acct-checking",
    id: "sched-utilities",
    name: "Monthly Utilities",
    nextDueOn: "2026-05-15",
    payee: "City Utilities",
  });
  const [ledgerRegisterTabs, setLedgerRegisterTabs] = useState<LedgerRegisterTabState[]>([
    {
      id: "tab-all",
      ledgerRange: APRIL_RANGE,
      ledgerSearchText: "",
      ledgerStatusFilter: "all",
      selectedLedgerAccountId: null,
      selectedLedgerTransactionId: null,
    },
  ]);
  const [activeLedgerRegisterTabId, setActiveLedgerRegisterTabId] = useState("tab-all");
  const activeLedgerRegisterTab =
    ledgerRegisterTabs.find((tab) => tab.id === activeLedgerRegisterTabId) ?? ledgerRegisterTabs[0];
  const activeLedgerRegisterTabIndex = Math.max(
    0,
    ledgerRegisterTabs.findIndex((tab) => tab.id === activeLedgerRegisterTabId),
  );
  const ledgerRange = activeLedgerRegisterTab?.ledgerRange ?? APRIL_RANGE;
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
  const { busy, dashboard, error, loading, runMutation, statusMessage, workspace } =
    useWorkspaceRuntime({
      range: APRIL_RANGE,
      workspaceId: WORKSPACE_ID,
    });

  const loadedWorkspace = workspace;
  const loadedDashboard = dashboard;
  const workspaceAccounts = loadedWorkspace?.accounts ?? [];
  const workspaceEnvelopes = loadedWorkspace?.envelopes ?? [];
  const workspaceSchedules = loadedWorkspace?.scheduledTransactions ?? [];
  const workspaceTransactions = loadedWorkspace?.transactions ?? [];
  const expenseAccounts = workspaceAccounts.filter((account) => account.type === "expense");
  const liquidAccounts = workspaceAccounts.filter(
    (account) => account.type === "asset" || account.type === "liability",
  );
  const fundingAccounts = workspaceAccounts.filter((account) => account.type === "asset");
  const activeViewDefinition = getWorkspaceViewDefinition(activeView);
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
    envelopeCount: workspaceEnvelopes.length,
    ledgerIssueCount: ledgerValidationErrors.length,
  });

  const recentTransactions = [...workspaceTransactions]
    .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn))
    .slice(0, 6);
  const topBudgetVarianceRows = [...baselineSnapshot]
    .sort((left, right) => Math.abs(right.variance.quantity) - Math.abs(left.variance.quantity))
    .slice(0, 4);
  const nextScheduledTransactions = [...workspaceSchedules]
    .sort((left, right) => left.nextDueOn.localeCompare(right.nextDueOn))
    .slice(0, 5);
  const selectedTransactionRecord =
    workspaceTransactions.find((transaction) => transaction.id === selectedLedgerTransactionId) ?? null;
  const ledgerWorkspace = loadedWorkspace
      ? createLedgerWorkspaceModel({
        accountBalances,
        rangeEnd: ledgerRange.to,
        rangeStart: ledgerRange.from,
        searchText: ledgerSearchText,
        statusFilter: ledgerStatusFilter,
        selectedAccountId: selectedLedgerAccountId,
        selectedTransactionId: selectedLedgerTransactionId,
        workspace: loadedWorkspace,
      })
    : {
        availableAccounts: [],
        filteredBalances: [],
        filteredTransactions: [],
        selectedAccountBalance: null,
        selectedAccount: null,
        selectedTransaction: null,
      };
  const reconciliationWorkspace = loadedWorkspace
    ? createReconciliationWorkspaceModel({
        selectedAccountId: reconciliationForm.accountId,
        selectedTransactionIds: selectedReconciliationTransactionIds,
        statementBalanceText: reconciliationForm.statementBalance,
        statementDate: reconciliationForm.statementDate,
        workspace: loadedWorkspace,
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
    filteredTransactions: ledgerWorkspace.filteredTransactions,
    ledgerSearchInputRef,
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
    cancelInlineEdit();
    setActivePostingAccountSearchIndex(null);
  }, [activeLedgerRegisterTabId, cancelInlineEdit]);

  useEffect(() => {
    if (!loadedWorkspace) {
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

      return createTransactionEditorState(selectedTransactionRecord, workspaceAccounts);
    });
  }, [selectedTransactionRecord, workspaceAccounts]);

  useEffect(() => {
    if (!inlineEditingTransactionId) {
      return;
    }

    const editedRowStillVisible = ledgerWorkspace.filteredTransactions.some(
      (transaction) => transaction.id === inlineEditingTransactionId,
    );

    if (!editedRowStillVisible) {
      cancelInlineEdit();
    }
  }, [cancelInlineEdit, inlineEditingTransactionId, ledgerWorkspace.filteredTransactions]);

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
        title="Loading workspace"
        message="Fetching finance workspace and dashboard projections from the service layer."
      />
    );
  }

  if (error || !loadedWorkspace || !loadedDashboard) {
    return (
      <ShellState
        title="Service unavailable"
        message={error ?? "Workspace data could not be loaded from the API."}
      />
    );
  }

  function addPostingToEditor() {
    setTransactionEditor((current) => {
      if (!current) {
        return current;
      }

      const nextIndex = current.postings.length;
      const defaultAccount = workspaceAccounts[0];
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

  function setLedgerRange(nextValue: { from: string; to: string } | ((current: { from: string; to: string }) => { from: string; to: string })) {
    setLedgerRegisterTabs((currentTabs) =>
      currentTabs.map((tab) => {
        if (tab.id !== activeLedgerRegisterTabId) {
          return tab;
        }
        return {
          ...tab,
          ledgerRange: typeof nextValue === "function" ? nextValue(tab.ledgerRange) : nextValue,
        };
      }),
    );
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
        ledgerRange: APRIL_RANGE,
        ledgerSearchText: "",
        ledgerStatusFilter: "all",
        selectedLedgerAccountId: accountId,
        selectedLedgerTransactionId: null,
      };
      setActiveLedgerRegisterTabId(nextTab.id);
      return [...currentTabs, nextTab];
    });
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

    setTransactionEditor(createTransactionEditorState(selectedTransactionRecord, workspaceAccounts));
    setActivePostingAccountSearchIndex(null);
    setHighlightedPostingAccountMatchIndex(0);
  }

  function updatePostingAccountSearch(index: number, nextQuery: string) {
    const exactMatch = findAccountSearchExactMatch({
      accounts: workspaceAccounts,
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
    const account = workspaceAccounts.find((candidate) => candidate.id === accountId);

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
      await putTransaction(WORKSPACE_ID, transactionEditor.transactionId, {
        actor: "Primary",
        transaction: {
          description: transactionEditor.description.trim(),
          id: transactionEditor.transactionId,
          occurredOn: transactionEditor.occurredOn.trim(),
          payee: transactionEditor.payee.trim() || undefined,
          postings: transactionEditor.postings.map((posting) => ({
            accountId: posting.accountId.trim(),
            amount: {
              commodityCode: loadedWorkspace?.baseCommodityCode ?? "USD",
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

    const sourceTransaction = workspaceTransactions.find((transaction) => transaction.id === transactionId);

    if (!sourceTransaction) {
      return;
    }

    await runMutation("Transaction update", async () => {
      await putTransaction(WORKSPACE_ID, sourceTransaction.id, {
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
      await postTransaction(WORKSPACE_ID, {
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
    const sourceTransaction = workspaceTransactions.find(
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
      await putTransaction(WORKSPACE_ID, sourceTransaction.id, {
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

  function renderTransactionEditorPanel() {
    return (
      <LedgerTransactionEditorPanel
        activePostingAccountSearchIndex={activePostingAccountSearchIndex}
        addPostingToEditor={addPostingToEditor}
        busy={busy}
        highlightedPostingAccountMatchIndex={highlightedPostingAccountMatchIndex}
        ledgerWorkspace={ledgerWorkspace}
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
        workspaceAccounts={workspaceAccounts}
      />
    );
  }

  function renderMainPanels() {
    if (activeView === "ledger") {
      return (
        <>
            <LedgerRegisterPanel
              activeLedgerRegisterTabId={activeLedgerRegisterTabId}
              busy={busy}
              expenseAccounts={expenseAccounts}
              formatCurrency={formatCurrency}
              formatTransactionStatus={formatTransactionStatus}
              inlineEditDraft={inlineEditDraft}
              inlineEditingTransactionId={inlineEditingTransactionId}
              ledgerRange={ledgerRange}
              ledgerSearchInputRef={ledgerSearchInputRef}
              ledgerSearchText={ledgerSearchText}
              ledgerStatusFilter={ledgerStatusFilter}
              ledgerRegisterTabs={ledgerRegisterTabs.map((tab) => {
                const account = workspaceAccounts.find((candidate) => candidate.id === tab.selectedLedgerAccountId);
                return {
                  accountId: tab.selectedLedgerAccountId,
                  id: tab.id,
                  label: account ? account.name : "All accounts",
                };
              })}
              ledgerWorkspace={ledgerWorkspace}
              liquidAccounts={liquidAccounts}
              onCancelInlineEdit={cancelInlineEdit}
              onActivateLedgerRegisterTab={setActiveLedgerRegisterTabId}
              onCloseLedgerRegisterTab={closeLedgerRegisterTab}
              onCreateInlineTransaction={(draft) => {
                void postInlineLedgerTransaction(draft);
              }}
              onMoveLedgerRegisterTab={moveLedgerRegisterTab}
              onOpenLedgerRegisterTabForAccount={openLedgerRegisterTabForAccount}
              onOpenAdvancedEditor={() => setIsLedgerDetailOpen(true)}
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
              onUpdateInlineEditField={setInlineDraftField}
              selectedLedgerAccountId={selectedLedgerAccountId}
              selectedLedgerTransactionId={selectedLedgerTransactionId}
              setLedgerRange={setLedgerRange}
              setLedgerSearchText={setLedgerSearchText}
              setLedgerStatusFilter={setLedgerStatusFilter}
              setSelectedLedgerAccountId={setSelectedLedgerAccountId}
              setSelectedLedgerTransactionId={setSelectedLedgerTransactionId}
            />

            {isLedgerDetailOpen ? (
              <>
                <div className="posting-editor-row">
                  <button type="button" onClick={() => setIsLedgerDetailOpen(false)}>
                    Hide advanced editor
                  </button>
                </div>
                {renderTransactionEditorPanel()}
              </>
            ) : (
              <article className="panel">
                <div className="panel-header">
                  <span>Advanced editor</span>
                  <span className="muted">Optional</span>
                </div>
                <p className="form-hint">
                  Inline row editing is the default. Use the row-level Advanced action only when you need
                  split-level editing details.
                </p>
              </article>
            )}
            <article className="panel">
              <div className="panel-header">
                <span>Ledger operations</span>
                <span className="muted">Reconciliation and statement matching</span>
              </div>
              <div className="posting-editor-row">
                <button type="button" onClick={() => setIsLedgerOperationsOpen((current) => !current)}>
                  {isLedgerOperationsOpen ? "Hide reconciliation workspace" : "Open reconciliation workspace"}
                </button>
              </div>
              {isLedgerOperationsOpen ? (
                <LedgerOperationsPanels
                  busy={busy}
                  liquidAccounts={liquidAccounts}
                  reconciliationForm={reconciliationForm}
                  reconciliationWorkspace={reconciliationWorkspace}
                  runMutation={runMutation}
                  setReconciliationForm={setReconciliationForm}
                  setSelectedReconciliationTransactionIds={setSelectedReconciliationTransactionIds}
                />
              ) : (
                <p className="form-hint">
                  Reconciliation is available on demand so routine editing stays register-first.
                </p>
              )}
            </article>
        </>
      );
    }

    return (
      <NonLedgerMainPanels
        activeView={activeView}
        baselineSnapshot={baselineSnapshot}
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
        getWorkspaceViewDefinition={getWorkspaceViewDefinition}
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
        setScheduleForm={setScheduleForm}
        topBudgetVarianceRows={topBudgetVarianceRows}
        workspaceEnvelopes={workspaceEnvelopes}
      />
    );
  }

  function renderSidebarContent() {
    return (
      <ShellSidebarContent
        activeView={activeView}
        baselineSnapshot={baselineSnapshot}
        budgetConfigurationErrors={budgetConfigurationErrors}
        dueTransactions={dueTransactions}
        getWorkspaceViewDefinition={getWorkspaceViewDefinition}
        ledgerValidationErrors={ledgerValidationErrors}
        ledgerWorkspace={ledgerWorkspace}
        overviewCards={overviewCards}
        selectedLedgerAccountId={selectedLedgerAccountId}
        selectedLedgerTransactionId={selectedLedgerTransactionId}
        setActiveView={setActiveView}
        setSelectedLedgerAccountId={setSelectedLedgerAccountId}
        setSelectedLedgerTransactionId={setSelectedLedgerTransactionId}
        workspaceAccounts={workspaceAccounts}
        workspaceEnvelopes={workspaceEnvelopes}
        workspaceSchedules={workspaceSchedules}
      />
    );
  }

  function renderInspectorContent() {
    return (
      <ShellInspectorContent
        activeView={activeView}
        baselineSnapshot={baselineSnapshot}
        budgetConfigurationErrors={budgetConfigurationErrors}
        dueTransactions={dueTransactions}
        getWorkspaceViewDefinition={getWorkspaceViewDefinition}
        ledgerValidationErrors={ledgerValidationErrors}
        ledgerWorkspace={ledgerWorkspace}
        overviewCards={overviewCards}
        selectedLedgerAccountId={selectedLedgerAccountId}
        selectedLedgerTransactionId={selectedLedgerTransactionId}
        setActiveView={setActiveView}
        setSelectedLedgerAccountId={setSelectedLedgerAccountId}
        setSelectedLedgerTransactionId={setSelectedLedgerTransactionId}
        workspaceAccounts={workspaceAccounts}
        workspaceEnvelopes={workspaceEnvelopes}
        workspaceSchedules={workspaceSchedules}
      />
    );
  }

  return (
    <div className="workspace">
      <aside className="activity-bar">
        <div className="brand">GN</div>
        <nav>
          {workspaceViews.map((view) => (
            <button
              key={view.id}
              className={`activity-button${activeView === view.id ? " active" : ""}`}
              type="button"
              onClick={() => setActiveView(view.id)}
            >
              {view.shortLabel}
            </button>
          ))}
        </nav>
      </aside>

      <section className="sidebar">
        <div className="panel-header">
          <span>{activeViewDefinition.label}</span>
          <span className="muted">{loadedWorkspace.name}</span>
        </div>
        {renderSidebarContent()}
      </section>

      <main className="editor-area">
        <header className="editor-header">
          <div>
            <p className="eyebrow">{activeViewDefinition.detail}</p>
            <h1>{activeViewDefinition.title}</h1>
            <p className="editor-description">{activeViewDefinition.description}</p>
            {statusMessage ? <p className="status-banner success">{statusMessage}</p> : null}
            {error ? <p className="status-banner error">{error}</p> : null}
          </div>
          <div className="header-stats">
            <div className="stat-card">
              <span>Net worth</span>
              <strong>{formatCurrency(netWorth.quantity)}</strong>
            </div>
            <div className="stat-card">
              <span>Accounts with balances</span>
              <strong>{accountBalances.length}</strong>
            </div>
            <div className="stat-card">
              <span>Schedules due</span>
              <strong>{dueTransactions.length}</strong>
            </div>
          </div>
        </header>

        <section className="view-tabs">
          {workspaceViews.map((view) => (
            <button
              key={view.id}
              className={`view-tab${activeView === view.id ? " active" : ""}`}
              type="button"
              onClick={() => setActiveView(view.id)}
            >
              <span>{view.label}</span>
              <small>{view.detail}</small>
            </button>
          ))}
        </section>

        <section className={`editor-grid view-${activeView}`}>{renderMainPanels()}</section>
      </main>

      <aside className="inspector">
        <div className="panel-header">
          <span>Inspector</span>
          <span className="muted">{activeViewDefinition.label}</span>
        </div>
        {renderInspectorContent()}
      </aside>

      <style>{`
        :root {
          --background: ${colors.background};
          --panel: ${colors.panel};
          --panel-alt: ${colors.panelAlt};
          --text: ${colors.text};
          --text-muted: ${colors.textMuted};
          --accent: ${colors.accent};
          --accent-soft: ${colors.accentSoft};
          --border: ${colors.border};
          --display-font: ${typography.display};
          --mono-font: ${typography.mono};
        }
      `}</style>
    </div>
  );
}
