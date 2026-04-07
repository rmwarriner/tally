import type { WorkspaceResponse } from "./api";
import { formatAccountOptionLabel } from "./app-format";

export interface TransactionEditorPosting {
  accountId: string;
  accountQuery: string;
  amount: string;
  cleared: boolean;
  memo: string;
}

export interface TransactionEditorState {
  description: string;
  occurredOn: string;
  payee: string;
  postings: TransactionEditorPosting[];
  tags: string;
  transactionId: string;
}

export function createTransactionEditorState(
  transaction: WorkspaceResponse["workspace"]["transactions"][number],
  accounts: WorkspaceResponse["workspace"]["accounts"],
): TransactionEditorState {
  return {
    description: transaction.description,
    occurredOn: transaction.occurredOn,
    payee: transaction.payee ?? "",
    postings: transaction.postings.map((posting) => {
      const account = accounts.find((candidate) => candidate.id === posting.accountId);

      return {
        accountId: posting.accountId,
        accountQuery: account ? formatAccountOptionLabel(account) : posting.accountId,
        amount: String(posting.amount.quantity),
        cleared: Boolean(posting.cleared),
        memo: posting.memo ?? "",
      };
    }),
    tags: transaction.tags?.join(", ") ?? "",
    transactionId: transaction.id,
  };
}

export function validateTransactionEditorState(editor: TransactionEditorState): string[] {
  const errors: string[] = [];

  if (!editor.description.trim()) {
    errors.push("Description is required.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(editor.occurredOn.trim())) {
    errors.push("Occurred on must use YYYY-MM-DD format.");
  }

  if (editor.postings.length < 2) {
    errors.push("At least two postings are required.");
  }

  let total = 0;
  editor.postings.forEach((posting, index) => {
    if (!posting.accountId.trim()) {
      errors.push(`Posting ${index + 1} account is required.`);
    }

    const amount = Number.parseFloat(posting.amount);
    if (!Number.isFinite(amount)) {
      errors.push(`Posting ${index + 1} amount must be a number.`);
      return;
    }

    total += amount;
  });

  if (editor.postings.length >= 2 && Math.abs(total) > 0.000001) {
    errors.push("Transaction postings must balance to zero.");
  }

  return errors;
}
