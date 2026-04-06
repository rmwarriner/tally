import type { WorkspaceView } from "./shell";
import { WORKSPACE_ID } from "./app-constants";

interface NonLedgerMainPanelsProps {
  activeView: WorkspaceView;
  [key: string]: any;
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
    getWorkspaceViewDefinition,
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
    setScheduleForm,
    topBudgetVarianceRows,
    workspaceEnvelopes,
  } = props;

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
              {overviewCards.map((card: any) => {
                const targetView = getWorkspaceViewDefinition(card.id);

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
                {recentTransactions.map((transaction: any) => (
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
            {topBudgetVarianceRows.map((row: any) => (
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
              dueTransactions.map((transaction: any) => (
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
            {baselineSnapshot.map((row: any) => (
              <div key={row.accountId} className="metric-row metric-grid">
                <span>{row.accountName}</span>
                <span className="muted">Plan {formatCurrency(row.planned.quantity)}</span>
                <span className="muted">Actual {formatCurrency(row.actual.quantity)}</span>
                <strong>{formatCurrency(row.variance.quantity)} left</strong>
              </div>
            ))}
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
                  await postBaselineBudgetLine(WORKSPACE_ID, {
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
                    setBudgetLineForm((current: any) => ({ ...current, accountId: event.target.value }))
                  }
                >
                  {expenseAccounts.map((account: any) => (
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
                    setBudgetLineForm((current: any) => ({ ...current, period: event.target.value }))
                  }
                />
              </label>
              <label>
                Budget period
                <select
                  value={budgetLineForm.budgetPeriod}
                  onChange={(event) =>
                    setBudgetLineForm((current: any) => ({ ...current, budgetPeriod: event.target.value }))
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
                    setBudgetLineForm((current: any) => ({ ...current, plannedAmount: event.target.value }))
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
            {envelopeSnapshot.map((envelope: any) => (
              <div key={envelope.envelopeId} className="metric-row metric-grid">
                <span>{envelope.name}</span>
                <span className="muted">Funded {formatCurrency(envelope.funded.quantity)}</span>
                <span className="muted">Spent {formatCurrency(envelope.spent.quantity)}</span>
                <strong>{formatCurrency(envelope.available.quantity)} available</strong>
              </div>
            ))}
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
                  await postEnvelope(WORKSPACE_ID, {
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
                    setEnvelopeForm((current: any) => ({ ...current, id: event.target.value }))
                  }
                />
              </label>
              <label>
                Name
                <input
                  value={envelopeForm.name}
                  onChange={(event) =>
                    setEnvelopeForm((current: any) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label>
                Expense account
                <select
                  value={envelopeForm.expenseAccountId}
                  onChange={(event) =>
                    setEnvelopeForm((current: any) => ({
                      ...current,
                      expenseAccountId: event.target.value,
                    }))
                  }
                >
                  {expenseAccounts.map((account: any) => (
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
                    setEnvelopeForm((current: any) => ({
                      ...current,
                      fundingAccountId: event.target.value,
                    }))
                  }
                >
                  {fundingAccounts.map((account: any) => (
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
                      setEnvelopeForm((current: any) => ({
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
                      setEnvelopeForm((current: any) => ({
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
                    setEnvelopeForm((current: any) => ({
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
                  await postEnvelopeAllocation(WORKSPACE_ID, {
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
                    setEnvelopeAllocationForm((current: any) => ({
                      ...current,
                      envelopeId: event.target.value,
                    }))
                  }
                >
                  {workspaceEnvelopes.map((envelope: any) => (
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
                      setEnvelopeAllocationForm((current: any) => ({
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
                      setEnvelopeAllocationForm((current: any) => ({
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
                    setEnvelopeAllocationForm((current: any) => ({
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
                    setEnvelopeAllocationForm((current: any) => ({ ...current, note: event.target.value }))
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
                  await postCsvImport(WORKSPACE_ID, {
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
                    setCsvForm((current: any) => ({ ...current, sourceLabel: event.target.value }))
                  }
                />
              </label>
              <label>
                CSV rows
                <textarea
                  rows={6}
                  value={csvForm.csvText}
                  onChange={(event) =>
                    setCsvForm((current: any) => ({ ...current, csvText: event.target.value }))
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
            {nextScheduledTransactions.map((schedule: any) => (
              <div key={schedule.id} className="metric-row">
                <span>{schedule.name}</span>
                <strong>{schedule.nextDueOn}</strong>
              </div>
            ))}
          </article>

          <article className="panel">
            <div className="panel-header">
              <span>Due items</span>
              <span className="muted">Materialization queue</span>
            </div>
            {dueTransactions.length > 0 ? (
              dueTransactions.map((transaction: any) => (
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
                  await postScheduledTransaction(WORKSPACE_ID, {
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
                    setScheduleForm((current: any) => ({ ...current, id: event.target.value }))
                  }
                />
              </label>
              <label>
                Name
                <input
                  value={scheduleForm.name}
                  onChange={(event) =>
                    setScheduleForm((current: any) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <div className="form-inline">
                <label>
                  Frequency
                  <select
                    value={scheduleForm.frequency}
                    onChange={(event) =>
                      setScheduleForm((current: any) => ({ ...current, frequency: event.target.value }))
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
                      setScheduleForm((current: any) => ({ ...current, nextDueOn: event.target.value }))
                    }
                  />
                </label>
              </div>
              <label>
                Description
                <input
                  value={scheduleForm.description}
                  onChange={(event) =>
                    setScheduleForm((current: any) => ({ ...current, description: event.target.value }))
                  }
                />
              </label>
              <label>
                Payee
                <input
                  value={scheduleForm.payee}
                  onChange={(event) =>
                    setScheduleForm((current: any) => ({ ...current, payee: event.target.value }))
                  }
                />
              </label>
              <div className="form-inline">
                <label>
                  Expense account
                  <select
                    value={scheduleForm.expenseAccountId}
                    onChange={(event) =>
                      setScheduleForm((current: any) => ({
                        ...current,
                        expenseAccountId: event.target.value,
                      }))
                    }
                  >
                    {expenseAccounts.map((account: any) => (
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
                      setScheduleForm((current: any) => ({
                        ...current,
                        fundingAccountId: event.target.value,
                      }))
                    }
                  >
                    {fundingAccounts.map((account: any) => (
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
                    setScheduleForm((current: any) => ({ ...current, amount: event.target.value }))
                  }
                />
              </label>
              <label className="checkbox-row">
                <input
                  checked={scheduleForm.autoPost}
                  type="checkbox"
                  onChange={(event) =>
                    setScheduleForm((current: any) => ({ ...current, autoPost: event.target.checked }))
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
    default:
      return null;
  }
}
