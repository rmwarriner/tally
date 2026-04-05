import {
  buildBaselineBudgetSnapshot,
  buildEnvelopeBudgetSnapshot,
  calculateNetWorth,
  computeAccountBalances,
  createMoney,
  type AccountBalance,
  type Account,
  type BaselineBudgetSnapshotLine,
  type EnvelopeBudgetSnapshotLine,
  type MoneyAmount,
} from "@gnucash-ng/domain";
import { buildDashboardSnapshot } from "./selectors";
import type { FinanceWorkspaceDocument, WorkspaceClosePeriod } from "./types";

export type WorkspaceReportKind =
  | "budget-vs-actual"
  | "cash-flow"
  | "envelope-summary"
  | "income-statement"
  | "net-worth";

export interface NetWorthReport {
  balances: AccountBalance[];
  from: string;
  kind: "net-worth";
  to: string;
  total: MoneyAmount;
}

export interface IncomeStatementReportLine {
  accountId: string;
  accountName: string;
  accountType: "expense" | "income";
  amount: MoneyAmount;
}

export interface IncomeStatementReport {
  expenseTotal: MoneyAmount;
  from: string;
  incomeTotal: MoneyAmount;
  kind: "income-statement";
  lines: IncomeStatementReportLine[];
  netIncome: MoneyAmount;
  to: string;
}

export interface BudgetVsActualReport {
  from: string;
  kind: "budget-vs-actual";
  lines: BaselineBudgetSnapshotLine[];
  to: string;
  totals: {
    actual: MoneyAmount;
    planned: MoneyAmount;
    variance: MoneyAmount;
  };
}

export interface CashFlowReportLine {
  accountId: string;
  accountName: string;
  inflow: MoneyAmount;
  net: MoneyAmount;
  outflow: MoneyAmount;
}

export interface CashFlowReport {
  from: string;
  kind: "cash-flow";
  lines: CashFlowReportLine[];
  to: string;
  totals: {
    inflow: MoneyAmount;
    net: MoneyAmount;
    outflow: MoneyAmount;
  };
}

export interface EnvelopeSummaryReport {
  from: string;
  kind: "envelope-summary";
  lines: EnvelopeBudgetSnapshotLine[];
  to: string;
  totals: {
    available: MoneyAmount;
    funded: MoneyAmount;
    planned: MoneyAmount;
    spent: MoneyAmount;
  };
}

export type WorkspaceReport =
  | BudgetVsActualReport
  | CashFlowReport
  | EnvelopeSummaryReport
  | IncomeStatementReport
  | NetWorthReport;

export interface CloseSummaryCheck {
  id: "budget" | "ledger" | "reconciliation" | "schedules";
  itemCount: number;
  label: string;
  status: "attention" | "ok";
}

export interface CloseSummary {
  checks: CloseSummaryCheck[];
  from: string;
  importedTransactionCount: number;
  latestClosePeriod?: WorkspaceClosePeriod;
  netIncome: MoneyAmount;
  netWorth: MoneyAmount;
  readyToClose: boolean;
  reconciliationGaps: Array<{
    accountId: string;
    accountName: string;
    lastStatementDate?: string;
  }>;
  to: string;
  transactionCount: number;
}

function isIncomeOrExpenseAccountType(value: string): value is "expense" | "income" {
  return value === "expense" || value === "income";
}

function isIncomeOrExpenseAccount(account: Account): account is Account & { type: "expense" | "income" } {
  return isIncomeOrExpenseAccountType(account.type);
}

function sumMoneyAmounts(lines: MoneyAmount[], commodityCode: string): MoneyAmount {
  return createMoney(
    commodityCode,
    lines.reduce((total, line) => total + line.quantity, 0),
  );
}

function hasActivityInRange(document: FinanceWorkspaceDocument, accountId: string, from: string, to: string): boolean {
  return document.transactions.some(
    (transaction) =>
      transaction.occurredOn >= from &&
      transaction.occurredOn <= to &&
      transaction.postings.some((posting) => posting.accountId === accountId),
  );
}

export function buildWorkspaceReport(
  document: FinanceWorkspaceDocument,
  range: {
    from: string;
    kind: "net-worth";
    to: string;
  },
): NetWorthReport;
export function buildWorkspaceReport(
  document: FinanceWorkspaceDocument,
  range: {
    from: string;
    kind: "income-statement";
    to: string;
  },
): IncomeStatementReport;
export function buildWorkspaceReport(
  document: FinanceWorkspaceDocument,
  range: {
    from: string;
    kind: "budget-vs-actual";
    to: string;
  },
): BudgetVsActualReport;
export function buildWorkspaceReport(
  document: FinanceWorkspaceDocument,
  range: {
    from: string;
    kind: "cash-flow";
    to: string;
  },
): CashFlowReport;
export function buildWorkspaceReport(
  document: FinanceWorkspaceDocument,
  range: {
    from: string;
    kind: "envelope-summary";
    to: string;
  },
): EnvelopeSummaryReport;
export function buildWorkspaceReport(
  document: FinanceWorkspaceDocument,
  range: {
    from: string;
    kind: WorkspaceReportKind;
    to: string;
  },
): WorkspaceReport;
export function buildWorkspaceReport(
  document: FinanceWorkspaceDocument,
  range: {
    from: string;
    kind: WorkspaceReportKind;
    to: string;
  },
): WorkspaceReport {
  const commodityCode = document.baseCommodityCode;

  switch (range.kind) {
    case "net-worth": {
      const balances = computeAccountBalances(document.accounts, document.transactions, range.to).filter(
        (balance) => balance.accountType === "asset" || balance.accountType === "liability",
      );

      return {
        balances,
        from: range.from,
        kind: "net-worth",
        to: range.to,
        total: calculateNetWorth(document.accounts, document.transactions, commodityCode, range.to),
      };
    }
    case "income-statement": {
      const lines = document.accounts
        .filter(isIncomeOrExpenseAccount)
        .map((account) => {
          const accountType: "expense" | "income" = account.type;
          const rawAmount = document.transactions.reduce((total, transaction) => {
            if (transaction.occurredOn < range.from || transaction.occurredOn > range.to) {
              return total;
            }

            return (
              total +
              transaction.postings
                .filter(
                  (posting) =>
                    posting.accountId === account.id && posting.amount.commodityCode === commodityCode,
                )
                .reduce((postingTotal, posting) => postingTotal + posting.amount.quantity, 0)
            );
          }, 0);

          const quantity = accountType === "income" ? Math.abs(rawAmount) : rawAmount;

          return {
            accountId: account.id,
            accountName: account.name,
            accountType,
            amount: createMoney(commodityCode, quantity),
          } satisfies IncomeStatementReportLine;
        })
        .filter((line) => line.amount.quantity !== 0)
        .sort((left, right) => left.accountName.localeCompare(right.accountName));
      const incomeTotal = sumMoneyAmounts(
        lines.filter((line) => line.accountType === "income").map((line) => line.amount),
        commodityCode,
      );
      const expenseTotal = sumMoneyAmounts(
        lines.filter((line) => line.accountType === "expense").map((line) => line.amount),
        commodityCode,
      );

      return {
        expenseTotal,
        from: range.from,
        incomeTotal,
        kind: "income-statement",
        lines,
        netIncome: createMoney(commodityCode, incomeTotal.quantity - expenseTotal.quantity),
        to: range.to,
      };
    }
    case "cash-flow": {
      const lines = document.accounts
        .filter((account) => account.type === "asset")
        .map((account) => {
          let inflow = 0;
          let outflow = 0;

          for (const transaction of document.transactions) {
            if (transaction.occurredOn < range.from || transaction.occurredOn > range.to) {
              continue;
            }

            for (const posting of transaction.postings) {
              if (
                posting.accountId === account.id &&
                posting.amount.commodityCode === commodityCode
              ) {
                if (posting.amount.quantity >= 0) {
                  inflow += posting.amount.quantity;
                } else {
                  outflow += Math.abs(posting.amount.quantity);
                }
              }
            }
          }

          return {
            accountId: account.id,
            accountName: account.name,
            inflow: createMoney(commodityCode, inflow),
            net: createMoney(commodityCode, inflow - outflow),
            outflow: createMoney(commodityCode, outflow),
          } satisfies CashFlowReportLine;
        })
        .filter((line) => line.inflow.quantity !== 0 || line.outflow.quantity !== 0)
        .sort((left, right) => left.accountName.localeCompare(right.accountName));

      return {
        from: range.from,
        kind: "cash-flow",
        lines,
        to: range.to,
        totals: {
          inflow: sumMoneyAmounts(lines.map((line) => line.inflow), commodityCode),
          net: sumMoneyAmounts(lines.map((line) => line.net), commodityCode),
          outflow: sumMoneyAmounts(lines.map((line) => line.outflow), commodityCode),
        },
      };
    }
    case "budget-vs-actual": {
      const lines = buildBaselineBudgetSnapshot(
        document.baselineBudgetLines,
        document.accounts,
        document.transactions,
        range,
      );

      return {
        from: range.from,
        kind: "budget-vs-actual",
        lines,
        to: range.to,
        totals: {
          actual: sumMoneyAmounts(lines.map((line) => line.actual), commodityCode),
          planned: sumMoneyAmounts(lines.map((line) => line.planned), commodityCode),
          variance: sumMoneyAmounts(lines.map((line) => line.variance), commodityCode),
        },
      };
    }
    case "envelope-summary": {
      const lines = buildEnvelopeBudgetSnapshot(
        document.envelopes,
        document.envelopeAllocations,
        document.baselineBudgetLines,
        document.accounts,
        document.transactions,
        range,
      );

      return {
        from: range.from,
        kind: "envelope-summary",
        lines,
        to: range.to,
        totals: {
          available: sumMoneyAmounts(lines.map((line) => line.available), commodityCode),
          funded: sumMoneyAmounts(lines.map((line) => line.funded), commodityCode),
          planned: sumMoneyAmounts(lines.map((line) => line.planned), commodityCode),
          spent: sumMoneyAmounts(lines.map((line) => line.spent), commodityCode),
        },
      };
    }
  }
}

export function buildCloseSummary(
  document: FinanceWorkspaceDocument,
  range: {
    from: string;
    to: string;
  },
): CloseSummary {
  const dashboard = buildDashboardSnapshot(document, range);
  const incomeStatement = buildWorkspaceReport(document, {
    from: range.from,
    kind: "income-statement",
    to: range.to,
  });
  const netWorth = buildWorkspaceReport(document, {
    from: range.from,
    kind: "net-worth",
    to: range.to,
  });
  const reconciliationGaps = document.accounts
    .filter((account) => account.type === "asset" || account.type === "liability")
    .filter((account) => hasActivityInRange(document, account.id, range.from, range.to))
    .map((account) => {
      const sessions = document.reconciliationSessions
        .filter((session) => session.accountId === account.id && session.statementDate <= range.to)
        .sort((left, right) => right.statementDate.localeCompare(left.statementDate));
      const lastSession = sessions[0];

      if (lastSession && lastSession.statementDate >= range.to) {
        return undefined;
      }

      return {
        accountId: account.id,
        accountName: account.name,
        lastStatementDate: lastSession?.statementDate,
      };
    })
    .filter((gap) => gap !== undefined)
    .sort((left, right) => left.accountName.localeCompare(right.accountName));
  const checks: CloseSummaryCheck[] = [
    {
      id: "ledger",
      itemCount: dashboard.ledgerErrors.length,
      label: "Ledger validation",
      status: dashboard.ledgerErrors.length === 0 ? "ok" : "attention",
    },
    {
      id: "budget",
      itemCount: dashboard.budgetErrors.length,
      label: "Budget configuration",
      status: dashboard.budgetErrors.length === 0 ? "ok" : "attention",
    },
    {
      id: "schedules",
      itemCount: dashboard.dueTransactions.length,
      label: "Due scheduled transactions",
      status: dashboard.dueTransactions.length === 0 ? "ok" : "attention",
    },
    {
      id: "reconciliation",
      itemCount: reconciliationGaps.length,
      label: "Accounts needing reconciliation",
      status: reconciliationGaps.length === 0 ? "ok" : "attention",
    },
  ];
  const latestClosePeriod = [...(document.closePeriods ?? [])].sort((left, right) =>
    right.to.localeCompare(left.to) || right.closedAt.localeCompare(left.closedAt),
  )[0];

  return {
    checks,
    from: range.from,
    importedTransactionCount: document.transactions.filter(
      (transaction) =>
        transaction.occurredOn >= range.from &&
        transaction.occurredOn <= range.to &&
        transaction.source !== undefined,
    ).length,
    latestClosePeriod,
    netIncome: incomeStatement.netIncome,
    netWorth: netWorth.total,
    readyToClose: checks.every((check) => check.status === "ok"),
    reconciliationGaps,
    to: range.to,
    transactionCount: document.transactions.filter(
      (transaction) => transaction.occurredOn >= range.from && transaction.occurredOn <= range.to,
    ).length,
  };
}
