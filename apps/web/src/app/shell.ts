import type { FinanceWorkspaceDocument } from "@gnucash-ng/workspace";

export type WorkspaceView =
  | "overview"
  | "ledger"
  | "budget"
  | "envelopes"
  | "imports"
  | "automations"
  | "reports";

export interface WorkspaceViewDefinition {
  description: string;
  detail: string;
  emptyMessage: string;
  id: WorkspaceView;
  label: string;
  shortLabel: string;
  title: string;
}

export interface OverviewCard {
  id: WorkspaceView;
  metric: string;
  summary: string;
}

export interface LedgerBalanceSummary {
  accountId: string;
  accountName: string;
  accountType: string;
  balance: number;
  commodityCode: string;
}

export interface LedgerPostingDetail {
  accountId: string;
  accountName: string;
  amount: number;
  commodityCode: string;
  cleared: boolean;
  memo: string | null;
}

export interface LedgerTransactionDetail {
  description: string;
  id: string;
  matchedAccountIds: string[];
  payee: string | null;
  postings: LedgerPostingDetail[];
  tags: string[];
  occurredOn: string;
}

export interface LedgerWorkspaceModel {
  availableAccounts: FinanceWorkspaceDocument["accounts"];
  filteredBalances: LedgerBalanceSummary[];
  filteredTransactions: LedgerTransactionDetail[];
  selectedAccount:
    | (FinanceWorkspaceDocument["accounts"][number] & {
        balanceCount: number;
        transactionCount: number;
      })
    | null;
  selectedTransaction: LedgerTransactionDetail | null;
}

export const workspaceViews: WorkspaceViewDefinition[] = [
  {
    description: "Cross-workspace operating picture with next actions and integrity status.",
    detail: "Command center",
    emptyMessage: "Overview keeps the current operating picture and next actions in one place.",
    id: "overview",
    label: "Overview",
    shortLabel: "OV",
    title: "Household operating picture",
  },
  {
    description: "Dense register and reconciliation flows for balanced ledger work.",
    detail: "Double-entry workspace",
    emptyMessage: "Register activity will appear here as transactions are captured.",
    id: "ledger",
    label: "Ledger",
    shortLabel: "LE",
    title: "Ledger register",
  },
  {
    description: "Baseline planning view for plan-of-record budget maintenance.",
    detail: "Plan of record",
    emptyMessage: "Budget lines will appear here once the baseline is configured.",
    id: "budget",
    label: "Budget",
    shortLabel: "BU",
    title: "Baseline budget",
  },
  {
    description: "Operational cash allocation and funding flows for envelope work.",
    detail: "Operational budgeting",
    emptyMessage: "Envelope funding state will appear here once categories are configured.",
    id: "envelopes",
    label: "Envelopes",
    shortLabel: "EN",
    title: "Envelope operations",
  },
  {
    description: "Imports and future interchange adapters routed through the service boundary.",
    detail: "Data interchange",
    emptyMessage: "Imports are not configured yet.",
    id: "imports",
    label: "Imports",
    shortLabel: "IM",
    title: "Import workbench",
  },
  {
    description: "Recurring templates, due items, and schedule maintenance.",
    detail: "Automation control",
    emptyMessage: "Scheduled workflows will appear here once recurring items are configured.",
    id: "automations",
    label: "Automations",
    shortLabel: "AU",
    title: "Automation queue",
  },
  {
    description: "Reporting workspace placeholder while close and reporting flows are still on the roadmap.",
    detail: "Reporting roadmap",
    emptyMessage: "Reporting is planned but not yet implemented.",
    id: "reports",
    label: "Reports",
    shortLabel: "RE",
    title: "Reporting and close",
  },
];

export function getWorkspaceViewDefinition(view: WorkspaceView): WorkspaceViewDefinition {
  const definition = workspaceViews.find((candidate) => candidate.id === view);

  if (!definition) {
    throw new Error(`Unknown workspace view: ${view}`);
  }

  return definition;
}

export function createOverviewCards(input: {
  accountBalanceCount: number;
  budgetIssueCount: number;
  dueTransactionCount: number;
  envelopeCount: number;
  ledgerIssueCount: number;
}): OverviewCard[] {
  return [
    {
      id: "ledger",
      metric: `${input.accountBalanceCount}`,
      summary: "accounts with live balances",
    },
    {
      id: "budget",
      metric: `${input.budgetIssueCount}`,
      summary: input.budgetIssueCount === 1 ? "budget issue to review" : "budget issues to review",
    },
    {
      id: "envelopes",
      metric: `${input.envelopeCount}`,
      summary: input.envelopeCount === 1 ? "envelope category active" : "envelope categories active",
    },
    {
      id: "automations",
      metric: `${input.dueTransactionCount}`,
      summary:
        input.dueTransactionCount === 1 ? "scheduled item due soon" : "scheduled items due soon",
    },
    {
      id: "reports",
      metric: `${input.ledgerIssueCount}`,
      summary: input.ledgerIssueCount === 1 ? "ledger warning surfaced" : "ledger warnings surfaced",
    },
  ];
}

export function createLedgerWorkspaceModel(input: {
  accountBalances: LedgerBalanceSummary[];
  searchText: string;
  selectedAccountId: string | null;
  selectedTransactionId: string | null;
  workspace: FinanceWorkspaceDocument;
}): LedgerWorkspaceModel {
  const normalizedSearch = input.searchText.trim().toLowerCase();
  const accountById = new Map(input.workspace.accounts.map((account) => [account.id, account]));
  const filteredTransactions = input.workspace.transactions
    .map((transaction) => {
      const matchedAccountIds = transaction.postings.map((posting) => posting.accountId);
      const postings = transaction.postings.map((posting) => {
        const account = accountById.get(posting.accountId);

        return {
          accountId: posting.accountId,
          accountName: account?.name ?? posting.accountId,
          amount: posting.amount.quantity,
          cleared: Boolean(posting.cleared),
          commodityCode: posting.amount.commodityCode,
          memo: posting.memo ?? null,
        };
      });

      return {
        description: transaction.description,
        id: transaction.id,
        matchedAccountIds,
        occurredOn: transaction.occurredOn,
        payee: transaction.payee ?? null,
        postings,
        tags: transaction.tags ?? [],
      };
    })
    .filter((transaction) => {
      if (input.selectedAccountId && !transaction.matchedAccountIds.includes(input.selectedAccountId)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchCorpus = [
        transaction.id,
        transaction.description,
        transaction.payee ?? "",
        transaction.occurredOn,
        transaction.tags.join(" "),
        ...transaction.postings.map(
          (posting) => `${posting.accountId} ${posting.accountName} ${posting.memo ?? ""}`,
        ),
      ]
        .join(" ")
        .toLowerCase();

      return searchCorpus.includes(normalizedSearch);
    })
    .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn));

  const filteredBalances = input.accountBalances.filter((balance) => {
    if (!input.selectedAccountId) {
      return true;
    }

    return balance.accountId === input.selectedAccountId;
  });

  const selectedAccountRecord = input.selectedAccountId
    ? accountById.get(input.selectedAccountId) ?? null
    : null;
  const selectedAccount = selectedAccountRecord
    ? {
        ...selectedAccountRecord,
        balanceCount: input.accountBalances.filter(
          (balance) => balance.accountId === selectedAccountRecord.id,
        ).length,
        transactionCount: input.workspace.transactions.filter((transaction) =>
          transaction.postings.some((posting) => posting.accountId === selectedAccountRecord.id),
        ).length,
      }
    : null;
  const selectedTransaction =
    filteredTransactions.find((transaction) => transaction.id === input.selectedTransactionId) ?? null;

  return {
    availableAccounts: input.workspace.accounts,
    filteredBalances,
    filteredTransactions,
    selectedAccount,
    selectedTransaction,
  };
}
