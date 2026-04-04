import { useEffect, useState } from "react";
import { colors, typography } from "@gnucash-ng/ui";
import {
  fetchDashboard,
  fetchWorkspace,
  postBaselineBudgetLine,
  postCsvImport,
  postEnvelope,
  postEnvelopeAllocation,
  postReconciliation,
  postScheduledTransaction,
  postTransaction,
  type DashboardResponse,
  type WorkspaceResponse,
} from "./api";
import "../app/styles.css";

const aprilRange = { from: "2026-04-01", to: "2026-04-30" };
const workspaceId = "workspace-household-demo";

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function createTransactionId(): string {
  return `txn-web-${Date.now()}`;
}

function createEntityId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

function parseCsvRows(csvText: string) {
  return csvText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [occurredOn, description, amount, counterpartAccountId, cashAccountId] = line.split(",");

      return {
        occurredOn: occurredOn.trim(),
        description: description.trim(),
        amount: Number.parseFloat(amount.trim()),
        counterpartAccountId: counterpartAccountId.trim(),
        cashAccountId: cashAccountId.trim(),
      };
    });
}

export function App() {
  const [dashboard, setDashboard] = useState<DashboardResponse["dashboard"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceResponse["workspace"] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [transactionForm, setTransactionForm] = useState({
    amount: "65.00",
    date: "2026-04-03",
    description: "Internet bill",
    expenseAccountId: "acct-expense-utilities",
    payee: "Provider",
  });
  const [reconciliationForm, setReconciliationForm] = useState({
    accountId: "acct-checking",
    clearedTransactionIds: "txn-paycheck-1,txn-grocery-1",
    statementBalance: "3051.58",
    statementDate: "2026-04-02",
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

  async function loadWorkspaceData() {
    setLoading(true);
    setError(null);

    try {
      const [workspaceResponse, dashboardResponse] = await Promise.all([
        fetchWorkspace(workspaceId),
        fetchDashboard({ ...aprilRange, workspaceId }),
      ]);

      setWorkspace(workspaceResponse.workspace);
      setDashboard(dashboardResponse.dashboard);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load workspace.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkspaceData();
  }, []);

  if (loading) {
    return (
      <ShellState
        title="Loading workspace"
        message="Fetching finance workspace and dashboard projections from the service layer."
      />
    );
  }

  if (error || !workspace || !dashboard) {
    return (
      <ShellState
        title="Service unavailable"
        message={error ?? "Workspace data could not be loaded from the API."}
      />
    );
  }

  const expenseAccounts = workspace.accounts.filter((account) => account.type === "expense");
  const liquidAccounts = workspace.accounts.filter(
    (account) => account.type === "asset" || account.type === "liability",
  );
  const fundingAccounts = workspace.accounts.filter((account) => account.type === "asset");
  const {
    budgetSnapshot: baselineSnapshot,
    envelopeSnapshot,
    accountBalances,
    netWorth,
    dueTransactions,
    budgetErrors: budgetConfigurationErrors,
    ledgerErrors: ledgerValidationErrors,
  } = dashboard;

  async function runMutation(label: string, operation: () => Promise<void>) {
    try {
      setBusy(label);
      setStatusMessage(null);
      setError(null);
      await operation();
      await loadWorkspaceData();
      setStatusMessage(`${label} completed.`);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : `${label} failed.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="workspace">
      <aside className="activity-bar">
        <div className="brand">GN</div>
        <nav>
          {["Ledger", "Budget", "Envelopes", "Reports", "Imports", "Automations"].map((item) => (
            <button key={item} className="activity-button">
              {item.slice(0, 2).toUpperCase()}
            </button>
          ))}
        </nav>
      </aside>

      <section className="sidebar">
        <div className="panel-header">
          <span>Workspace</span>
          <span className="muted">{workspace.name}</span>
        </div>

        <div className="tree-section">
          <h3>Accounts</h3>
          {workspace.accounts.map((account) => (
            <div key={account.id} className="tree-item">
              <span>{account.name}</span>
              <span className="muted">{account.code}</span>
            </div>
          ))}
        </div>

        <div className="tree-section">
          <h3>Schedules</h3>
          {workspace.scheduledTransactions.map((schedule) => (
            <div key={schedule.id} className="tree-item">
              <span>{schedule.name}</span>
              <span className="muted">{schedule.nextDueOn}</span>
            </div>
          ))}
        </div>
      </section>

      <main className="editor-area">
        <header className="editor-header">
          <div>
            <p className="eyebrow">Active View</p>
            <h1>April operating budget</h1>
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

        <section className="editor-grid">
          <article className="panel">
            <div className="panel-header">
              <span>Register</span>
              <span className="muted">Double-entry ledger</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Payee</th>
                  <th>Tags</th>
                </tr>
              </thead>
              <tbody>
                {workspace.transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{transaction.occurredOn}</td>
                    <td>{transaction.description}</td>
                    <td>{transaction.payee}</td>
                    <td>{transaction.tags?.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>

          <article className="panel">
            <div className="panel-header">
              <span>Baseline Budget</span>
              <span className="muted">Plan of record</span>
            </div>
            {baselineSnapshot.map((row) => (
              <div key={row.accountId} className="metric-row metric-grid">
                <span>{row.accountName}</span>
                <span className="muted">Plan {formatCurrency(row.planned.quantity)}</span>
                <span className="muted">Actual {formatCurrency(row.actual.quantity)}</span>
                <strong>{formatCurrency(row.variance.quantity)} left</strong>
              </div>
            ))}
          </article>

          <article className="panel">
            <div className="panel-header">
              <span>Envelope Budget</span>
              <span className="muted">Operational cash allocation</span>
            </div>
            {envelopeSnapshot.map((envelope) => (
              <div key={envelope.envelopeId} className="metric-row metric-grid">
                <span>{envelope.name}</span>
                <span className="muted">Funded {formatCurrency(envelope.funded.quantity)}</span>
                <span className="muted">Spent {formatCurrency(envelope.spent.quantity)}</span>
                <strong>{formatCurrency(envelope.available.quantity)} available</strong>
              </div>
            ))}
          </article>

          <article className="panel">
            <div className="panel-header">
              <span>Balances</span>
              <span className="muted">As of 2026-04-30</span>
            </div>
            {accountBalances.map((balance) => (
              <div key={`${balance.accountId}:${balance.commodityCode}`} className="metric-row">
                <span>{balance.accountName}</span>
                <strong>{formatCurrency(balance.balance)}</strong>
              </div>
            ))}
          </article>

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
                  await postTransaction(workspaceId, {
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
              <span>CSV Import</span>
              <span className="muted">One row per line</span>
            </div>
            <form
              className="form-stack"
              onSubmit={(event) => {
                event.preventDefault();
                void runMutation("CSV import", async () => {
                  await postCsvImport(workspaceId, {
                    actor: "Primary",
                    payload: {
                      batchId: `import-web-${Date.now()}`,
                      importedAt: new Date().toISOString(),
                      rows: parseCsvRows(csvForm.csvText),
                      sourceLabel: csvForm.sourceLabel,
                    },
                  });
                });
              }}
            >
              <label>
                Source label
                <input
                  value={csvForm.sourceLabel}
                  onChange={(event) =>
                    setCsvForm((current) => ({ ...current, sourceLabel: event.target.value }))
                  }
                />
              </label>
              <label>
                CSV rows
                <textarea
                  rows={5}
                  value={csvForm.csvText}
                  onChange={(event) =>
                    setCsvForm((current) => ({ ...current, csvText: event.target.value }))
                  }
                />
              </label>
              <p className="form-hint">
                Format: `date,description,amount,counterpartAccountId,cashAccountId`
              </p>
              <button type="submit" disabled={busy !== null}>
                {busy === "CSV import" ? "Importing..." : "Import CSV"}
              </button>
            </form>
          </article>

          <article className="panel form-panel">
            <div className="panel-header">
              <span>Baseline Budget Edit</span>
              <span className="muted">Plan of record</span>
            </div>
            <form
              className="form-stack"
              onSubmit={(event) => {
                event.preventDefault();
                void runMutation("Budget line save", async () => {
                  await postBaselineBudgetLine(workspaceId, {
                    line: {
                      accountId: budgetLineForm.accountId,
                      budgetPeriod: budgetLineForm.budgetPeriod as "monthly" | "quarterly" | "annually",
                      period: budgetLineForm.period,
                      plannedAmount: {
                        commodityCode: "USD",
                        quantity: Number.parseFloat(budgetLineForm.plannedAmount),
                      },
                    },
                  });
                });
              }}
            >
              <label>
                Expense account
                <select
                  value={budgetLineForm.accountId}
                  onChange={(event) =>
                    setBudgetLineForm((current) => ({ ...current, accountId: event.target.value }))
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
                Period
                <input
                  value={budgetLineForm.period}
                  onChange={(event) =>
                    setBudgetLineForm((current) => ({ ...current, period: event.target.value }))
                  }
                />
              </label>
              <label>
                Budget period
                <select
                  value={budgetLineForm.budgetPeriod}
                  onChange={(event) =>
                    setBudgetLineForm((current) => ({ ...current, budgetPeriod: event.target.value }))
                  }
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annually">Annually</option>
                </select>
              </label>
              <label>
                Planned amount
                <input
                  value={budgetLineForm.plannedAmount}
                  onChange={(event) =>
                    setBudgetLineForm((current) => ({
                      ...current,
                      plannedAmount: event.target.value,
                    }))
                  }
                />
              </label>
              <button type="submit" disabled={busy !== null}>
                {busy === "Budget line save" ? "Saving..." : "Save budget line"}
              </button>
            </form>
          </article>

          <article className="panel form-panel">
            <div className="panel-header">
              <span>Envelope Setup</span>
              <span className="muted">Operational category</span>
            </div>
            <form
              className="form-stack"
              onSubmit={(event) => {
                event.preventDefault();
                void runMutation("Envelope save", async () => {
                  await postEnvelope(workspaceId, {
                    envelope: {
                      availableAmount: {
                        commodityCode: "USD",
                        quantity: Number.parseFloat(envelopeForm.availableAmount),
                      },
                      expenseAccountId: envelopeForm.expenseAccountId,
                      fundingAccountId: envelopeForm.fundingAccountId,
                      id: envelopeForm.id || createEntityId("env-web"),
                      name: envelopeForm.name,
                      rolloverEnabled: envelopeForm.rolloverEnabled,
                      targetAmount: {
                        commodityCode: "USD",
                        quantity: Number.parseFloat(envelopeForm.targetAmount),
                      },
                    },
                  });
                });
              }}
            >
              <label>
                Envelope id
                <input
                  value={envelopeForm.id}
                  onChange={(event) =>
                    setEnvelopeForm((current) => ({ ...current, id: event.target.value }))
                  }
                />
              </label>
              <label>
                Name
                <input
                  value={envelopeForm.name}
                  onChange={(event) =>
                    setEnvelopeForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label>
                Expense account
                <select
                  value={envelopeForm.expenseAccountId}
                  onChange={(event) =>
                    setEnvelopeForm((current) => ({
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
                Funding account
                <select
                  value={envelopeForm.fundingAccountId}
                  onChange={(event) =>
                    setEnvelopeForm((current) => ({
                      ...current,
                      fundingAccountId: event.target.value,
                    }))
                  }
                >
                  {fundingAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-inline">
                <label>
                  Target
                  <input
                    value={envelopeForm.targetAmount}
                    onChange={(event) =>
                      setEnvelopeForm((current) => ({
                        ...current,
                        targetAmount: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Available
                  <input
                    value={envelopeForm.availableAmount}
                    onChange={(event) =>
                      setEnvelopeForm((current) => ({
                        ...current,
                        availableAmount: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label className="checkbox-row">
                <input
                  checked={envelopeForm.rolloverEnabled}
                  type="checkbox"
                  onChange={(event) =>
                    setEnvelopeForm((current) => ({
                      ...current,
                      rolloverEnabled: event.target.checked,
                    }))
                  }
                />
                <span>Enable rollover</span>
              </label>
              <button type="submit" disabled={busy !== null}>
                {busy === "Envelope save" ? "Saving..." : "Save envelope"}
              </button>
            </form>
          </article>

          <article className="panel form-panel">
            <div className="panel-header">
              <span>Envelope Allocation</span>
              <span className="muted">Fund or release cash</span>
            </div>
            <form
              className="form-stack"
              onSubmit={(event) => {
                event.preventDefault();
                void runMutation("Envelope allocation", async () => {
                  await postEnvelopeAllocation(workspaceId, {
                    allocation: {
                      amount: {
                        commodityCode: "USD",
                        quantity: Number.parseFloat(envelopeAllocationForm.amount),
                      },
                      envelopeId: envelopeAllocationForm.envelopeId,
                      id: createEntityId("alloc-web"),
                      note: envelopeAllocationForm.note,
                      occurredOn: envelopeAllocationForm.occurredOn,
                      type: envelopeAllocationForm.type as "fund" | "release" | "cover-overspend",
                    },
                  });
                });
              }}
            >
              <label>
                Envelope
                <select
                  value={envelopeAllocationForm.envelopeId}
                  onChange={(event) =>
                    setEnvelopeAllocationForm((current) => ({
                      ...current,
                      envelopeId: event.target.value,
                    }))
                  }
                >
                  {workspace.envelopes.map((envelope) => (
                    <option key={envelope.id} value={envelope.id}>
                      {envelope.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-inline">
                <label>
                  Date
                  <input
                    value={envelopeAllocationForm.occurredOn}
                    onChange={(event) =>
                      setEnvelopeAllocationForm((current) => ({
                        ...current,
                        occurredOn: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Type
                  <select
                    value={envelopeAllocationForm.type}
                    onChange={(event) =>
                      setEnvelopeAllocationForm((current) => ({
                        ...current,
                        type: event.target.value,
                      }))
                    }
                  >
                    <option value="fund">Fund</option>
                    <option value="release">Release</option>
                    <option value="cover-overspend">Cover overspend</option>
                  </select>
                </label>
              </div>
              <label>
                Amount
                <input
                  value={envelopeAllocationForm.amount}
                  onChange={(event) =>
                    setEnvelopeAllocationForm((current) => ({ ...current, amount: event.target.value }))
                  }
                />
              </label>
              <label>
                Note
                <input
                  value={envelopeAllocationForm.note}
                  onChange={(event) =>
                    setEnvelopeAllocationForm((current) => ({ ...current, note: event.target.value }))
                  }
                />
              </label>
              <button type="submit" disabled={busy !== null}>
                {busy === "Envelope allocation" ? "Recording..." : "Record allocation"}
              </button>
            </form>
          </article>

          <article className="panel form-panel">
            <div className="panel-header">
              <span>Scheduled Transaction</span>
              <span className="muted">Automation template</span>
            </div>
            <form
              className="form-stack"
              onSubmit={(event) => {
                event.preventDefault();
                void runMutation("Schedule save", async () => {
                  const amount = Number.parseFloat(scheduleForm.amount);
                  await postScheduledTransaction(workspaceId, {
                    schedule: {
                      autoPost: scheduleForm.autoPost,
                      frequency: scheduleForm.frequency as
                        | "daily"
                        | "weekly"
                        | "biweekly"
                        | "monthly"
                        | "quarterly"
                        | "annually",
                      id: scheduleForm.id || createEntityId("sched-web"),
                      name: scheduleForm.name,
                      nextDueOn: scheduleForm.nextDueOn,
                      templateTransaction: {
                        description: scheduleForm.description,
                        payee: scheduleForm.payee,
                        postings: [
                          {
                            accountId: scheduleForm.expenseAccountId,
                            amount: { commodityCode: "USD", quantity: amount },
                          },
                          {
                            accountId: scheduleForm.fundingAccountId,
                            amount: { commodityCode: "USD", quantity: -amount },
                          },
                        ],
                        tags: ["scheduled", "web"],
                      },
                    },
                  });
                });
              }}
            >
              <label>
                Schedule id
                <input
                  value={scheduleForm.id}
                  onChange={(event) =>
                    setScheduleForm((current) => ({ ...current, id: event.target.value }))
                  }
                />
              </label>
              <label>
                Name
                <input
                  value={scheduleForm.name}
                  onChange={(event) =>
                    setScheduleForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <div className="form-inline">
                <label>
                  Frequency
                  <select
                    value={scheduleForm.frequency}
                    onChange={(event) =>
                      setScheduleForm((current) => ({ ...current, frequency: event.target.value }))
                    }
                  >
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annually">Annually</option>
                    <option value="daily">Daily</option>
                  </select>
                </label>
                <label>
                  Next due
                  <input
                    value={scheduleForm.nextDueOn}
                    onChange={(event) =>
                      setScheduleForm((current) => ({ ...current, nextDueOn: event.target.value }))
                    }
                  />
                </label>
              </div>
              <label>
                Description
                <input
                  value={scheduleForm.description}
                  onChange={(event) =>
                    setScheduleForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Payee
                <input
                  value={scheduleForm.payee}
                  onChange={(event) =>
                    setScheduleForm((current) => ({ ...current, payee: event.target.value }))
                  }
                />
              </label>
              <div className="form-inline">
                <label>
                  Expense account
                  <select
                    value={scheduleForm.expenseAccountId}
                    onChange={(event) =>
                      setScheduleForm((current) => ({
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
                  Funding account
                  <select
                    value={scheduleForm.fundingAccountId}
                    onChange={(event) =>
                      setScheduleForm((current) => ({
                        ...current,
                        fundingAccountId: event.target.value,
                      }))
                    }
                  >
                    {fundingAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Amount
                <input
                  value={scheduleForm.amount}
                  onChange={(event) =>
                    setScheduleForm((current) => ({ ...current, amount: event.target.value }))
                  }
                />
              </label>
              <label className="checkbox-row">
                <input
                  checked={scheduleForm.autoPost}
                  type="checkbox"
                  onChange={(event) =>
                    setScheduleForm((current) => ({ ...current, autoPost: event.target.checked }))
                  }
                />
                <span>Auto-post when due</span>
              </label>
              <button type="submit" disabled={busy !== null}>
                {busy === "Schedule save" ? "Saving..." : "Save schedule"}
              </button>
            </form>
          </article>
        </section>
      </main>

      <aside className="inspector">
        <div className="panel-header">
          <span>Inspector</span>
          <span className="muted">GAAP-aligned controls</span>
        </div>

        <div className="inspector-section">
          <h3>Compliance</h3>
          <p>Transactions must balance, budgets target income or expense accounts, and envelope funding is restricted to asset-backed cash sources.</p>
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
          <h3>Reconcile</h3>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void runMutation("Reconciliation", async () => {
                await postReconciliation(workspaceId, {
                  actor: "Primary",
                  payload: {
                    accountId: reconciliationForm.accountId,
                    clearedTransactionIds: reconciliationForm.clearedTransactionIds
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
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
                  setReconciliationForm((current) => ({
                    ...current,
                    accountId: event.target.value,
                  }))
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
            <label>
              Cleared transaction ids
              <textarea
                rows={3}
                value={reconciliationForm.clearedTransactionIds}
                onChange={(event) =>
                  setReconciliationForm((current) => ({
                    ...current,
                    clearedTransactionIds: event.target.value,
                  }))
                }
              />
            </label>
            <button type="submit" disabled={busy !== null}>
              {busy === "Reconciliation" ? "Reconciling..." : "Record reconciliation"}
            </button>
          </form>
        </div>

        <div className="inspector-section">
          <h3>Automation</h3>
          <p>Recurring templates are materialized into future ledger entries without bypassing review. Due items become normal transactions tied back to their schedule.</p>
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

        <div className="inspector-section">
          <h3>Mobile support</h3>
          <p>Quick capture, receipt attachments, approval prompts, and envelope transfers are designed as focused actions rather than full desktop workspace clones.</p>
        </div>
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

function ShellState(props: { message: string; title: string }) {
  return (
    <main className="shell-state">
      <h1>{props.title}</h1>
      <p>{props.message}</p>
    </main>
  );
}
