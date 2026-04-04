import type {
  Account,
  BaselineBudgetLine,
  Envelope,
  MoneyAmount,
  Posting,
  Transaction,
} from "./types";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function sumPostings(postings: Posting[], commodityCode: string): number {
  return postings
    .filter((posting) => posting.amount.commodityCode === commodityCode)
    .reduce((total, posting) => total + posting.amount.quantity, 0);
}

export function validateBalancedTransaction(transaction: Transaction): ValidationResult {
  if (transaction.postings.length < 2) {
    return { ok: false, errors: ["A transaction must contain at least two postings."] };
  }

  const commodityCodes = new Set(transaction.postings.map((posting) => posting.amount.commodityCode));
  const errors: string[] = [];

  for (const commodityCode of commodityCodes) {
    if (sumPostings(transaction.postings, commodityCode) !== 0) {
      errors.push(`Transaction is not balanced for commodity ${commodityCode}.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateEnvelope(envelope: Envelope, accounts: Account[]): ValidationResult {
  const errors: string[] = [];
  const expenseAccount = accounts.find((account) => account.id === envelope.expenseAccountId);
  const fundingAccount = accounts.find((account) => account.id === envelope.fundingAccountId);

  if (!expenseAccount || expenseAccount.type !== "expense") {
    errors.push("Envelope expense account must reference an expense account.");
  }

  if (!fundingAccount || fundingAccount.type !== "asset") {
    errors.push("Envelope funding account must reference an asset account.");
  }

  if (envelope.availableAmount.quantity < 0) {
    errors.push("Envelope available amount cannot start negative.");
  }

  return { ok: errors.length === 0, errors };
}

export function validateBaselineBudgetLine(
  budgetLine: BaselineBudgetLine,
  accounts: Account[],
): ValidationResult {
  const account = accounts.find((candidate) => candidate.id === budgetLine.accountId);

  if (!account) {
    return { ok: false, errors: ["Budget line references an unknown account."] };
  }

  if (account.type !== "expense" && account.type !== "income") {
    return {
      ok: false,
      errors: ["Baseline budgets should point to income or expense accounts only."],
    };
  }

  return { ok: true, errors: [] };
}

export function createMoney(commodityCode: string, quantity: number): MoneyAmount {
  return { commodityCode, quantity };
}
