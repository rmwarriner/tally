import type { FinanceBookDocument, ReconciliationSession } from "@tally/book";

export type BookView =
  | "overview"
  | "ledger"
  | "budget"
  | "envelopes"
  | "imports"
  | "automations"
  | "reports";

export interface BookViewDefinition {
  description: string;
  detail: string;
  emptyMessage: string;
  id: BookView;
  label: string;
  shortLabel: string;
  title: string;
}

export interface OverviewCard {
  id: BookView;
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
  accountCode: string | null;
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
  status: "cleared" | "open" | "reconciled";
  tags: string[];
  occurredOn: string;
}

export interface LedgerBookModel {
  availableAccounts: FinanceBookDocument["accounts"];
  filteredBalances: LedgerBalanceSummary[];
  filteredTransactions: LedgerTransactionDetail[];
  isFiltered: boolean;
  openingBalance: number;
  selectedAccountBalance: LedgerBalanceSummary | null;
  selectedAccount:
    | (FinanceBookDocument["accounts"][number] & {
        balanceCount: number;
        transactionCount: number;
      })
    | null;
  selectedTransaction: LedgerTransactionDetail | null;
  totalCount: number;
}

export interface ReconciliationCandidate {
  accountAmount: number;
  description: string;
  id: string;
  occurredOn: string;
  payee: string | null;
  selected: boolean;
}

export interface ReconciliationBookModel {
  candidateTransactions: ReconciliationCandidate[];
  clearedTotal: number;
  difference: number | null;
  latestSession: ReconciliationSession | undefined;
  selectedAccount: FinanceBookDocument["accounts"][number] | null;
  statementBalance: number | null;
}

export interface AccountSearchMatch {
  account: FinanceBookDocument["accounts"][number];
  label: string;
  meta: string;
  recommended: boolean;
}

export interface PostingBalanceSummary {
  balance: number | null;
  defaultAmount: string;
  isBalanced: boolean;
}

function normalizeAccountSearchValue(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeSearchTokens(value: string): string[] {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function getAccountSearchLabel(account: FinanceBookDocument["accounts"][number]): string {
  return account.code ? `${account.name} (${account.code})` : account.name;
}

function getAccountSearchMeta(account: FinanceBookDocument["accounts"][number]): string {
  return [account.type, account.id].filter(Boolean).join(" · ");
}

export function getPreferredAccountTypesForPostingAmount(amountText: string): string[] {
  const amount = Number.parseFloat(amountText);

  if (!Number.isFinite(amount) || amount === 0) {
    return [];
  }

  return amount > 0 ? ["asset", "expense"] : ["liability", "equity", "income"];
}

export function getPostingBalanceSummary(amountTexts: string[]): PostingBalanceSummary {
  let balance = 0;

  for (const amountText of amountTexts) {
    const amount = Number.parseFloat(amountText);

    if (!Number.isFinite(amount)) {
      return {
        balance: null,
        defaultAmount: "0",
        isBalanced: false,
      };
    }

    balance += amount;
  }

  const normalizedBalance = Math.abs(balance) <= 0.000001 ? 0 : balance;

  return {
    balance: normalizedBalance,
    defaultAmount: normalizedBalance === 0 ? "0" : String(-normalizedBalance),
    isBalanced: normalizedBalance === 0,
  };
}

function scoreAccountSearchMatch(input: {
  account: FinanceBookDocument["accounts"][number];
  query: string;
}): number {
  const tokens = normalizeSearchTokens(input.query);

  if (tokens.length === 0) {
    return 0;
  }

  const query = tokens.join(" ");

  const name = normalizeAccountSearchValue(input.account.name);
  const code = normalizeAccountSearchValue(input.account.code ?? "");
  const id = normalizeAccountSearchValue(input.account.id);
  const type = normalizeAccountSearchValue(input.account.type);

  if (name === query || code === query || id === query) {
    return 400;
  }

  if (name.startsWith(query)) {
    return 300;
  }

  if (code.startsWith(query)) {
    return 260;
  }

  if (id.startsWith(query)) {
    return 220;
  }

  if (name.includes(query)) {
    return 180;
  }

  if (code.includes(query)) {
    return 150;
  }

  if (type.includes(query) || id.includes(query)) {
    return 100;
  }

  const searchValues = [name, code, id, type].filter(Boolean);
  const tokenMatches = tokens.every((token) =>
    searchValues.some((value) => value.includes(token)),
  );

  if (tokenMatches) {
    return 140;
  }

  return -1;
}

export function findAccountSearchExactMatch(input: {
  accounts: FinanceBookDocument["accounts"];
  query: string;
}): FinanceBookDocument["accounts"][number] | null {
  const query = normalizeAccountSearchValue(input.query);

  if (!query) {
    return null;
  }

  return (
    input.accounts.find((account) => {
      const values = [
        account.id,
        account.name,
        account.code ?? "",
        getAccountSearchLabel(account),
      ].map(normalizeAccountSearchValue);

      return values.includes(query);
    }) ?? null
  );
}

export function getAccountSearchMatches(input: {
  accounts: FinanceBookDocument["accounts"];
  limit?: number;
  preferredAccountTypes?: string[];
  query: string;
  selectedAccountId?: string | null;
}): AccountSearchMatch[] {
  const query = normalizeAccountSearchValue(input.query);
  const preferredTypes = new Set(
    (input.preferredAccountTypes ?? []).map((type) => normalizeAccountSearchValue(type)),
  );
  const matches = input.accounts
    .map((account) => ({
      account,
      preferred: preferredTypes.has(normalizeAccountSearchValue(account.type)),
      score: scoreAccountSearchMatch({
        account,
        query,
      }),
    }))
    .filter(({ score }) => score >= 0)
    .sort((left, right) => {
      if (input.selectedAccountId) {
        const leftSelected = left.account.id === input.selectedAccountId;
        const rightSelected = right.account.id === input.selectedAccountId;

        if (leftSelected !== rightSelected) {
          return leftSelected ? -1 : 1;
        }
      }

      if (left.score !== right.score) {
        return right.score - left.score;
      }

      if (left.preferred !== right.preferred) {
        return left.preferred ? -1 : 1;
      }

      return left.account.name.localeCompare(right.account.name);
    })
    .slice(0, input.limit ?? 8);

  return matches.map(({ account, preferred }) => ({
    account,
    label: getAccountSearchLabel(account),
    meta: getAccountSearchMeta(account),
    recommended: preferred,
  }));
}

function getTransactionStatus(
  transaction: FinanceBookDocument["transactions"][number],
): "cleared" | "open" | "reconciled" {
  const postingStates = transaction.postings.map((posting) =>
    posting.reconciledAt ? "reconciled" : posting.cleared ? "cleared" : "open",
  );

  if (postingStates.length > 0 && postingStates.every((state) => state === "reconciled")) {
    return "reconciled";
  }

  if (postingStates.some((state) => state === "cleared" || state === "reconciled")) {
    return "cleared";
  }

  return "open";
}

export function getLedgerSelectionIndex(input: {
  selectedTransactionId: string | null;
  transactions: LedgerTransactionDetail[];
}): number {
  if (!input.selectedTransactionId) {
    return -1;
  }

  return input.transactions.findIndex(
    (transaction) => transaction.id === input.selectedTransactionId,
  );
}

export function getNextLedgerTransactionId(input: {
  direction: "next" | "previous";
  selectedTransactionId: string | null;
  transactions: LedgerTransactionDetail[];
}): string | null {
  if (input.transactions.length === 0) {
    return null;
  }

  const currentIndex = getLedgerSelectionIndex({
    selectedTransactionId: input.selectedTransactionId,
    transactions: input.transactions,
  });

  if (currentIndex === -1) {
    return input.direction === "next"
      ? input.transactions[0]?.id ?? null
      : input.transactions[input.transactions.length - 1]?.id ?? null;
  }

  const nextIndex =
    input.direction === "next"
      ? Math.min(currentIndex + 1, input.transactions.length - 1)
      : Math.max(currentIndex - 1, 0);

  return input.transactions[nextIndex]?.id ?? null;
}

export function shouldHandleLedgerHotkey(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") {
    return true;
  }

  const candidate = target as { isContentEditable?: boolean; tagName?: string };
  const tagName = candidate.tagName?.toLowerCase();

  if (!tagName) {
    return true;
  }

  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return false;
  }

  return !candidate.isContentEditable;
}

export function getTransactionEditorHotkeyAction(input: {
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
}): "reset" | "save" | null {
  const normalizedKey = input.key.toLowerCase();

  if (normalizedKey === "escape") {
    return "reset";
  }

  if ((input.ctrlKey || input.metaKey) && (normalizedKey === "s" || normalizedKey === "enter")) {
    return "save";
  }

  return null;
}

export function getNextPostingAmountFocusTarget(input: {
  postingCount: number;
  postingIndex: number;
}): { addPosting: boolean; focusIndex: number } {
  if (input.postingIndex >= input.postingCount - 1) {
    return {
      addPosting: true,
      focusIndex: input.postingCount,
    };
  }

  return {
    addPosting: false,
    focusIndex: input.postingIndex + 1,
  };
}

export type PostingFocusField = "account" | "amount" | "memo";

export function getNextPostingFocusTarget(input: {
  field: PostingFocusField;
  postingCount: number;
  postingIndex: number;
}): { addPosting: boolean; field: PostingFocusField; focusIndex: number } {
  if (input.field === "account") {
    return {
      addPosting: false,
      field: "amount",
      focusIndex: input.postingIndex,
    };
  }

  if (input.field === "amount") {
    return {
      addPosting: false,
      field: "memo",
      focusIndex: input.postingIndex,
    };
  }

  if (input.postingIndex >= input.postingCount - 1) {
    return {
      addPosting: true,
      field: "account",
      focusIndex: input.postingCount,
    };
  }

  return {
    addPosting: false,
    field: "account",
    focusIndex: input.postingIndex + 1,
  };
}

export function movePostingIndex(input: {
  direction: "up" | "down";
  postingCount: number;
  postingIndex: number;
}): number {
  if (input.direction === "up") {
    return Math.max(0, input.postingIndex - 1);
  }

  return Math.min(input.postingCount - 1, input.postingIndex + 1);
}

function getTransactionAmountForAccount(
  transaction: FinanceBookDocument["transactions"][number],
  accountId: string,
): number {
  return transaction.postings
    .filter((posting) => posting.accountId === accountId)
    .reduce((sum, posting) => sum + posting.amount.quantity, 0);
}

export function createReconciliationBookModel(input: {
  selectedAccountId: string;
  selectedTransactionIds: Record<string, boolean>;
  statementBalanceText: string;
  statementDate: string;
  book: FinanceBookDocument;
}): ReconciliationBookModel {
  const reconciliationAccounts = input.book.accounts.filter(
    (account) => account.type === "asset" || account.type === "liability",
  );
  const selectedAccount =
    reconciliationAccounts.find((account) => account.id === input.selectedAccountId) ?? null;
  const candidateTransactions = selectedAccount
    ? input.book.transactions
        .filter(
          (transaction) =>
            transaction.occurredOn <= input.statementDate.trim() &&
            transaction.postings.some((posting) => posting.accountId === selectedAccount.id),
        )
        .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn))
        .map((transaction) => ({
          accountAmount: getTransactionAmountForAccount(transaction, selectedAccount.id),
          description: transaction.description,
          id: transaction.id,
          occurredOn: transaction.occurredOn,
          payee: transaction.payee ?? null,
          selected: Boolean(input.selectedTransactionIds[transaction.id]),
        }))
    : [];
  const clearedTotal = candidateTransactions.reduce((sum, transaction) => {
    if (!transaction.selected) {
      return sum;
    }

    return sum + transaction.accountAmount;
  }, 0);
  const statementBalance = Number.parseFloat(input.statementBalanceText);
  const latestSession = selectedAccount
    ? [...input.book.reconciliationSessions]
        .filter((session) => session.accountId === selectedAccount.id)
        .sort((left, right) => right.statementDate.localeCompare(left.statementDate))[0]
    : undefined;

  return {
    candidateTransactions,
    clearedTotal,
    difference: Number.isFinite(statementBalance) ? statementBalance - clearedTotal : null,
    latestSession,
    selectedAccount,
    statementBalance: Number.isFinite(statementBalance) ? statementBalance : null,
  };
}

export const bookViews: BookViewDefinition[] = [
  {
    description: "Cross-book operating picture with next actions and integrity status.",
    detail: "Command center",
    emptyMessage: "Overview keeps the current operating picture and next actions in one place.",
    id: "overview",
    label: "Overview",
    shortLabel: "OV",
    title: "Household operating picture",
  },
  {
    description: "Dense register and reconciliation flows for balanced ledger work.",
    detail: "Double-entry ledger",
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
    description: "Reporting placeholder while close and reporting flows are still on the roadmap.",
    detail: "Reporting roadmap",
    emptyMessage: "Reporting is planned but not yet implemented.",
    id: "reports",
    label: "Reports",
    shortLabel: "RE",
    title: "Reporting and close",
  },
];

export function getBookViewDefinition(view: BookView): BookViewDefinition {
  const definition = bookViews.find((candidate) => candidate.id === view);

  if (!definition) {
    throw new Error();
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

export function createLedgerBookModel(input: {
  accountBalances: LedgerBalanceSummary[];
  rangeEnd?: string;
  rangeStart?: string;
  searchText: string;
  statusFilter?: "all" | "cleared" | "open" | "reconciled";
  selectedAccountId: string | null;
  selectedTransactionId: string | null;
  book: FinanceBookDocument;
}): LedgerBookModel {
  const searchTokens = normalizeSearchTokens(input.searchText);
  const isFiltered = searchTokens.length > 0;
  const accountById = new Map(input.book.accounts.map((account) => [account.id, account]));
  const candidateTransactions = input.book.transactions
    .map((transaction) => {
      const matchedAccountIds = transaction.postings.map((posting) => posting.accountId);
      const postings = transaction.postings.map((posting) => {
        const account = accountById.get(posting.accountId);

        return {
          accountId: posting.accountId,
          accountCode: account?.code ?? null,
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
        status: getTransactionStatus(transaction),
        tags: transaction.tags ?? [],
      };
    })
    .filter((transaction) => {
      if (input.selectedAccountId && !transaction.matchedAccountIds.includes(input.selectedAccountId)) {
        return false;
      }

      if (input.rangeStart && transaction.occurredOn < input.rangeStart) {
        return false;
      }

      if (input.rangeEnd && transaction.occurredOn > input.rangeEnd) {
        return false;
      }

      if (input.statusFilter && input.statusFilter !== "all" && transaction.status !== input.statusFilter) {
        return false;
      }

      return true;
    })
    .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn));

  const totalCount = candidateTransactions.length;
  const filteredTransactions = candidateTransactions.filter((transaction) => {
    if (searchTokens.length === 0) {
      return true;
    }

    const searchCorpus = normalizeAccountSearchValue(
      [
        transaction.id,
        transaction.description,
        transaction.payee ?? "",
        transaction.occurredOn,
        transaction.status,
        transaction.tags.join(" "),
        ...transaction.postings.map(
          (posting) =>
            `${posting.accountId} ${posting.accountCode ?? ""} ${posting.accountName} ${posting.memo ?? ""}`,
        ),
      ].join(" "),
    );

    return searchTokens.every((token) => searchCorpus.includes(token));
  });

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
        transactionCount: input.book.transactions.filter((transaction) =>
          transaction.postings.some((posting) => posting.accountId === selectedAccountRecord.id),
        ).length,
      }
    : null;
  const selectedTransaction =
    filteredTransactions.find((transaction) => transaction.id === input.selectedTransactionId) ?? null;
  const rangeStart = input.rangeStart;
  const openingBalance =
    input.selectedAccountId && rangeStart
      ? input.book.transactions.reduce((sum, transaction) => {
          if (transaction.occurredOn >= rangeStart) {
            return sum;
          }

          return (
            sum +
            transaction.postings.reduce((postingSum, posting) => {
              if (posting.accountId !== input.selectedAccountId) {
                return postingSum;
              }

              return postingSum + posting.amount.quantity;
            }, 0)
          );
        }, 0)
      : 0;

  return {
    availableAccounts: input.book.accounts,
    filteredBalances,
    filteredTransactions,
    isFiltered,
    openingBalance,
    selectedAccountBalance:
      filteredBalances.find((balance) => balance.accountId === input.selectedAccountId) ?? null,
    selectedAccount,
    selectedTransaction,
    totalCount,
  };
}
