import type { Dispatch, SetStateAction } from "react";
import type { WorkspaceResponse } from "./api";
import { postReconciliation } from "./api";
import { WORKSPACE_ID } from "./app-constants";
import { formatSignedCurrency } from "./app-format";
import type { createReconciliationWorkspaceModel } from "./shell";

interface ReconciliationFormState {
  accountId: string;
  statementBalance: string;
  statementDate: string;
}

interface LedgerOperationsPanelsProps {
  busy: string | null;
  liquidAccounts: WorkspaceResponse["workspace"]["accounts"];
  reconciliationForm: ReconciliationFormState;
  reconciliationWorkspace: ReturnType<typeof createReconciliationWorkspaceModel>;
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
              await postReconciliation(WORKSPACE_ID, {
                actor: "Primary",
                payload: {
                  accountId: props.reconciliationForm.accountId,
                  clearedTransactionIds: props.reconciliationWorkspace.candidateTransactions
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
          {props.reconciliationWorkspace.latestSession ? (
            <div className="reconciliation-note">
              Latest session: {props.reconciliationWorkspace.latestSession.statementDate} with difference{" "}
              {formatSignedCurrency(props.reconciliationWorkspace.latestSession.difference.quantity)}
            </div>
          ) : null}
          <div className="reconciliation-summary-grid">
            <div className="summary-card">
              <span>Cleared total</span>
              <strong>{formatSignedCurrency(props.reconciliationWorkspace.clearedTotal)}</strong>
            </div>
            <div
              className={`summary-card${
                props.reconciliationWorkspace.difference === 0 ? " balanced" : " warning"
              }`}
            >
              <span>Difference</span>
              <strong>
                {props.reconciliationWorkspace.difference === null
                  ? "Enter balance"
                  : formatSignedCurrency(props.reconciliationWorkspace.difference)}
              </strong>
            </div>
          </div>
          <div className="reconciliation-candidate-list">
            <div className="panel-header">
              <span>Cleared candidates</span>
              <span className="muted">
                {props.reconciliationWorkspace.selectedAccount?.name ?? "Select account"}
              </span>
            </div>
            {props.reconciliationWorkspace.candidateTransactions.length > 0 ? (
              props.reconciliationWorkspace.candidateTransactions.map((candidate) => (
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
