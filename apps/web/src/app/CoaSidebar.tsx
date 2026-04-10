import type { FinanceBookDocument } from "@tally/book";
import type { BookView } from "./shell";

interface CoaSidebarProps {
  accounts: FinanceBookDocument["accounts"];
  activeView: BookView;
  onAddTransaction: () => void;
  onAccountSelect: (accountId: string | null) => void;
  onNewAccount: () => void;
  onReconcile: () => void;
  selectedAccountId: string | null;
}

const accountTypeOrder: Array<FinanceBookDocument["accounts"][number]["type"]> = [
  "asset",
  "liability",
  "income",
  "expense",
  "equity",
];

export function CoaSidebar(props: CoaSidebarProps) {
  return (
    <section className="sidebar coa-sidebar">
      <div className="panel-header">
        <span>Chart of accounts</span>
        <span className="muted">{props.activeView}</span>
      </div>
      <div className="coa-quick-actions">
        {props.selectedAccountId ? (
          <>
            <button className="btn-secondary" type="button" onClick={props.onAddTransaction}>
              + Txn
            </button>
            <button className="btn-secondary" type="button" onClick={props.onReconcile}>
              Reconcile
            </button>
            <button className="btn-secondary" type="button" onClick={props.onNewAccount}>
              + Sub-account
            </button>
          </>
        ) : (
          <button className="btn-secondary" type="button" onClick={props.onNewAccount}>
            + Account
          </button>
        )}
      </div>
      <div className="tree-section">
        <button
          className={`tree-button${props.selectedAccountId === null ? " active" : ""}`}
          type="button"
          onClick={() => props.onAccountSelect(null)}
        >
          <span>All accounts</span>
          <span className="muted">{props.accounts.length}</span>
        </button>
      </div>
      {accountTypeOrder.map((type) => {
        const groupAccounts = props.accounts.filter((account) => account.type === type);
        if (groupAccounts.length === 0) {
          return null;
        }

        return (
          <div key={type} className="tree-section">
            <h3>{type}</h3>
            {groupAccounts.map((account) => (
              <button
                key={account.id}
                className={`tree-button${props.selectedAccountId === account.id ? " active" : ""}`}
                type="button"
                onClick={() =>
                  props.onAccountSelect(props.selectedAccountId === account.id ? null : account.id)
                }
              >
                <span>{account.name}</span>
                <span className="muted">{account.code ?? account.id}</span>
              </button>
            ))}
          </div>
        );
      })}
    </section>
  );
}
