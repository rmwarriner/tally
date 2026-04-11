import type { FinanceBookDocument } from "@tally/book";

interface CoaSidebarProps {
  accounts: FinanceBookDocument["accounts"];
  accountBalances: Array<{
    accountId: string;
    balance: number;
  }>;
  formatCurrency: (amount: number) => string;
  onAddTransaction: () => void;
  onAccountSelect: (accountId: string | null) => void;
  onNewAccount: (parentAccountId: string | null) => void;
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
  const balanceByAccountId = new Map(
    props.accountBalances.map((balance) => [balance.accountId, balance.balance]),
  );

  return (
    <section className="sidebar coa-sidebar">
      <div className="coa-quick-actions">
        {props.selectedAccountId ? (
          <>
            <button className="btn-secondary" type="button" onClick={props.onAddTransaction}>
              + Txn
            </button>
            <button className="btn-secondary" type="button" onClick={props.onReconcile}>
              Reconcile
            </button>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => props.onNewAccount(props.selectedAccountId)}
            >
              + Sub-account
            </button>
          </>
        ) : (
          <button className="btn-secondary" type="button" onClick={() => props.onNewAccount(null)}>
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
            <h3 className="coa-account-type-heading">{type}</h3>
            {groupAccounts.map((account) => (
              <button
                key={account.id}
                className={`tree-button${props.selectedAccountId === account.id ? " active" : ""}`}
                type="button"
                onClick={() =>
                  props.onAccountSelect(props.selectedAccountId === account.id ? null : account.id)
                }
              >
                <span className="coa-account-primary">
                  <span className="coa-account-name">{account.name}</span>
                  <span className="coa-account-code">{account.code ?? account.id}</span>
                </span>
                <span
                  className={[
                    "coa-account-balance",
                    (balanceByAccountId.get(account.id) ?? 0) > 0
                      ? "amount-positive"
                      : (balanceByAccountId.get(account.id) ?? 0) < 0
                        ? "amount-negative"
                        : "muted",
                  ].join(" ")}
                >
                  {props.formatCurrency(balanceByAccountId.get(account.id) ?? 0)}
                </span>
              </button>
            ))}
          </div>
        );
      })}
    </section>
  );
}
