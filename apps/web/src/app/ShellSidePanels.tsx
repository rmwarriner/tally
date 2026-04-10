import type { DashboardResponse } from "./api";
import type { LedgerBookModel, BookView } from "./shell";

interface ShellInspectorContentProps {
  activeView: BookView;
  budgetConfigurationErrors: string[];
  dueTransactions: DashboardResponse["dashboard"]["dueTransactions"];
  ledgerValidationErrors: string[];
  ledgerBook: LedgerBookModel;
}

export function ShellInspectorContent(props: ShellInspectorContentProps) {
  switch (props.activeView) {
    case "overview":
      return (
        <>
          <div className="inspector-section">
            <h3>Integrity</h3>
            <div className="status-list">
              <div className="status-item">
                <span>Ledger checks</span>
                <strong>{props.ledgerValidationErrors.length === 0 ? "Passing" : "Issues found"}</strong>
              </div>
              <div className="status-item">
                <span>Budget checks</span>
                <strong>{props.budgetConfigurationErrors.length === 0 ? "Passing" : "Issues found"}</strong>
              </div>
            </div>
          </div>

          <div className="inspector-section">
            <h3>Desktop direction</h3>
            <p>
              The desktop shell is intended to be dense, keyboard-first, and workspace-oriented, while
              mobile remains focused on capture and approvals.
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
              Transactions must balance and reconciliation sessions must tie cleared ledger activity to a
              statement boundary.
            </p>
            <div className="status-list">
              <div className="status-item">
                <span>Ledger checks</span>
                <strong>{props.ledgerValidationErrors.length === 0 ? "Passing" : "Issues found"}</strong>
              </div>
            </div>
          </div>

          <div className="inspector-section">
            <h3>Account drill-down</h3>
            {props.ledgerBook.selectedAccount ? (
              <div className="detail-stack">
                <div className="status-item">
                  <span>Account</span>
                  <strong>{props.ledgerBook.selectedAccount.name}</strong>
                </div>
                <div className="status-item">
                  <span>Type</span>
                  <strong>{props.ledgerBook.selectedAccount.type}</strong>
                </div>
                <div className="status-item">
                  <span>Register matches</span>
                  <strong>{props.ledgerBook.selectedAccount.transactionCount}</strong>
                </div>
              </div>
            ) : (
              <p>Select an account from the sidebar or balance list to narrow the register.</p>
            )}
          </div>

          <div className="inspector-section">
            <h3>Selected transaction</h3>
            {props.ledgerBook.selectedTransaction ? (
              <div className="detail-stack">
                <div className="status-item">
                  <span>Description</span>
                  <strong>{props.ledgerBook.selectedTransaction.description}</strong>
                </div>
                <div className="status-item">
                  <span>Date</span>
                  <strong>{props.ledgerBook.selectedTransaction.occurredOn}</strong>
                </div>
                <div className="status-item">
                  <span>Payee</span>
                  <strong>{props.ledgerBook.selectedTransaction.payee ?? "Unassigned"}</strong>
                </div>
                <div className="status-item">
                  <span>Splits</span>
                  <strong>{props.ledgerBook.selectedTransaction.postings.length}</strong>
                </div>
                <div className="status-item">
                  <span>Tags</span>
                  <strong>
                    {props.ledgerBook.selectedTransaction.tags.length > 0
                      ? props.ledgerBook.selectedTransaction.tags.join(", ")
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
            <p>
              Native split reordering, faster keyboard-only editing, and a desktop wrapper evaluation are
              the natural next ledger slices.
            </p>
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
            Import adapters must preserve source traceability, deduplicate safely, and reject malformed
            payloads at the service boundary.
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
            {props.dueTransactions.length > 0 ? (
              props.dueTransactions.map((transaction) => (
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
