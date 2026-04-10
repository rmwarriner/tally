import type { Dispatch, SetStateAction } from "react";
import type { DashboardResponse, BookResponse } from "./api";
import { formatCurrency } from "./app-format";
import type {
  LedgerBookModel,
  OverviewCard,
  BookView,
  BookViewDefinition,
} from "./shell";

interface ShellSidePanelsProps {
  activeView: BookView;
  baselineSnapshot: DashboardResponse["dashboard"]["budgetSnapshot"];
  budgetConfigurationErrors: string[];
  dueTransactions: DashboardResponse["dashboard"]["dueTransactions"];
  getBookViewDefinition: (view: BookView) => BookViewDefinition;
  ledgerValidationErrors: string[];
  ledgerBook: LedgerBookModel;
  overviewCards: OverviewCard[];
  selectedLedgerAccountId: string | null;
  selectedLedgerTransactionId: string | null;
  setActiveView: (view: BookView) => void;
  setSelectedLedgerAccountId: Dispatch<SetStateAction<string | null>>;
  setSelectedLedgerTransactionId: Dispatch<SetStateAction<string | null>>;
  bookAccounts: BookResponse["book"]["accounts"];
  bookEnvelopes: BookResponse["book"]["envelopes"];
  bookSchedules: BookResponse["book"]["scheduledTransactions"];
}

export function ShellSidebarContent(props: ShellSidePanelsProps) {
  switch (props.activeView) {
    case "overview":
      return (
        <>
          <div className="tree-section">
            <h3>Focus queues</h3>
            {props.overviewCards.map((card) => {
              const targetView = props.getBookViewDefinition(card.id);

              return (
                <button
                  key={card.id}
                  className="tree-button"
                  type="button"
                  onClick={() => props.setActiveView(card.id)}
                >
                  <span>{targetView.label}</span>
                  <span className="muted">{card.metric}</span>
                </button>
              );
            })}
          </div>

          <div className="tree-section">
            <h3>Accounts</h3>
            {props.bookAccounts.slice(0, 8).map((account) => (
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
        <div className="tree-section">
          <h3>Ledger accounts</h3>
          <p>Select accounts from the chart of accounts sidebar.</p>
        </div>
      );
    case "budget":
      return (
        <div className="tree-section">
          <h3>Budget categories</h3>
          {props.baselineSnapshot.map((row) => (
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
          {props.bookEnvelopes.map((envelope) => (
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
          {props.bookSchedules.map((schedule) => (
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

export function ShellInspectorContent(props: ShellSidePanelsProps) {
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
