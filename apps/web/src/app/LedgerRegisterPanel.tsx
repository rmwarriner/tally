import type { Dispatch, RefObject, SetStateAction } from "react";
import type { WorkspaceResponse } from "./api";
import type { LedgerInlineRowEditDraft } from "./ledger-state";
import { type createLedgerWorkspaceModel } from "./shell";

interface LedgerRegisterPanelProps {
  formatCurrency: (amount: number) => string;
  formatTransactionStatus: (status: "cleared" | "open" | "reconciled") => string;
  ledgerRange: { from: string; to: string };
  ledgerSearchInputRef: RefObject<HTMLInputElement | null>;
  ledgerSearchText: string;
  ledgerWorkspace: ReturnType<typeof createLedgerWorkspaceModel>;
  liquidAccounts: WorkspaceResponse["workspace"]["accounts"];
  onCancelInlineEdit: () => void;
  onSaveInlineEdit: (transactionId: string) => void;
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
            {props.ledgerWorkspace.filteredTransactions.length > 0 ? (
              props.ledgerWorkspace.filteredTransactions.map((transaction) => {
                const isEditingRow = props.inlineEditingTransactionId === transaction.id;
                const rowDraft = isEditingRow && props.inlineEditDraft ? props.inlineEditDraft : null;

                return (
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
                        <input
                          value={rowDraft.occurredOn}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            props.onUpdateInlineEditField("occurredOn", event.target.value)
                          }
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
                        <input
                          value={rowDraft.description}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            props.onUpdateInlineEditField("description", event.target.value)
                          }
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
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              props.onSaveInlineEdit(transaction.id);
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
                      )}
                    </td>
                  </tr>
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
