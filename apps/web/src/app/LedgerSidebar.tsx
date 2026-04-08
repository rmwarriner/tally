import type { Dispatch, SetStateAction } from "react";
import { type createLedgerBookModel } from "./shell";

interface LedgerSidebarProps {
  ledgerBook: ReturnType<typeof createLedgerBookModel>;
  selectedLedgerAccountId: string | null;
  selectedLedgerTransactionId: string | null;
  setSelectedLedgerAccountId: Dispatch<SetStateAction<string | null>>;
  setSelectedLedgerTransactionId: Dispatch<SetStateAction<string | null>>;
}

export function LedgerSidebar(props: LedgerSidebarProps) {
  return (
    <>
      <div className="tree-section">
        <h3>Ledger accounts</h3>
        {props.ledgerBook.availableAccounts.map((account) => (
          <button
            key={account.id}
            className={`tree-button${props.selectedLedgerAccountId === account.id ? " active" : ""}`}
            type="button"
            onClick={() =>
              props.setSelectedLedgerAccountId((current) => (current === account.id ? null : account.id))
            }
          >
            <span>{account.name}</span>
            <span className="muted">{account.type}</span>
          </button>
        ))}
      </div>

      <div className="tree-section">
        <h3>Filtered register</h3>
        {props.ledgerBook.filteredTransactions.slice(0, 8).map((transaction) => (
          <button
            key={transaction.id}
            className={`tree-button${props.selectedLedgerTransactionId === transaction.id ? " active" : ""}`}
            type="button"
            onClick={() => props.setSelectedLedgerTransactionId(transaction.id)}
          >
            <span>{transaction.description}</span>
            <span className="muted">{transaction.occurredOn}</span>
          </button>
        ))}
      </div>
    </>
  );
}
