import { randomUUID } from "node:crypto";
import { input } from "@inquirer/prompts";
import type { Command } from "commander";
import { loadAccounts, resolveAccountId } from "../lib/accounts";
import { buildContext } from "../lib/context";
import { parseHumanDate } from "../lib/period";
import { formatMoney, printRows } from "../lib/output";

interface TransactionPosting {
  accountId: string;
  amount: {
    commodityCode: string;
    quantity: number;
  };
  cleared?: boolean;
}

interface Transaction {
  id: string;
  occurredOn: string;
  description: string;
  postings: TransactionPosting[];
}

interface TransactionsEnvelope {
  nextCursor?: string;
  transactions: Transaction[];
}

interface ReconciliationSession {
  id: string;
  accountId: string;
  statementDate: string;
  statementBalance: {
    commodityCode: string;
    quantity: number;
  };
  clearedTransactionIds: string[];
  difference: {
    commodityCode: string;
    quantity: number;
  };
  completedAt?: string;
}

interface BookEnvelope {
  book: {
    reconciliationSessions: ReconciliationSession[];
  };
}

function parseAmount(raw: string): number {
  const normalized = raw.trim().replaceAll(",", "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid amount: ${raw}`);
  }
  return parsed;
}

function parseList(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function displayAmountForAccount(transaction: Transaction, accountId: string): number {
  return transaction.postings
    .filter((posting) => posting.accountId === accountId)
    .reduce((sum, posting) => sum + posting.amount.quantity, 0);
}

async function loadCandidateTransactions(
  command: Command,
  accountId: string,
  statementDate: string,
): Promise<Transaction[]> {
  const context = buildContext(command, { requireBook: true });
  const all: Transaction[] = [];
  let cursor: string | undefined;

  for (;;) {
    const body = await context.api.requestJson<TransactionsEnvelope>(
      "GET",
      `/api/books/${encodeURIComponent(context.bookId ?? "")}/transactions`,
      {
        query: {
          accountId,
          cursor,
          limit: 200,
          to: statementDate,
        },
      },
    );

    all.push(...body.transactions);
    if (!body.nextCursor) {
      break;
    }

    cursor = body.nextCursor;
  }

  return all
    .filter((transaction) => !transaction.postings.every((posting) => posting.cleared === true))
    .sort((left, right) => {
      const byDate = left.occurredOn.localeCompare(right.occurredOn);
      return byDate !== 0 ? byDate : left.id.localeCompare(right.id);
    });
}

async function resolveAccount(command: Command, accountSelector: string): Promise<string> {
  const accounts = await loadAccounts(command);
  return resolveAccountId(accounts, accountSelector);
}

async function runReconcile(command: Command): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const opts = command.opts();
  const isTty = process.stdin.isTTY === true;

  let accountSelector = opts.account as string | undefined;
  if (!accountSelector && isTty) {
    accountSelector = await input({ message: "Account:" });
  }
  if (!accountSelector) {
    throw new Error("reconcile requires --account in non-interactive mode.");
  }

  const accountId = await resolveAccount(command, accountSelector);

  let statementDate = opts.statementDate as string | undefined;
  if (!statementDate && isTty) {
    statementDate = await input({ default: "today", message: "Statement date:" });
  }
  const resolvedStatementDate = parseHumanDate(statementDate ?? "today");

  let statementBalanceRaw = opts.statementBalance as string | undefined;
  if (!statementBalanceRaw && isTty) {
    statementBalanceRaw = await input({ message: "Statement balance:" });
  }
  if (!statementBalanceRaw) {
    throw new Error("reconcile requires --statement-balance in non-interactive mode.");
  }

  const statementBalance = parseAmount(statementBalanceRaw);

  const candidates = await loadCandidateTransactions(command, accountId, resolvedStatementDate);
  let clearedTransactionIds = parseList(opts.cleared as string | undefined);

  if (isTty && clearedTransactionIds.length === 0 && candidates.length > 0) {
    printRows(
      candidates.map((transaction, index) => ({
        amount: formatMoney(displayAmountForAccount(transaction, accountId)),
        date: transaction.occurredOn,
        description: transaction.description,
        id: transaction.id,
        index: String(index + 1),
      })),
      ["index", "date", "id", "description", "amount"],
      "table",
    );

    const selected = await input({
      message: "Cleared transaction IDs (comma-separated, or blank for none):",
    });

    clearedTransactionIds = parseList(selected);
  }

  const reconciliationId = (opts.id as string | undefined) ?? `recon-cli-${randomUUID().slice(0, 8)}`;

  const response = await context.api.writeBookJson<BookEnvelope>(
    "POST",
    context.bookId ?? "",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/reconciliations`,
    {
      payload: {
        accountId,
        clearedTransactionIds,
        reconciliationId,
        statementBalance,
        statementDate: resolvedStatementDate,
      },
    },
  );

  const session = response.book.reconciliationSessions.find((candidate) => candidate.id === reconciliationId);
  const difference = session?.difference.quantity ?? Number.NaN;

  printRows(
    [
      {
        accountId,
        cleared: String(clearedTransactionIds.length),
        difference: Number.isFinite(difference) ? formatMoney(difference) : "unknown",
        reconciliationId,
        statementBalance: formatMoney(statementBalance),
        statementDate: resolvedStatementDate,
        status: difference === 0 ? "balanced" : "difference",
      },
    ],
    ["reconciliationId", "accountId", "statementDate", "statementBalance", "cleared", "difference", "status"],
    context.format,
  );
}

export function registerReconcileCommand(program: Command): void {
  program
    .command("reconcile")
    .description("Reconcile an account against a statement")
    .option("--account <idOrPattern>", "account id or name pattern")
    .option("--statement-date <date>", "statement date", "today")
    .option("--statement-balance <amount>", "statement ending balance")
    .option("--cleared <ids>", "comma-separated cleared transaction IDs")
    .option("--id <id>", "override reconciliation id")
    .action(async function reconcileAction() {
      await runReconcile(this);
    });
}
