import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { WorkspaceResponse } from "./api";
import { getSplitQuickEditKeyAction, type LedgerInlineRowEditDraft } from "./ledger-state";
import { type createLedgerWorkspaceModel } from "./shell";

interface InlineNewTransactionDraft {
  amount: string;
  date: string;
  description: string;
  expenseAccountId: string;
  payee: string;
}

interface InlineSplitDraft {
  amount: string;
  cleared: boolean;
  memo: string;
}

interface LedgerRegisterPanelProps {
  busy: string | null;
  expenseAccounts: WorkspaceResponse["workspace"]["accounts"];
  formatCurrency: (amount: number) => string;
  formatTransactionStatus: (status: "cleared" | "open" | "reconciled") => string;
  ledgerRange: { from: string; to: string };
  ledgerSearchInputRef: RefObject<HTMLInputElement | null>;
  ledgerSearchText: string;
  ledgerWorkspace: ReturnType<typeof createLedgerWorkspaceModel>;
  liquidAccounts: WorkspaceResponse["workspace"]["accounts"];
  onCancelInlineEdit: () => void;
  onCreateInlineTransaction: (draft: InlineNewTransactionDraft) => void;
  onOpenAdvancedEditor: (transactionId: string) => void;
  onSaveInlineEdit: (transactionId: string) => void;
  onSaveInlineSplitEdit: (input: { splits: InlineSplitDraft[]; transactionId: string }) => void;
  onStartInlineEdit: (transaction: ReturnType<typeof createLedgerWorkspaceModel>["filteredTransactions"][number]) => void;
  onUpdateInlineEditField: (field: keyof LedgerInlineRowEditDraft, value: string) => void;
  inlineEditDraft: LedgerInlineRowEditDraft | null;
  inlineEditingTransactionId: string | null;
  selectedLedgerAccountId: string | null;
  selectedLedgerTransactionId: string | null;
  setLedgerRange: Dispatch<SetStateAction<{ from: string; to: string }>>;
  setLedgerSearchText: Dispatch<SetStateAction<string>>;
  setSelectedLedgerAccountId: Dispatch<SetStateAction<string | null>>;
  setSelectedLedgerTransactionId: Dispatch<SetStateAction<string | null>>;
}

export function LedgerRegisterPanel(props: LedgerRegisterPanelProps) {
  const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(null);
  const [editingSplitTransactionId, setEditingSplitTransactionId] = useState<string | null>(null);
  const [editingSplitDraft, setEditingSplitDraft] = useState<InlineSplitDraft[] | null>(null);
  const splitMemoInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const splitClearedInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const splitSaveButtonRef = useRef<HTMLButtonElement | null>(null);
  const [newTransactionDraft, setNewTransactionDraft] = useState<InlineNewTransactionDraft>({
    amount: "0.00",
    date: "2026-04-03",
    description: "",
    expenseAccountId: props.expenseAccounts[0]?.id ?? "",
    payee: "",
  });
  const inlineDateIsValid = props.inlineEditDraft
    ? /^\d{4}-\d{2}-\d{2}$/.test(props.inlineEditDraft.occurredOn.trim())
    : false;
  const inlineDescriptionIsValid = props.inlineEditDraft
    ? props.inlineEditDraft.description.trim().length > 0
    : false;
  const inlineSaveDisabled = props.inlineEditDraft
    ? !inlineDateIsValid || !inlineDescriptionIsValid
    : true;
  const newRowDateIsValid = /^\d{4}-\d{2}-\d{2}$/.test(newTransactionDraft.date.trim());
  const newRowDescriptionIsValid = newTransactionDraft.description.trim().length > 0;
  const newRowAmount = Number.parseFloat(newTransactionDraft.amount);
  const newRowAmountIsValid = Number.isFinite(newRowAmount) && newRowAmount > 0;
  const newRowAccountIsValid = newTransactionDraft.expenseAccountId.trim().length > 0;
  const newRowSaveDisabled =
    !newRowDateIsValid || !newRowDescriptionIsValid || !newRowAmountIsValid || !newRowAccountIsValid;

  useEffect(() => {
    if (newTransactionDraft.expenseAccountId) {
      return;
    }

    const fallbackAccount = props.expenseAccounts[0]?.id ?? "";
    if (!fallbackAccount) {
      return;
    }

    setNewTransactionDraft((current) => ({
      ...current,
      expenseAccountId: fallbackAccount,
    }));
  }, [newTransactionDraft.expenseAccountId, props.expenseAccounts]);

  useEffect(() => {
    if (!expandedTransactionId) {
      return;
    }

    const expandedRowStillVisible = props.ledgerWorkspace.filteredTransactions.some(
      (transaction) => transaction.id === expandedTransactionId,
    );

    if (!expandedRowStillVisible) {
      setExpandedTransactionId(null);
    }
  }, [expandedTransactionId, props.ledgerWorkspace.filteredTransactions]);

  useEffect(() => {
    if (!editingSplitTransactionId) {
      return;
    }

    const editedSplitRowStillVisible = props.ledgerWorkspace.filteredTransactions.some(
      (transaction) => transaction.id === editingSplitTransactionId,
    );

    if (!editedSplitRowStillVisible) {
      setEditingSplitTransactionId(null);
      setEditingSplitDraft(null);
    }
  }, [editingSplitTransactionId, props.ledgerWorkspace.filteredTransactions]);

  return (
    <>
      <article className="panel register-panel">
        <div className="panel-header">
          <span>Register</span>
          <span className="muted">Double-entry ledger</span>
        </div>
        <div className="ledger-toolbar">
          <label className="ledger-filter">
            <span className="muted">Search register</span>
            <input
              ref={props.ledgerSearchInputRef}
              value={props.ledgerSearchText}
              placeholder="description, payee, account, tag, status"
              onChange={(event) => props.setLedgerSearchText(event.target.value)}
            />
          </label>
          <div className="ledger-range-row">
            <label className="ledger-filter">
              <span className="muted">From</span>
              <input
                value={props.ledgerRange.from}
                onChange={(event) =>
                  props.setLedgerRange((current) => ({ ...current, from: event.target.value }))
                }
              />
            </label>
            <label className="ledger-filter">
              <span className="muted">To</span>
              <input
                value={props.ledgerRange.to}
                onChange={(event) =>
                  props.setLedgerRange((current) => ({ ...current, to: event.target.value }))
                }
              />
            </label>
            {props.ledgerWorkspace.selectedAccountBalance ? (
              <div className="ledger-balance-chip">
                <span>Active balance</span>
                <strong>{props.formatCurrency(props.ledgerWorkspace.selectedAccountBalance.balance)}</strong>
              </div>
            ) : null}
          </div>
          <div className="ledger-chip-row">
            <button
              className={`ledger-chip${props.selectedLedgerAccountId === null ? " active" : ""}`}
              type="button"
              onClick={() => props.setSelectedLedgerAccountId(null)}
            >
              All accounts
            </button>
            {props.liquidAccounts.slice(0, 4).map((account) => (
              <button
                key={account.id}
                className={`ledger-chip${props.selectedLedgerAccountId === account.id ? " active" : ""}`}
                type="button"
                onClick={() => props.setSelectedLedgerAccountId(account.id)}
              >
                {account.name}
              </button>
            ))}
          </div>
          <p className="form-hint">
            Hotkeys: `/` search, `j` or down move later, `k` or up move earlier, `Esc` clear
            selection. Search supports tags, account code/name, and status tokens.
          </p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Description</th>
              <th>Payee</th>
              <th>Accounts</th>
              <th>Tags</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr className="register-row">
              <td>
                <input
                  value={newTransactionDraft.date}
                  onChange={(event) =>
                    setNewTransactionDraft((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                />
              </td>
              <td>
                <span className="status-chip open">New</span>
              </td>
              <td>
                <input
                  value={newTransactionDraft.description}
                  placeholder="New transaction"
                  onChange={(event) =>
                    setNewTransactionDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </td>
              <td>
                <input
                  value={newTransactionDraft.payee}
                  placeholder="Unassigned"
                  onChange={(event) =>
                    setNewTransactionDraft((current) => ({
                      ...current,
                      payee: event.target.value,
                    }))
                  }
                />
              </td>
              <td>
                <div className="form-inline">
                  <select
                    value={newTransactionDraft.expenseAccountId}
                    onChange={(event) =>
                      setNewTransactionDraft((current) => ({
                        ...current,
                        expenseAccountId: event.target.value,
                      }))
                    }
                  >
                    {props.expenseAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={newTransactionDraft.amount}
                    onChange={(event) =>
                      setNewTransactionDraft((current) => ({
                        ...current,
                        amount: event.target.value,
                      }))
                    }
                  />
                </div>
              </td>
              <td>
                {!newRowDateIsValid ? <div className="form-hint error-text">YYYY-MM-DD required.</div> : null}
                {!newRowDescriptionIsValid ? (
                  <div className="form-hint error-text">Description required.</div>
                ) : null}
                {!newRowAmountIsValid ? <div className="form-hint error-text">Amount must be positive.</div> : null}
              </td>
              <td>
                <button
                  disabled={newRowSaveDisabled || props.busy !== null}
                  type="button"
                  onClick={() => {
                    if (newRowSaveDisabled) {
                      return;
                    }

                    props.onCreateInlineTransaction({
                      amount: newTransactionDraft.amount.trim(),
                      date: newTransactionDraft.date.trim(),
                      description: newTransactionDraft.description.trim(),
                      expenseAccountId: newTransactionDraft.expenseAccountId.trim(),
                      payee: newTransactionDraft.payee.trim(),
                    });
                    setNewTransactionDraft((current) => ({
                      ...current,
                      amount: "0.00",
                      description: "",
                      payee: "",
                    }));
                  }}
                >
                  {props.busy === "Transaction post" ? "Posting..." : "Post"}
                </button>
              </td>
            </tr>
            {props.ledgerWorkspace.filteredTransactions.length > 0 ? (
              props.ledgerWorkspace.filteredTransactions.map((transaction) => {
                const isEditingRow = props.inlineEditingTransactionId === transaction.id;
                const rowDraft = isEditingRow && props.inlineEditDraft ? props.inlineEditDraft : null;
                const isExpandedRow = expandedTransactionId === transaction.id;
                const isEditingSplitRow =
                  editingSplitTransactionId === transaction.id ? editingSplitDraft : null;

                return (
                  <>
                    <tr
                      key={transaction.id}
                      className={
                        props.selectedLedgerTransactionId === transaction.id
                          ? "register-row selected"
                          : "register-row"
                      }
                      onClick={() => props.setSelectedLedgerTransactionId(transaction.id)}
                    >
                      <td>
                        {rowDraft ? (
                          <>
                            <input
                              value={rowDraft.occurredOn}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                props.onUpdateInlineEditField("occurredOn", event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  if (!inlineSaveDisabled) {
                                    props.onSaveInlineEdit(transaction.id);
                                  }
                                }

                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  props.onCancelInlineEdit();
                                }
                              }}
                            />
                            {!inlineDateIsValid ? (
                              <div className="form-hint error-text">Date must use YYYY-MM-DD.</div>
                            ) : null}
                          </>
                        ) : (
                          transaction.occurredOn
                        )}
                      </td>
                      <td>
                        <span className={`status-chip ${transaction.status}`}>
                          {props.formatTransactionStatus(transaction.status)}
                        </span>
                      </td>
                      <td>
                        {rowDraft ? (
                          <>
                            <input
                              value={rowDraft.description}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                props.onUpdateInlineEditField("description", event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  if (!inlineSaveDisabled) {
                                    props.onSaveInlineEdit(transaction.id);
                                  }
                                }

                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  props.onCancelInlineEdit();
                                }
                              }}
                            />
                            {!inlineDescriptionIsValid ? (
                              <div className="form-hint error-text">Description is required.</div>
                            ) : null}
                          </>
                        ) : (
                          transaction.description
                        )}
                      </td>
                      <td>
                        {rowDraft ? (
                          <input
                            value={rowDraft.payee}
                            placeholder="Unassigned"
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => props.onUpdateInlineEditField("payee", event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                props.onSaveInlineEdit(transaction.id);
                              }

                              if (event.key === "Escape") {
                                event.preventDefault();
                                props.onCancelInlineEdit();
                              }
                            }}
                          />
                        ) : (
                          transaction.payee ?? "Unassigned"
                        )}
                      </td>
                      <td>{transaction.postings.map((posting) => posting.accountName).join(", ")}</td>
                      <td>{transaction.tags.join(", ")}</td>
                      <td>
                        {rowDraft ? (
                          <div className="posting-editor-row">
                            <button
                              disabled={inlineSaveDisabled}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!inlineSaveDisabled) {
                                  props.onSaveInlineEdit(transaction.id);
                                }
                              }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                props.onCancelInlineEdit();
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="posting-editor-row">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                props.setSelectedLedgerTransactionId(transaction.id);
                                props.onStartInlineEdit(transaction);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setExpandedTransactionId((current) =>
                                  current === transaction.id ? null : transaction.id,
                                );
                                setEditingSplitTransactionId((current) =>
                                  current === transaction.id ? null : current,
                                );
                                if (editingSplitTransactionId === transaction.id) {
                                  setEditingSplitDraft(null);
                                }
                              }}
                            >
                              {isExpandedRow ? "Hide splits" : "Show splits"}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                props.setSelectedLedgerTransactionId(transaction.id);
                                props.onOpenAdvancedEditor(transaction.id);
                              }}
                            >
                              Advanced
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {isExpandedRow ? (
                      <tr className="register-row">
                        <td colSpan={7}>
                          <div className="detail-stack">
                            <div className="panel-header">
                              <span>Split preview</span>
                              <span className="muted">{transaction.id}</span>
                            </div>
                            {transaction.postings.map((posting, postingIndex) => (
                              <div
                                key={`${transaction.id}:${posting.accountId}:${posting.amount}`}
                                className="posting-summary-row"
                              >
                                <div>
                                  <strong>{posting.accountName}</strong>
                                  {isEditingSplitRow ? (
                                    <div className="form-inline">
                                      <input
                                        ref={(element) => {
                                          splitMemoInputRefs.current[postingIndex] = element;
                                        }}
                                        value={isEditingSplitRow[postingIndex]?.memo ?? ""}
                                        placeholder="Memo"
                                        onKeyDown={(event) => {
                                          const keyAction = getSplitQuickEditKeyAction({
                                            field: "memo",
                                            key: event.key,
                                            splitCount: transaction.postings.length,
                                            splitIndex: postingIndex,
                                          });

                                          if (keyAction.type === "none") {
                                            return;
                                          }

                                          event.preventDefault();

                                          if (keyAction.type === "cancel") {
                                            setEditingSplitTransactionId(null);
                                            setEditingSplitDraft(null);
                                            return;
                                          }

                                          if (keyAction.type === "focus-cleared") {
                                            splitClearedInputRefs.current[keyAction.splitIndex]?.focus();
                                          }
                                        }}
                                        onChange={(event) => {
                                          setEditingSplitDraft((current) =>
                                            current
                                              ? current.map((candidate, candidateIndex) =>
                                                  candidateIndex === postingIndex
                                                    ? { ...candidate, memo: event.target.value }
                                                    : candidate,
                                                )
                                              : current,
                                          );
                                        }}
                                      />
                                      <label className="checkbox-row">
                                        <input
                                          ref={(element) => {
                                            splitClearedInputRefs.current[postingIndex] = element;
                                          }}
                                          checked={isEditingSplitRow[postingIndex]?.cleared ?? false}
                                          type="checkbox"
                                          onKeyDown={(event) => {
                                            const keyAction = getSplitQuickEditKeyAction({
                                              field: "cleared",
                                              key: event.key,
                                              splitCount: transaction.postings.length,
                                              splitIndex: postingIndex,
                                            });

                                            if (keyAction.type === "none") {
                                              return;
                                            }

                                            event.preventDefault();

                                            if (keyAction.type === "cancel") {
                                              setEditingSplitTransactionId(null);
                                              setEditingSplitDraft(null);
                                              return;
                                            }

                                            if (keyAction.type === "focus-memo") {
                                              splitMemoInputRefs.current[keyAction.splitIndex]?.focus();
                                              return;
                                            }

                                            if (keyAction.type === "focus-save") {
                                              splitSaveButtonRef.current?.focus();
                                            }
                                          }}
                                          onChange={(event) => {
                                            setEditingSplitDraft((current) =>
                                              current
                                                ? current.map((candidate, candidateIndex) =>
                                                    candidateIndex === postingIndex
                                                      ? {
                                                          ...candidate,
                                                          cleared: event.target.checked,
                                                        }
                                                      : candidate,
                                                  )
                                                : current,
                                            );
                                          }}
                                        />
                                        <span>Cleared</span>
                                      </label>
                                    </div>
                                  ) : (
                                    <div className="candidate-meta">
                                      {posting.memo ?? "No memo"}
                                      {posting.cleared ? " · cleared" : " · open"}
                                    </div>
                                  )}
                                </div>
                                <strong>{posting.amount}</strong>
                              </div>
                            ))}
                            <div className="posting-editor-row">
                              {isEditingSplitRow ? (
                                <>
                                  <button
                                    ref={splitSaveButtonRef}
                                    disabled={props.busy !== null}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      props.onSaveInlineSplitEdit({
                                        splits: isEditingSplitRow,
                                        transactionId: transaction.id,
                                      });
                                      setEditingSplitTransactionId(null);
                                      setEditingSplitDraft(null);
                                    }}
                                  >
                                    {props.busy === "Transaction update" ? "Saving..." : "Save split changes"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setEditingSplitTransactionId(null);
                                      setEditingSplitDraft(null);
                                    }}
                                  >
                                    Cancel split changes
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setEditingSplitTransactionId(transaction.id);
                                    setEditingSplitDraft(
                                      transaction.postings.map((posting) => ({
                                        amount: String(posting.amount),
                                        cleared: posting.cleared,
                                        memo: posting.memo ?? "",
                                      })),
                                    );
                                  }}
                                >
                                  Quick edit splits
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  props.setSelectedLedgerTransactionId(transaction.id);
                                  props.onOpenAdvancedEditor(transaction.id);
                                }}
                              >
                                Edit splits in advanced editor
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </>
                );
              })
            ) : (
              <tr>
                <td colSpan={7}>
                  <div className="table-empty-state">
                    No transactions match the current account filter, date range, and search text.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </article>

      <article className="panel">
        <div className="panel-header">
          <span>Balances</span>
          <span className="muted">As of 2026-04-30</span>
        </div>
        {props.ledgerWorkspace.filteredBalances.map((balance) => (
          <button
            key={`${balance.accountId}:${balance.commodityCode}`}
            className={`metric-button${props.selectedLedgerAccountId === balance.accountId ? " active" : ""}`}
            type="button"
            onClick={() =>
              props.setSelectedLedgerAccountId((current) =>
                current === balance.accountId ? null : balance.accountId,
              )
            }
          >
            <span>{balance.accountName}</span>
            <strong>{props.formatCurrency(balance.balance)}</strong>
          </button>
        ))}
      </article>
    </>
  );
}
