import {
  createMoney,
  validateBalancedTransaction,
  type ValidationResult,
} from "./accounting";
import type {
  Account,
  AccountType,
  MoneyAmount,
  Posting,
  Transaction,
} from "./types";

export interface AccountBalance {
  accountId: string;
  accountName: string;
  accountType: AccountType;
  commodityCode: string;
  balance: number;
}

export interface LedgerState {
  accounts: Account[];
  transactions: Transaction[];
}

export interface LedgerMutationResult {
  ok: boolean;
  errors: string[];
  ledger: LedgerState;
}

function isFiniteAmount(posting: Posting): boolean {
  return Number.isFinite(posting.amount.quantity);
}

function buildAccountIndex(accounts: Account[]): Map<string, Account> {
  return new Map(accounts.map((account) => [account.id, account]));
}

function compareIsoDate(left: string, right: string): number {
  return left.localeCompare(right);
}

export function validateTransactionForLedger(
  transaction: Transaction,
  accounts: Account[],
): ValidationResult {
  const balanced = validateBalancedTransaction(transaction);
  const accountIndex = buildAccountIndex(accounts);
  const errors = [...balanced.errors];

  if (!transaction.description.trim()) {
    errors.push("Transaction description is required.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction.occurredOn)) {
    errors.push("Transaction occurredOn must use ISO date format YYYY-MM-DD.");
  }

  for (const posting of transaction.postings) {
    if (!accountIndex.has(posting.accountId)) {
      errors.push(`Posting references unknown account ${posting.accountId}.`);
    }

    if (!posting.amount.commodityCode.trim()) {
      errors.push("Posting commodity code is required.");
    }

    if (!isFiniteAmount(posting)) {
      errors.push("Posting amount must be a finite number.");
    }

    if (posting.amount.quantity === 0) {
      errors.push("Posting amount cannot be zero.");
    }
  }

  return { ok: errors.length === 0, errors };
}

export function postTransaction(
  ledger: LedgerState,
  transaction: Transaction,
): LedgerMutationResult {
  const errors: string[] = [];

  if (ledger.transactions.some((entry) => entry.id === transaction.id)) {
    errors.push(`Transaction ${transaction.id} already exists.`);
  }

  const validation = validateTransactionForLedger(transaction, ledger.accounts);
  errors.push(...validation.errors);

  if (errors.length > 0) {
    return { ok: false, errors, ledger };
  }

  const transactions = [...ledger.transactions, transaction].sort((left, right) => {
    const byDate = compareIsoDate(left.occurredOn, right.occurredOn);

    return byDate !== 0 ? byDate : left.id.localeCompare(right.id);
  });

  return {
    ok: true,
    errors: [],
    ledger: {
      ...ledger,
      transactions,
    },
  };
}

export function computeAccountBalances(
  accounts: Account[],
  transactions: Transaction[],
  throughDate?: string,
): AccountBalance[] {
  const balances = new Map<string, number>();
  const accountIndex = buildAccountIndex(accounts);

  for (const transaction of transactions) {
    if (throughDate && compareIsoDate(transaction.occurredOn, throughDate) > 0) {
      continue;
    }

    for (const posting of transaction.postings) {
      const key = `${posting.accountId}:${posting.amount.commodityCode}`;
      balances.set(key, (balances.get(key) ?? 0) + posting.amount.quantity);
    }
  }

  return [...balances.entries()]
    .map(([key, balance]) => {
      const [accountId, commodityCode] = key.split(":");
      const account = accountIndex.get(accountId);

      if (!account) {
        return undefined;
      }

      return {
        accountId,
        accountName: account.name,
        accountType: account.type,
        commodityCode,
        balance,
      } satisfies AccountBalance;
    })
    .filter((entry): entry is AccountBalance => entry !== undefined)
    .sort((left, right) => left.accountName.localeCompare(right.accountName));
}

export function listTransactionsForAccount(
  accountId: string,
  transactions: Transaction[],
): Transaction[] {
  return transactions.filter((transaction) =>
    transaction.postings.some((posting) => posting.accountId === accountId),
  );
}

export function sumPostingsForAccount(
  accountId: string,
  transactions: Transaction[],
  commodityCode: string,
  throughDate?: string,
): MoneyAmount {
  const quantity = transactions.reduce((total, transaction) => {
    if (throughDate && compareIsoDate(transaction.occurredOn, throughDate) > 0) {
      return total;
    }

    return (
      total +
      transaction.postings
        .filter(
          (posting) =>
            posting.accountId === accountId && posting.amount.commodityCode === commodityCode,
        )
        .reduce((postingTotal, posting) => postingTotal + posting.amount.quantity, 0)
    );
  }, 0);

  return createMoney(commodityCode, quantity);
}

export function calculateNetWorth(
  accounts: Account[],
  transactions: Transaction[],
  commodityCode: string,
  throughDate?: string,
): MoneyAmount {
  const balances = computeAccountBalances(accounts, transactions, throughDate);
  const quantity = balances.reduce((total, balance) => {
    if (balance.commodityCode !== commodityCode) {
      return total;
    }

    if (balance.accountType === "asset") {
      return total + balance.balance;
    }

    if (balance.accountType === "liability") {
      return total - balance.balance;
    }

    return total;
  }, 0);

  return createMoney(commodityCode, quantity);
}
