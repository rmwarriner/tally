import type { Dispatch, SetStateAction } from "react";
import type { BookResponse } from "./api";
import { postReconciliation } from "./api";
import { BOOK_ID } from "./app-constants";
import { formatSignedCurrency } from "./app-format";
import type { createReconciliationBookModel } from "./shell";

interface ReconciliationFormState {
  accountId: string;
  statementBalance: string;
  statementDate: string;
}

interface LedgerOperationsPanelsProps {
  busy: string | null;
  liquidAccounts: BookResponse["book"]["accounts"];
  reconciliationForm: ReconciliationFormState;
  reconciliationBook: ReturnType<typeof createReconciliationBookModel>;
  runMutation: (label: string, operation: () => Promise<void>) => Promise<void>;
  setReconciliationForm: Dispatch<SetStateAction<ReconciliationFormState>>;
  setSelectedReconciliationTransactionIds: Dispatch<SetStateAction<Record<string, boolean>>>;
}

export function LedgerOperationsPanels(props: LedgerOperationsPanelsProps) {
  return (
    <>
      <article className="panel form-panel">
        <div className="panel-header">
          <span>Reconcile</span>
          <span className="muted">Statement matching</span>
        </div>
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            void props.runMutation("Reconciliation", async () => {
              await postReconciliation(BOOK_ID, {
                actor: "Primary",
                payload: {
                  accountId: props.reconciliationForm.accountId,
                  clearedTransactionIds: props.reconciliationBook.candidateTransactions
                    .filter((candidate) => candidate.selected)
                    .map((candidate) => candidate.id),
                  statementBalance: Number.parseFloat(props.reconciliationForm.statementBalance),
                  statementDate: props.reconciliationForm.statementDate,
                },
              });
            });
          }}
        >
          <label>
            Account
            <select
              value={props.reconciliationForm.accountId}
              onChange={(event) =>
                props.setReconciliationForm((current) => ({ ...current, accountId: event.target.value }))
              }
            >
              {props.liquidAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Statement date
            <input
              value={props.reconciliationForm.statementDate}
              onChange={(event) =>
                props.setReconciliationForm((current) => ({ ...current, statementDate: event.target.value }))
              }
            />
          </label>
          <label>
            Statement balance
            <input
              value={props.reconciliationForm.statementBalance}
              onChange={(event) =>
                props.setReconciliationForm((current) => ({
                  ...current,
                  statementBalance: event.target.value,
                }))
              }
            />
          </label>
          {props.reconciliationBook.latestSession ? (
            <div className="reconciliation-note">
              Latest session: {props.reconciliationBook.latestSession.statementDate} with difference{" "}
              {formatSignedCurrency(props.reconciliationBook.latestSession.difference.quantity)}
            </div>
          ) : null}
          <div className="reconciliation-summary-grid">
            <div className="summary-card">
              <span>Cleared total</span>
              <strong>{formatSignedCurrency(props.reconciliationBook.clearedTotal)}</strong>
            </div>
            <div
              className={`summary-card${
                props.reconciliationBook.difference === 0 ? " balanced" : " warning"
              }`}
            >
              <span>Difference</span>
              <strong>
                {props.reconciliationBook.difference === null
                  ? "Enter balance"
                  : formatSignedCurrency(props.reconciliationBook.difference)}
              </strong>
            </div>
          </div>
          <div className="reconciliation-candidate-list">
            <div className="panel-header">
              <span>Cleared candidates</span>
              <span className="muted">
                {props.reconciliationBook.selectedAccount?.name ?? "Select account"}
              </span>
            </div>
            {props.reconciliationBook.candidateTransactions.length > 0 ? (
              props.reconciliationBook.candidateTransactions.map((candidate) => (
                <button
                  key={candidate.id}
                  className={`reconciliation-candidate${candidate.selected ? " active" : ""}`}
                  type="button"
                  onClick={() =>
                    props.setSelectedReconciliationTransactionIds((current) => ({
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
          <button type="submit" disabled={props.busy !== null}>
            {props.busy === "Reconciliation" ? "Reconciling..." : "Record reconciliation"}
          </button>
        </form>
      </article>
    </>
  );
}
