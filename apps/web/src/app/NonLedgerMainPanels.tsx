import { useState, type Dispatch, type SetStateAction } from "react";
import type { CsvImportRow } from "@tally/book";
import type {
  DashboardResponse,
  BookResponse,
  postBaselineBudgetLine,
  postCsvImport,
  postEnvelope,
  postEnvelopeAllocation,
  postScheduledTransaction,
} from "./api";
import { BOOK_ID } from "./app-constants";
import type { AmountStyle } from "./app-format";
import type {
  BudgetLineFormState,
  CsvFormState,
  EnvelopeAllocationFormState,
  EnvelopeFormState,
  ScheduleFormState,
} from "./non-ledger-state";
import type { OverviewCard, BookView, BookViewDefinition } from "./shell";
import type { AppPreferences, Density, Theme } from "./use-preferences";

interface NonLedgerMainPanelsProps {
  activeView: BookView;
  baselineSnapshot: DashboardResponse["dashboard"]["budgetSnapshot"];
  budgetLineForm: BudgetLineFormState;
  busy: string | null;
  createEntityId: (prefix: string) => string;
  csvForm: CsvFormState;
  dueTransactions: DashboardResponse["dashboard"]["dueTransactions"];
  envelopeAllocationForm: EnvelopeAllocationFormState;
  envelopeForm: EnvelopeFormState;
  envelopeSnapshot: DashboardResponse["dashboard"]["envelopeSnapshot"];
  expenseAccounts: BookResponse["book"]["accounts"];
  formatCurrency: (amount: number) => string;
  fundingAccounts: BookResponse["book"]["accounts"];
  getBookViewDefinition: (view: BookView) => BookViewDefinition;
  nextScheduledTransactions: BookResponse["book"]["scheduledTransactions"];
  overviewCards: OverviewCard[];
  parseCsvRows: (input: string) => CsvImportRow[];
  postBaselineBudgetLine: typeof postBaselineBudgetLine;
  postCsvImport: typeof postCsvImport;
  postEnvelope: typeof postEnvelope;
  postEnvelopeAllocation: typeof postEnvelopeAllocation;
  postScheduledTransaction: typeof postScheduledTransaction;
  recentTransactions: BookResponse["book"]["transactions"];
  runMutation: (label: string, operation: () => Promise<void>) => Promise<void>;
  scheduleForm: ScheduleFormState;
  setActiveView: (view: BookView) => void;
  setBudgetLineForm: Dispatch<SetStateAction<BudgetLineFormState>>;
  setCsvForm: Dispatch<SetStateAction<CsvFormState>>;
  setEnvelopeAllocationForm: Dispatch<SetStateAction<EnvelopeAllocationFormState>>;
  setEnvelopeForm: Dispatch<SetStateAction<EnvelopeFormState>>;
  setAmountStyle: (value: AmountStyle) => void;
  setDensity: (value: Density) => void;
  setScheduleForm: Dispatch<SetStateAction<ScheduleFormState>>;
  setTheme: (value: Theme) => void;
  topBudgetVarianceRows: DashboardResponse["dashboard"]["budgetSnapshot"];
  bookEnvelopes: BookResponse["book"]["envelopes"];
  preferences: AppPreferences;
}

export function NonLedgerMainPanels(props: NonLedgerMainPanelsProps) {
  const {
    baselineSnapshot,
    budgetLineForm,
    busy,
    createEntityId,
    csvForm,
    dueTransactions,
    envelopeAllocationForm,
    envelopeForm,
    envelopeSnapshot,
    expenseAccounts,
    formatCurrency,
    fundingAccounts,
    getBookViewDefinition,
    nextScheduledTransactions,
    overviewCards,
    parseCsvRows,
    postBaselineBudgetLine,
    postCsvImport,
    postEnvelope,
    postEnvelopeAllocation,
    postScheduledTransaction,
    recentTransactions,
    runMutation,
    scheduleForm,
    setActiveView,
    setBudgetLineForm,
    setCsvForm,
    setEnvelopeAllocationForm,
    setEnvelopeForm,
    setAmountStyle,
    setDensity,
    setScheduleForm,
    setTheme,
    topBudgetVarianceRows,
    bookEnvelopes,
    preferences,
  } = props;
  const [inlineBudgetDrafts, setInlineBudgetDrafts] = useState<
    Record<
      string,
      {
        budgetPeriod: "annually" | "monthly" | "quarterly";
        period: string;
        plannedAmount: string;
      }
    >
  >({});
  const [inlineEnvelopeDrafts, setInlineEnvelopeDrafts] = useState<
    Record<
      string,
      {
        availableAmount: string;
        name: string;
        rolloverEnabled: boolean;
        targetAmount: string;
      }
    >
  >({});
  const [inlineScheduleDrafts, setInlineScheduleDrafts] = useState<
    Record<
      string,
      {
        amount: string;
        autoPost: boolean;
        frequency: "annually" | "biweekly" | "daily" | "monthly" | "quarterly" | "weekly";
        name: string;
        nextDueOn: string;
      }
    >
  >({});

  switch (props.activeView) {
    case "overview":
      return (
        <>
          <article className="panel overview-panel">
            <div className="panel-header">
              <span>Workspace modes</span>
              <span className="muted">Desktop command center</span>
            </div>
            <div className="overview-card-grid">
              {overviewCards.map((card) => {
                const targetView = getBookViewDefinition(card.id);

                return (
                  <button
                    key={card.id}
                    className="overview-card"
                    type="button"
                    onClick={() => setActiveView(card.id)}
                  >
                    <span className="overview-card-metric">{card.metric}</span>
                    <strong>{targetView.label}</strong>
                    <span>{card.summary}</span>
                  </button>
                );
              })}
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <span>Recent register activity</span>
              <span className="muted">Latest ledger entries</span>
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
                {recentTransactions.map((transaction) => (
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
              <span>Budget drift</span>
              <span className="muted">Largest variances</span>
            </div>
            {topBudgetVarianceRows.map((row) => (
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
              <span>Due schedule queue</span>
              <span className="muted">Next automations</span>
            </div>
            {dueTransactions.length > 0 ? (
              dueTransactions.map((transaction) => (
                <div key={transaction.id} className="metric-row">
                  <span>{transaction.description}</span>
                  <strong>{transaction.occurredOn}</strong>
                </div>
              ))
            ) : (
              <div className="metric-row">
                <span>Due items</span>
                <strong>None in April</strong>
              </div>
            )}
          </article>
        </>
      );
    case "budget":
      return (
        <>
          <article className="panel">
            <div className="panel-header">
              <span>Baseline Budget</span>
              <span className="muted">Plan of record</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Period</th>
                  <th>Budget period</th>
                  <th>Planned</th>
                  <th>Actual</th>
                  <th>Variance</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {baselineSnapshot.map((row) => {
                  const draft = inlineBudgetDrafts[row.accountId] ?? {
                    budgetPeriod: "monthly",
                    period: budgetLineForm.period,
                    plannedAmount: String(row.planned.quantity),
                  };
                  return (
                    <tr key={row.accountId}>
                      <td>{row.accountName}</td>
                      <td>
                        <input
                          value={draft.period}
                          onChange={(event) =>
                            setInlineBudgetDrafts((current) => ({
                              ...current,
                              [row.accountId]: {
                                ...draft,
                                period: event.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={draft.budgetPeriod}
                          onChange={(event) =>
                            setInlineBudgetDrafts((current) => ({
                              ...current,
                              [row.accountId]: {
                                ...draft,
                                budgetPeriod: event.target.value as "annually" | "monthly" | "quarterly",
                              },
                            }))
                          }
                        >
                          <option value="monthly">Monthly</option>
                          <option value="quarterly">Quarterly</option>
                          <option value="annually">Annually</option>
                        </select>
                      </td>
                      <td>
                        <input
                          value={draft.plannedAmount}
                          onChange={(event) =>
                            setInlineBudgetDrafts((current) => ({
                              ...current,
                              [row.accountId]: {
                                ...draft,
                                plannedAmount: event.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                      <td>{formatCurrency(row.actual.quantity)}</td>
                      <td>{formatCurrency(row.variance.quantity)}</td>
                      <td>
                        <button
                          disabled={busy !== null}
                          type="button"
                          onClick={() => {
                            void runMutation("Budget line save", async () => {
                              await postBaselineBudgetLine(BOOK_ID, {
                                line: {
                                  accountId: row.accountId,
                                  budgetPeriod: draft.budgetPeriod,
                                  period: draft.period,
                                  plannedAmount: {
                                    commodityCode: "USD",
                                    quantity: Number.parseFloat(draft.plannedAmount),
                                  },
                                },
                              });
                            });
                          }}
                        >
                          Save row
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
                  await postBaselineBudgetLine(BOOK_ID, {
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
                    setBudgetLineForm((current) => ({
                      ...current,
                      budgetPeriod: event.target.value as "annually" | "monthly" | "quarterly",
                    }))
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
                    setBudgetLineForm((current) => ({ ...current, plannedAmount: event.target.value }))
                  }
                />
              </label>
              <button type="submit" disabled={busy !== null}>
                {busy === "Budget line save" ? "Saving..." : "Save budget line"}
              </button>
            </form>
          </article>
        </>
      );
    case "envelopes":
      return (
        <>
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
              <span>Envelope quick edit</span>
              <span className="muted">Inline-first adjustments</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Target</th>
                  <th>Available</th>
                  <th>Rollover</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookEnvelopes.map((envelope) => {
                  const draft = inlineEnvelopeDrafts[envelope.id] ?? {
                    availableAmount: String(envelope.availableAmount?.quantity ?? 0),
                    name: envelope.name,
                    rolloverEnabled: Boolean(envelope.rolloverEnabled),
                    targetAmount: String(envelope.targetAmount?.quantity ?? 0),
                  };
                  return (
                    <tr key={envelope.id}>
                      <td>
                        <input
                          value={draft.name}
                          onChange={(event) =>
                            setInlineEnvelopeDrafts((current) => ({
                              ...current,
                              [envelope.id]: {
                                ...draft,
                                name: event.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={draft.targetAmount}
                          onChange={(event) =>
                            setInlineEnvelopeDrafts((current) => ({
                              ...current,
                              [envelope.id]: {
                                ...draft,
                                targetAmount: event.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={draft.availableAmount}
                          onChange={(event) =>
                            setInlineEnvelopeDrafts((current) => ({
                              ...current,
                              [envelope.id]: {
                                ...draft,
                                availableAmount: event.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <label className="checkbox-row">
                          <input
                            checked={draft.rolloverEnabled}
                            type="checkbox"
                            onChange={(event) =>
                              setInlineEnvelopeDrafts((current) => ({
                                ...current,
                                [envelope.id]: {
                                  ...draft,
                                  rolloverEnabled: event.target.checked,
                                },
                              }))
                            }
                          />
                          <span>Enabled</span>
                        </label>
                      </td>
                      <td>
                        <button
                          disabled={busy !== null}
                          type="button"
                          onClick={() => {
                            void runMutation("Envelope save", async () => {
                              await postEnvelope(BOOK_ID, {
                                envelope: {
                                  availableAmount: {
                                    commodityCode: "USD",
                                    quantity: Number.parseFloat(draft.availableAmount),
                                  },
                                  expenseAccountId: envelope.expenseAccountId,
                                  fundingAccountId: envelope.fundingAccountId,
                                  id: envelope.id,
                                  name: draft.name,
                                  rolloverEnabled: draft.rolloverEnabled,
                                  targetAmount: {
                                    commodityCode: "USD",
                                    quantity: Number.parseFloat(draft.targetAmount),
                                  },
                                },
                              });
                            });
                          }}
                        >
                          Save row
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
                  await postEnvelope(BOOK_ID, {
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
                  await postEnvelopeAllocation(BOOK_ID, {
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
                  {bookEnvelopes.map((envelope) => (
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
                      type: event.target.value as "cover-overspend" | "fund" | "release",
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
                    setEnvelopeAllocationForm((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
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
        </>
      );
    case "imports":
      return (
        <>
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
                  await postCsvImport(BOOK_ID, {
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
                  rows={6}
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

          <article className="panel roadmap-panel">
            <div className="panel-header">
              <span>Interchange roadmap</span>
              <span className="muted">Next adapters</span>
            </div>
            <div className="roadmap-list">
              {["OFX / QFX bank feeds", "QIF import and export", "GnuCash XML and compressed XML"].map(
                (item) => (
                  <div key={item} className="metric-row">
                    <span>{item}</span>
                    <strong>Planned</strong>
                  </div>
                ),
              )}
            </div>
          </article>
        </>
      );
    case "automations":
      return (
        <>
          <article className="panel">
            <div className="panel-header">
              <span>Schedule queue</span>
              <span className="muted">Recurring templates</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Frequency</th>
                  <th>Next due</th>
                  <th>Amount</th>
                  <th>Auto-post</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {nextScheduledTransactions.map((schedule) => {
                  const scheduleAmount = Number(
                    schedule.templateTransaction?.postings?.[0]?.amount?.quantity ?? 0,
                  );
                  const draft = inlineScheduleDrafts[schedule.id] ?? {
                    amount: String(scheduleAmount),
                    autoPost: Boolean(schedule.autoPost),
                    frequency: schedule.frequency,
                    name: schedule.name,
                    nextDueOn: schedule.nextDueOn,
                  };
                  return (
                    <tr key={schedule.id}>
                      <td>
                        <input
                          value={draft.name}
                          onChange={(event) =>
                            setInlineScheduleDrafts((current) => ({
                              ...current,
                              [schedule.id]: {
                                ...draft,
                                name: event.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={draft.frequency}
                          onChange={(event) =>
                            setInlineScheduleDrafts((current) => ({
                              ...current,
                              [schedule.id]: {
                                ...draft,
                                frequency: event.target.value as
                                  | "annually"
                                  | "biweekly"
                                  | "daily"
                                  | "monthly"
                                  | "quarterly"
                                  | "weekly",
                              },
                            }))
                          }
                        >
                          <option value="monthly">Monthly</option>
                          <option value="weekly">Weekly</option>
                          <option value="biweekly">Biweekly</option>
                          <option value="quarterly">Quarterly</option>
                          <option value="annually">Annually</option>
                          <option value="daily">Daily</option>
                        </select>
                      </td>
                      <td>
                        <input
                          value={draft.nextDueOn}
                          onChange={(event) =>
                            setInlineScheduleDrafts((current) => ({
                              ...current,
                              [schedule.id]: {
                                ...draft,
                                nextDueOn: event.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={draft.amount}
                          onChange={(event) =>
                            setInlineScheduleDrafts((current) => ({
                              ...current,
                              [schedule.id]: {
                                ...draft,
                                amount: event.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <label className="checkbox-row">
                          <input
                            checked={draft.autoPost}
                            type="checkbox"
                            onChange={(event) =>
                              setInlineScheduleDrafts((current) => ({
                                ...current,
                                [schedule.id]: {
                                  ...draft,
                                  autoPost: event.target.checked,
                                },
                              }))
                            }
                          />
                          <span>Enabled</span>
                        </label>
                      </td>
                      <td>
                        <button
                          disabled={busy !== null}
                          type="button"
                          onClick={() => {
                            const amount = Number.parseFloat(draft.amount);
                            void runMutation("Schedule save", async () => {
                              await postScheduledTransaction(BOOK_ID, {
                                schedule: {
                                  ...schedule,
                                  autoPost: draft.autoPost,
                                  frequency: draft.frequency,
                                  name: draft.name,
                                  nextDueOn: draft.nextDueOn,
                                  templateTransaction: {
                                    ...schedule.templateTransaction,
                                    postings: [
                                      {
                                        ...schedule.templateTransaction.postings[0],
                                        amount: { commodityCode: "USD", quantity: amount },
                                      },
                                      {
                                        ...schedule.templateTransaction.postings[1],
                                        amount: { commodityCode: "USD", quantity: -amount },
                                      },
                                    ],
                                  },
                                },
                              });
                            });
                          }}
                        >
                          Save row
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </article>

          <article className="panel">
            <div className="panel-header">
              <span>Due items</span>
              <span className="muted">Materialization queue</span>
            </div>
            {dueTransactions.length > 0 ? (
              dueTransactions.map((transaction) => (
                <div key={transaction.id} className="metric-row">
                  <span>{transaction.description}</span>
                  <strong>{transaction.occurredOn}</strong>
                </div>
              ))
            ) : (
              <div className="metric-row">
                <span>Due items</span>
                <strong>None in April</strong>
              </div>
            )}
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
                  await postScheduledTransaction(BOOK_ID, {
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
                      setScheduleForm((current) => ({
                        ...current,
                        frequency:
                          event.target.value as
                            | "annually"
                            | "biweekly"
                            | "daily"
                            | "monthly"
                            | "quarterly"
                            | "weekly",
                      }))
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
                    setScheduleForm((current) => ({ ...current, description: event.target.value }))
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
        </>
      );
    case "reports":
      return (
        <article className="panel empty-panel">
          <div className="panel-header">
            <span>Reporting workbench</span>
            <span className="muted">Roadmap</span>
          </div>
          <p>
            Reporting and close workflow are planned roadmap work. The desktop shell now reserves a
            dedicated surface for those flows instead of overloading the operational screens.
          </p>
        </article>
      );
    case "settings":
      return (
        <article className="panel">
          <div className="panel-header">
            <span>Display</span>
            <span className="muted">Workspace preferences</span>
          </div>
          <div className="form-stack">
            <fieldset>
              <legend className="eyebrow">Theme</legend>
              <div className="ledger-chip-row">
                {(["light", "dark", "gruvbox"] as const).map((theme) => (
                  <label
                    key={theme}
                    className={`ledger-chip${preferences.theme === theme ? " active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="theme"
                      value={theme}
                      checked={preferences.theme === theme}
                      onChange={() => setTheme(theme)}
                      style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
                    />
                    {theme === "gruvbox" ? "Gruvbox" : theme.charAt(0).toUpperCase() + theme.slice(1)}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="eyebrow">Register density</legend>
              <div className="ledger-chip-row">
                {(["comfortable", "compact"] as const).map((density) => (
                  <label
                    key={density}
                    className={`ledger-chip${preferences.density === density ? " active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="density"
                      value={density}
                      checked={preferences.density === density}
                      onChange={() => setDensity(density)}
                      style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
                    />
                    {density.charAt(0).toUpperCase() + density.slice(1)}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="eyebrow">Amount display</legend>
              <div className="ledger-chip-row">
                {([
                  { value: "both", label: "Colour + sign" },
                  { value: "color", label: "Colour only" },
                  { value: "sign", label: "Sign only" },
                ] as const).map(({ value, label }) => (
                  <label
                    key={value}
                    className={`ledger-chip${preferences.amountStyle === value ? " active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="amountStyle"
                      value={value}
                      checked={preferences.amountStyle === value}
                      onChange={() => setAmountStyle(value)}
                      style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </article>
      );
    default:
      return null;
  }
}
