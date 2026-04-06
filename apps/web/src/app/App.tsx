import { useEffect, useRef, useState } from "react";
import { colors, typography } from "@gnucash-ng/ui";
import {
  postBaselineBudgetLine,
  postCsvImport,
  postEnvelope,
  postEnvelopeAllocation,
  postReconciliation,
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
import { useLedgerFiltersAndSelection, useLedgerKeyboardAndSelectionSync } from "./ledger-state";
import { LedgerRegisterPanel } from "./LedgerRegisterPanel";
import { LedgerSidebar } from "./LedgerSidebar";
import { LedgerTransactionEditorPanel } from "./LedgerTransactionEditorPanel";
import { NonLedgerMainPanels } from "./NonLedgerMainPanels";
import { APRIL_RANGE, WORKSPACE_ID } from "./app-constants";
import {
  createEntityId,
  createTransactionId,
  formatAccountOptionLabel,
  formatCurrency,
  formatSignedCurrency,
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

export function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>("overview");
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

  const [transactionForm, setTransactionForm] = useState({
    amount: "65.00",
    date: "2026-04-03",
    description: "Internet bill",
    expenseAccountId: "acct-expense-utilities",
    payee: "Provider",
  });
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
  const {
    ledgerRange,
    ledgerSearchText,
    selectedLedgerAccountId,
    selectedLedgerTransactionId,
    setLedgerRange,
    setLedgerSearchText,
    setSelectedLedgerAccountId,
    setSelectedLedgerTransactionId,
  } = useLedgerFiltersAndSelection({ initialRange: APRIL_RANGE });
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
    setSelectedLedgerTransactionId,
  });

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
              formatCurrency={formatCurrency}
              formatTransactionStatus={formatTransactionStatus}
              ledgerRange={ledgerRange}
              ledgerSearchInputRef={ledgerSearchInputRef}
              ledgerSearchText={ledgerSearchText}
              ledgerWorkspace={ledgerWorkspace}
              liquidAccounts={liquidAccounts}
              selectedLedgerAccountId={selectedLedgerAccountId}
              selectedLedgerTransactionId={selectedLedgerTransactionId}
              setLedgerRange={setLedgerRange}
              setLedgerSearchText={setLedgerSearchText}
              setSelectedLedgerAccountId={setSelectedLedgerAccountId}
              setSelectedLedgerTransactionId={setSelectedLedgerTransactionId}
            />

            {renderTransactionEditorPanel()}

            <article className="panel form-panel">
              <div className="panel-header">
                <span>New Transaction</span>
                <span className="muted">Service-backed write</span>
              </div>
              <form
                className="form-stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runMutation("Transaction post", async () => {
                    const amount = Number.parseFloat(transactionForm.amount);
                    await postTransaction(WORKSPACE_ID, {
                      actor: "Primary",
                      transaction: {
                        id: createTransactionId(),
                        occurredOn: transactionForm.date,
                        description: transactionForm.description,
                        payee: transactionForm.payee,
                        postings: [
                          {
                            accountId: transactionForm.expenseAccountId,
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
                }}
              >
                <label>
                  Date
                  <input
                    value={transactionForm.date}
                    onChange={(event) =>
                      setTransactionForm((current) => ({ ...current, date: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Description
                  <input
                    value={transactionForm.description}
                    onChange={(event) =>
                      setTransactionForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Payee
                  <input
                    value={transactionForm.payee}
                    onChange={(event) =>
                      setTransactionForm((current) => ({ ...current, payee: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Expense account
                  <select
                    value={transactionForm.expenseAccountId}
                    onChange={(event) =>
                      setTransactionForm((current) => ({
                        ...current,
                        expenseAccountId: event.target.value,
                      }))
                    }
                  >
                    {expenseAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Amount
                  <input
                    value={transactionForm.amount}
                    onChange={(event) =>
                      setTransactionForm((current) => ({ ...current, amount: event.target.value }))
                    }
                  />
                </label>
                <button type="submit" disabled={busy !== null}>
                  {busy === "Transaction post" ? "Posting..." : "Post transaction"}
                </button>
              </form>
            </article>

            <article className="panel form-panel">
              <div className="panel-header">
                <span>Reconcile</span>
                <span className="muted">Statement matching</span>
              </div>
              <form
                className="form-stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runMutation("Reconciliation", async () => {
                    await postReconciliation(WORKSPACE_ID, {
                      actor: "Primary",
                      payload: {
                        accountId: reconciliationForm.accountId,
                        clearedTransactionIds: reconciliationWorkspace.candidateTransactions
                          .filter((candidate) => candidate.selected)
                          .map((candidate) => candidate.id),
                        statementBalance: Number.parseFloat(reconciliationForm.statementBalance),
                        statementDate: reconciliationForm.statementDate,
                      },
                    });
                  });
                }}
              >
                <label>
                  Account
                  <select
                    value={reconciliationForm.accountId}
                    onChange={(event) =>
                      setReconciliationForm((current) => ({ ...current, accountId: event.target.value }))
                    }
                  >
                    {liquidAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Statement date
                  <input
                    value={reconciliationForm.statementDate}
                    onChange={(event) =>
                      setReconciliationForm((current) => ({
                        ...current,
                        statementDate: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Statement balance
                  <input
                    value={reconciliationForm.statementBalance}
                    onChange={(event) =>
                      setReconciliationForm((current) => ({
                        ...current,
                        statementBalance: event.target.value,
                      }))
                    }
                  />
                </label>
                {reconciliationWorkspace.latestSession ? (
                  <div className="reconciliation-note">
                    Latest session: {reconciliationWorkspace.latestSession.statementDate} with difference{" "}
                    {formatSignedCurrency(reconciliationWorkspace.latestSession.difference.quantity)}
                  </div>
                ) : null}
                <div className="reconciliation-summary-grid">
                  <div className="summary-card">
                    <span>Cleared total</span>
                    <strong>{formatSignedCurrency(reconciliationWorkspace.clearedTotal)}</strong>
                  </div>
                  <div
                    className={`summary-card${
                      reconciliationWorkspace.difference === 0 ? " balanced" : " warning"
                    }`}
                  >
                    <span>Difference</span>
                    <strong>
                      {reconciliationWorkspace.difference === null
                        ? "Enter balance"
                        : formatSignedCurrency(reconciliationWorkspace.difference)}
                    </strong>
                  </div>
                </div>
                <div className="reconciliation-candidate-list">
                  <div className="panel-header">
                    <span>Cleared candidates</span>
                    <span className="muted">
                      {reconciliationWorkspace.selectedAccount?.name ?? "Select account"}
                    </span>
                  </div>
                  {reconciliationWorkspace.candidateTransactions.length > 0 ? (
                    reconciliationWorkspace.candidateTransactions.map((candidate) => (
                      <button
                        key={candidate.id}
                        className={`reconciliation-candidate${candidate.selected ? " active" : ""}`}
                        type="button"
                        onClick={() =>
                          setSelectedReconciliationTransactionIds((current) => ({
                            ...current,
                            [candidate.id]: !current[candidate.id],
                          }))
                        }
                      >
                        <div>
                          <strong>{candidate.description}</strong>
                          <div className="candidate-meta">
                            {candidate.occurredOn}
                            {candidate.payee ? ` · ${candidate.payee}` : ""}
                          </div>
                        </div>
                        <div className="candidate-side">
                          <strong>{formatSignedCurrency(candidate.accountAmount)}</strong>
                          <span>{candidate.selected ? "Cleared" : "Open"}</span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="form-hint">
                      No transactions are available for the selected account and statement date.
                    </p>
                  )}
                </div>
                <button type="submit" disabled={busy !== null}>
                  {busy === "Reconciliation" ? "Reconciling..." : "Record reconciliation"}
                </button>
              </form>
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
    switch (activeView) {
      case "overview":
        return (
          <>
            <div className="tree-section">
              <h3>Focus queues</h3>
              {overviewCards.map((card) => {
                const targetView = getWorkspaceViewDefinition(card.id);

                return (
                  <button
                    key={card.id}
                    className="tree-button"
                    type="button"
                    onClick={() => setActiveView(card.id)}
                  >
                    <span>{targetView.label}</span>
                    <span className="muted">{card.metric}</span>
                  </button>
                );
              })}
            </div>

            <div className="tree-section">
              <h3>Accounts</h3>
              {workspaceAccounts.slice(0, 8).map((account) => (
                <div key={account.id} className="tree-item">
                  <span>{account.name}</span>
                  <span className="muted">{account.code}</span>
                </div>
              ))}
            </div>
          </>
        );
      case "ledger":
        return (
          <LedgerSidebar
            ledgerWorkspace={ledgerWorkspace}
            selectedLedgerAccountId={selectedLedgerAccountId}
            selectedLedgerTransactionId={selectedLedgerTransactionId}
            setSelectedLedgerAccountId={setSelectedLedgerAccountId}
            setSelectedLedgerTransactionId={setSelectedLedgerTransactionId}
          />
        );
      case "budget":
        return (
          <div className="tree-section">
            <h3>Budget categories</h3>
            {baselineSnapshot.map((row) => (
              <div key={row.accountId} className="tree-item">
                <span>{row.accountName}</span>
                <span className="muted">{formatCurrency(row.planned.quantity)}</span>
              </div>
            ))}
          </div>
        );
      case "envelopes":
        return (
          <div className="tree-section">
            <h3>Envelopes</h3>
            {workspaceEnvelopes.map((envelope) => (
              <div key={envelope.id} className="tree-item">
                <span>{envelope.name}</span>
                <span className="muted">{formatCurrency(envelope.availableAmount.quantity)}</span>
              </div>
            ))}
          </div>
        );
      case "imports":
        return (
          <div className="tree-section">
            <h3>Interchange formats</h3>
            {["CSV", "OFX / QFX", "QIF", "GnuCash XML"].map((item) => (
              <div key={item} className="tree-item">
                <span>{item}</span>
                <span className="muted">{item === "CSV" ? "Live" : "Planned"}</span>
              </div>
            ))}
          </div>
        );
      case "automations":
        return (
          <div className="tree-section">
            <h3>Schedules</h3>
            {workspaceSchedules.map((schedule) => (
              <div key={schedule.id} className="tree-item">
                <span>{schedule.name}</span>
                <span className="muted">{schedule.nextDueOn}</span>
              </div>
            ))}
          </div>
        );
      case "reports":
        return (
          <div className="tree-section">
            <h3>Planned views</h3>
            {["Net worth", "Cash flow", "Budget variance", "Envelope burn-down"].map((item) => (
              <div key={item} className="tree-item">
                <span>{item}</span>
                <span className="muted">Roadmap</span>
              </div>
            ))}
          </div>
        );
    }
  }

  function renderInspectorContent() {
    switch (activeView) {
      case "overview":
        return (
          <>
            <div className="inspector-section">
              <h3>Integrity</h3>
              <div className="status-list">
                <div className="status-item">
                  <span>Ledger checks</span>
                  <strong>{ledgerValidationErrors.length === 0 ? "Passing" : "Issues found"}</strong>
                </div>
                <div className="status-item">
                  <span>Budget checks</span>
                  <strong>{budgetConfigurationErrors.length === 0 ? "Passing" : "Issues found"}</strong>
                </div>
              </div>
            </div>

            <div className="inspector-section">
              <h3>Desktop direction</h3>
              <p>
                The desktop shell is intended to be dense, keyboard-first, and workspace-oriented,
                while mobile remains focused on capture and approvals.
              </p>
            </div>
          </>
        );
      case "ledger":
        return (
          <>
            <div className="inspector-section">
              <h3>Compliance</h3>
              <p>
                Transactions must balance and reconciliation sessions must tie cleared ledger activity
                to a statement boundary.
              </p>
              <div className="status-list">
                <div className="status-item">
                  <span>Ledger checks</span>
                  <strong>{ledgerValidationErrors.length === 0 ? "Passing" : "Issues found"}</strong>
                </div>
              </div>
            </div>

            <div className="inspector-section">
              <h3>Account drill-down</h3>
              {ledgerWorkspace.selectedAccount ? (
                <div className="detail-stack">
                  <div className="status-item">
                    <span>Account</span>
                    <strong>{ledgerWorkspace.selectedAccount.name}</strong>
                  </div>
                  <div className="status-item">
                    <span>Type</span>
                    <strong>{ledgerWorkspace.selectedAccount.type}</strong>
                  </div>
                  <div className="status-item">
                    <span>Register matches</span>
                    <strong>{ledgerWorkspace.selectedAccount.transactionCount}</strong>
                  </div>
                </div>
              ) : (
                <p>Select an account from the sidebar or balance list to narrow the register.</p>
              )}
            </div>

            <div className="inspector-section">
              <h3>Selected transaction</h3>
              {ledgerWorkspace.selectedTransaction ? (
                <div className="detail-stack">
                  <div className="status-item">
                    <span>Description</span>
                    <strong>{ledgerWorkspace.selectedTransaction.description}</strong>
                  </div>
                  <div className="status-item">
                    <span>Date</span>
                    <strong>{ledgerWorkspace.selectedTransaction.occurredOn}</strong>
                  </div>
                  <div className="status-item">
                    <span>Payee</span>
                    <strong>{ledgerWorkspace.selectedTransaction.payee ?? "Unassigned"}</strong>
                  </div>
                  <div className="status-item">
                    <span>Splits</span>
                    <strong>{ledgerWorkspace.selectedTransaction.postings.length}</strong>
                  </div>
                  <div className="status-item">
                    <span>Tags</span>
                    <strong>
                      {ledgerWorkspace.selectedTransaction.tags.length > 0
                        ? ledgerWorkspace.selectedTransaction.tags.join(", ")
                        : "None"}
                    </strong>
                  </div>
                </div>
              ) : (
                <p>Select a register row to open the detail pane in the main workspace.</p>
              )}
            </div>

            <div className="inspector-section">
              <h3>Next desktop lift</h3>
              <p>Native split reordering, faster keyboard-only editing, and a desktop wrapper evaluation are the natural next ledger slices.</p>
            </div>
          </>
        );
      case "budget":
        return (
          <div className="inspector-section">
            <h3>Planning rules</h3>
            <p>
              Baseline budgets remain the plan of record and should target expense or income categories
              rather than cash accounts.
            </p>
          </div>
        );
      case "envelopes":
        return (
          <div className="inspector-section">
            <h3>Envelope guardrails</h3>
            <p>
              Envelope funding remains asset-backed cash allocation. It never bypasses the ledger or
              invents balances outside the funding accounts.
            </p>
          </div>
        );
      case "imports":
        return (
          <div className="inspector-section">
            <h3>Import guardrails</h3>
            <p>
              Import adapters must preserve source traceability, deduplicate safely, and reject
              malformed payloads at the service boundary.
            </p>
          </div>
        );
      case "automations":
        return (
          <>
            <div className="inspector-section">
              <h3>Automation</h3>
              <p>
                Recurring templates are materialized into future ledger entries without bypassing review.
                Due items become normal transactions tied back to their schedule.
              </p>
            </div>

            <div className="inspector-section">
              <h3>Queue status</h3>
              {dueTransactions.length > 0 ? (
                dueTransactions.map((transaction) => (
                  <div key={transaction.id} className="status-item">
                    <span>{transaction.description}</span>
                    <strong>{transaction.occurredOn}</strong>
                  </div>
                ))
              ) : (
                <div className="status-item">
                  <span>Due items</span>
                  <strong>None in April</strong>
                </div>
              )}
            </div>
          </>
        );
      case "reports":
        return (
          <div className="inspector-section">
            <h3>Roadmap note</h3>
            <p>
              Reporting and close workflow are tracked separately from operational UI so the desktop shell
              has a dedicated destination ready when those services land.
            </p>
          </div>
        );
    }
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
