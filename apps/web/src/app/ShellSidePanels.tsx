import type { FinanceBookDocument } from "@tally/book";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { formatCurrency } from "./app-format";
import type { LedgerBookModel, BookView } from "./shell";

interface ShellInspectorContentProps {
  activeView: BookView;
  book: FinanceBookDocument;
  currentPeriod: {
    from: string;
    to: string;
  };
  isInspectorOpen: boolean;
  ledgerBook: LedgerBookModel;
  onToggleInspector: () => void;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatAuditTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes} ${toIsoDate(date)}`;
}

function getAuditLabel(eventType: string): string {
  if (eventType === "transaction.posted" || eventType === "transaction.created") {
    return "Posted";
  }
  if (eventType === "transaction.updated") {
    return "Updated";
  }
  if (eventType === "transaction.soft-deleted" || eventType === "transaction.deleted") {
    return "Deleted";
  }
  if (eventType === "transaction.restored") {
    return "Restored";
  }
  return eventType;
}

function getEntityIdsForAuditEvent(event: unknown): string[] {
  if (!event || typeof event !== "object") {
    return [];
  }

  const candidate = event as { entityId?: unknown; entityIds?: unknown };
  if (Array.isArray(candidate.entityIds)) {
    return candidate.entityIds.filter((value): value is string => typeof value === "string");
  }
  if (typeof candidate.entityId === "string") {
    return [candidate.entityId];
  }
  return [];
}

function getAmountClass(amount: number): string {
  if (amount > 0) {
    return "amount-positive";
  }
  if (amount < 0) {
    return "amount-negative";
  }
  return "amount-neutral";
}

function renderInspectorToggle(props: ShellInspectorContentProps) {
  const Icon = props.isInspectorOpen ? CaretRight : CaretLeft;
  return (
    <button
      aria-expanded={props.isInspectorOpen}
      aria-label="Toggle inspector"
      className="inspector-toggle-strip"
      type="button"
      onClick={props.onToggleInspector}
    >
      <Icon size={8} weight="light" />
    </button>
  );
}

export function ShellInspectorContent(props: ShellInspectorContentProps) {
  if (!props.isInspectorOpen) {
    return (
      <>
        {renderInspectorToggle(props)}
        <div className="inspector-content" />
      </>
    );
  }

  if (props.activeView !== "ledger") {
    return (
      <>
        {renderInspectorToggle(props)}
        <div className="inspector-content" />
      </>
    );
  }

  const selectedTransaction = props.ledgerBook.selectedTransaction;

  if (!selectedTransaction) {
    const selectedAccount = props.ledgerBook.selectedAccount;

    let clearedAmount = 0;
    let pendingAmount = 0;
    let scheduledAmount = 0;

    if (selectedAccount) {
      for (const transaction of props.book.transactions) {
        const inPeriod =
          transaction.occurredOn >= props.currentPeriod.from &&
          transaction.occurredOn <= props.currentPeriod.to;
        for (const posting of transaction.postings) {
          if (posting.accountId !== selectedAccount.id) {
            continue;
          }
          if (posting.cleared) {
            clearedAmount += posting.amount.quantity;
          }
          if (inPeriod) {
            pendingAmount += posting.amount.quantity;
          }
        }
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const horizon = new Date(today);
      horizon.setDate(horizon.getDate() + 30);
      const todayDate = toIsoDate(today);
      const horizonDate = toIsoDate(horizon);

      for (const schedule of props.book.scheduledTransactions) {
        if (schedule.nextDueOn < todayDate || schedule.nextDueOn > horizonDate) {
          continue;
        }
        for (const posting of schedule.templateTransaction.postings) {
          if (posting.accountId === selectedAccount.id) {
            scheduledAmount += posting.amount.quantity;
          }
        }
      }
    }

    return (
      <>
        {renderInspectorToggle(props)}
        <div className="inspector-content">
          <div className="inspector-section">
            {selectedAccount ? (
              <>
                <div className="inspector-summary-header">
                  <strong>{selectedAccount.name}</strong>
                  <span className="muted">{selectedAccount.type}</span>
                </div>
                <div className="inspector-summary-rows">
                  <div className="inspector-summary-row">
                    <span>Cleared</span>
                    <strong className={getAmountClass(clearedAmount)}>
                      {formatCurrency(clearedAmount)}
                    </strong>
                  </div>
                  <div className="inspector-summary-row">
                    <span>Pending</span>
                    <strong className={getAmountClass(pendingAmount)}>
                      {formatCurrency(pendingAmount)}
                    </strong>
                  </div>
                  <div className="inspector-summary-row">
                    <span>Scheduled (30d)</span>
                    <strong className={getAmountClass(scheduledAmount)}>
                      {formatCurrency(scheduledAmount)}
                    </strong>
                  </div>
                </div>
              </>
            ) : (
              <p className="muted">Select an account to see its summary.</p>
            )}
          </div>
        </div>
      </>
    );
  }

  const accountNameById = new Map(
    props.book.accounts.map((account) => [account.id, account.name]),
  );
  const selectedAuditEvents = props.book.auditEvents
    .filter((event) => getEntityIdsForAuditEvent(event).includes(selectedTransaction.id))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 10);
  const sourceTransaction =
    props.book.transactions.find((transaction) => transaction.id === selectedTransaction.id) ?? null;
  const linkedSchedule = sourceTransaction?.scheduleId
    ? props.book.scheduledTransactions.find(
        (schedule) => schedule.id === sourceTransaction.scheduleId,
      ) ?? null
    : null;

  return (
    <>
      {renderInspectorToggle(props)}
      <div className="inspector-content">
        <div className="inspector-section">
          <div className="inspector-transaction-header-row">
            <strong>{selectedTransaction.occurredOn}</strong>
            <strong>{selectedTransaction.description}</strong>
          </div>
          <p>{selectedTransaction.payee ?? "—"}</p>
        </div>

        <div className="inspector-section">
          <h3>Splits</h3>
          <div className="inspector-splits-table">
            {selectedTransaction.postings.map((posting, index) => (
              <div
                key={`${selectedTransaction.id}-${posting.accountId}-${posting.amount}-${index}`}
                className="inspector-split-row"
              >
                <span title={accountNameById.get(posting.accountId) ?? posting.accountName}>
                  {accountNameById.get(posting.accountId) ?? posting.accountName}
                </span>
                <strong className={getAmountClass(posting.amount)}>
                  {formatCurrency(posting.amount)}
                </strong>
              </div>
            ))}
          </div>
        </div>

        <div className="inspector-section">
          <h3>Audit trail</h3>
          {selectedAuditEvents.length > 0 ? (
            <div className="inspector-audit-list">
              {selectedAuditEvents.map((event) => (
                <div key={event.id} className="inspector-audit-row">
                  <span>{formatAuditTimestamp(event.occurredAt)}</span>
                  <span>{getAuditLabel(event.eventType)}</span>
                  <span>{event.actor}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No audit history.</p>
          )}
        </div>

        {linkedSchedule ? (
          <div className="inspector-section">
            <h3>Schedule</h3>
            <div className="status-item">
              <span>{linkedSchedule.name}</span>
              <strong>{linkedSchedule.nextDueOn}</strong>
            </div>
          </div>
        ) : null}

        <div className="inspector-section">
          <p className="muted">Attachments · coming soon</p>
        </div>
      </div>
    </>
  );
}
