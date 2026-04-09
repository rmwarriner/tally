import { randomUUID } from "node:crypto";
import { confirm, input, select } from "@inquirer/prompts";
import type { Command } from "commander";
import { buildContext } from "../lib/context";
import { parseHumanDate, resolveDateRange } from "../lib/period";
import { formatMoney, printRows } from "../lib/output";

interface Account {
  id: string;
  name: string;
}

interface AccountsEnvelope {
  accounts: Account[];
}

interface TransactionPosting {
  accountId: string;
  amount: {
    commodityCode: string;
    quantity: number;
  };
  cleared?: boolean;
}

interface Transaction {
  deletion?: unknown;
  description: string;
  id: string;
  occurredOn: string;
  postings: TransactionPosting[];
}

interface TransactionsEnvelope {
  nextCursor?: string;
  transactions: Transaction[];
}

function addDateOptions(command: Command): Command {
  return command
    .option("-p, --period <expr>", "period shorthand")
    .option("-b, --begin <date>", "start date (inclusive)")
    .option("-e, --end <date>", "end date (inclusive)");
}

async function loadAccounts(command: Command): Promise<Account[]> {
  const context = buildContext(command, { requireBook: true });
  const body = await context.api.requestJson<AccountsEnvelope>(
    "GET",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/accounts`,
    { query: { includeArchived: true } },
  );
  return body.accounts;
}

function resolveAccountId(accounts: Account[], selector: string): string {
  const trimmed = selector.trim();
  const exact = accounts.find((account) => account.id === trimmed);
  if (exact) {
    return exact.id;
  }

  const lower = trimmed.toLowerCase();
  const matches = accounts.filter((account) => account.name.toLowerCase().includes(lower));
  if (matches.length === 1) {
    return matches[0]!.id;
  }
  if (matches.length > 1) {
    throw new Error(`Account selector "${selector}" is ambiguous (${matches.length} matches).`);
  }

  throw new Error(`No account found for selector "${selector}".`);
}

function deriveTransactionStatus(transaction: Transaction): "pending" | "cleared" | "deleted" {
  if (transaction.deletion) {
    return "deleted";
  }
  return transaction.postings.every((posting) => posting.cleared === true) ? "cleared" : "pending";
}

function deriveDisplayAmount(transaction: Transaction): number {
  const debitTotal = transaction.postings
    .filter((posting) => posting.amount.quantity > 0)
    .reduce((sum, posting) => sum + posting.amount.quantity, 0);
  return debitTotal;
}

function parseAmount(raw: string): number {
  const normalized = raw.trim().replaceAll(",", "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed === 0) {
    throw new Error(`Invalid amount: ${raw}`);
  }
  return parsed;
}

async function promptForPostingAmount(): Promise<number> {
  const rawAmount = await input({
    message: "Amount:",
    validate: (value) => {
      try {
        parseAmount(value);
        return true;
      } catch (error) {
        return error instanceof Error ? error.message : "Invalid amount";
      }
    },
  });

  const hasSign = rawAmount.trim().startsWith("+") || rawAmount.trim().startsWith("-");
  const absolute = Math.abs(parseAmount(rawAmount));
  if (hasSign) {
    return parseAmount(rawAmount);
  }

  const side = await select({
    choices: [
      { name: "Debit (+)", value: "debit" },
      { name: "Credit (-)", value: "credit" },
    ],
    message: "Posting side:",
  });
  return side === "debit" ? absolute : -absolute;
}

async function collectPostingsInteractively(accounts: Account[]): Promise<TransactionPosting[]> {
  const postings: TransactionPosting[] = [];
  let imbalance = 0;

  while (postings.length < 2 || imbalance !== 0) {
    console.log(`\nPosting ${postings.length + 1}`);
    const accountSelector = await input({ message: "Account:" });
    const accountId = resolveAccountId(accounts, accountSelector);
    const quantity = await promptForPostingAmount();
    postings.push({
      accountId,
      amount: {
        commodityCode: "USD",
        quantity,
      },
    });

    imbalance = postings.reduce((sum, posting) => sum + posting.amount.quantity, 0);
    const marker = imbalance === 0 ? "✓" : "";
    const formatted =
      imbalance > 0 ? `+${formatMoney(imbalance)}` : formatMoney(imbalance);
    console.log(`Unbalanced: ${formatted} ${marker}`.trim());
  }

  return postings;
}

function addTransactionRows(transactions: Transaction[]): Array<Record<string, string>> {
  return transactions.map((transaction) => ({
    amount: formatMoney(deriveDisplayAmount(transaction)),
    date: transaction.occurredOn,
    description: transaction.description,
    id: transaction.id,
    status: deriveTransactionStatus(transaction),
  }));
}

async function runTransactionsList(command: Command): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const opts = command.opts();
  const limit = Number.parseInt(String(opts.limit ?? "50"), 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("limit must be an integer between 1 and 200");
  }

  const range = resolveDateRange({
    begin: opts.begin,
    end: opts.end,
    period: opts.period,
  });

  let accountId: string | undefined;
  if (opts.account) {
    const accounts = await loadAccounts(command);
    accountId = resolveAccountId(accounts, opts.account);
  }

  const body = await context.api.requestJson<TransactionsEnvelope>(
    "GET",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/transactions`,
    {
      query: {
        accountId,
        cursor: opts.cursor,
        from: range?.from,
        limit,
        status: opts.status,
        to: range?.to,
      },
    },
  );

  if (context.format === "json") {
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  printRows(
    addTransactionRows(body.transactions),
    ["date", "id", "description", "status", "amount"],
    context.format,
  );
  if (body.nextCursor) {
    console.log(`next cursor: ${body.nextCursor}`);
  }
}

async function runTransactionsAdd(
  command: Command,
  amountArg?: string,
  memoArg?: string,
): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const opts = command.opts();
  const occurredOn = parseHumanDate(String(opts.date ?? "today"));
  const status = opts.status === "cleared" ? "cleared" : "pending";
  const accounts = await loadAccounts(command);

  let postings: TransactionPosting[] = [];
  let description = (memoArg ?? "CLI transaction").trim() || "CLI transaction";
  let interactiveOccurredOn = occurredOn;
  let interactiveStatus = status;

  if (amountArg && opts.debit && opts.credit) {
    const amount = parseAmount(amountArg);
    const debitId = resolveAccountId(accounts, opts.debit);
    const creditId = resolveAccountId(accounts, opts.credit);
    postings = [
      {
        accountId: debitId,
        amount: { commodityCode: "USD", quantity: Math.abs(amount) },
      },
      {
        accountId: creditId,
        amount: { commodityCode: "USD", quantity: -Math.abs(amount) },
      },
    ];
  } else {
    if (!process.stdin.isTTY) {
      throw new Error(
        "Non-interactive mode requires [amount], --debit, and --credit for `transactions add`.",
      );
    }

    description = (
      await input({
        default: memoArg ?? "",
        message: "Memo:",
        validate: (value) => (value.trim().length > 0 ? true : "Memo is required."),
      })
    ).trim();

    interactiveOccurredOn = parseHumanDate(
      await input({
        default: occurredOn,
        message: "Date:",
        validate: (value) => {
          try {
            parseHumanDate(value);
            return true;
          } catch (error) {
            return error instanceof Error ? error.message : "Invalid date.";
          }
        },
      }),
    );

    interactiveStatus = await select({
      choices: [
        { name: "pending", value: "pending" },
        { name: "cleared", value: "cleared" },
      ],
      default: status,
      message: "Status:",
    });

    postings = await collectPostingsInteractively(accounts);
    const imbalance = postings.reduce((sum, posting) => sum + posting.amount.quantity, 0);
    if (imbalance !== 0) {
      throw new Error("Transaction is unbalanced.");
    }
  }

  if (postings.length < 2) {
    throw new Error("Transaction must include at least two postings.");
  }

  if (process.stdin.isTTY) {
    const amountPreview = Math.abs(postings.find((item) => item.amount.quantity > 0)?.amount.quantity ?? 0);
    const approved = await confirm({
      default: true,
      message: `Post transaction ${description} (${formatMoney(amountPreview)} USD)?`,
    });
    if (!approved) {
      console.log("Cancelled.");
      return;
    }
  }

  const resolvedStatus = amountArg && opts.debit && opts.credit ? status : interactiveStatus;
  const transaction = {
    description,
    id: `txn-cli-${randomUUID().slice(0, 8)}`,
    occurredOn: amountArg && opts.debit && opts.credit ? occurredOn : interactiveOccurredOn,
    postings: postings.map((posting) => ({
      ...posting,
      cleared: resolvedStatus === "cleared",
    })),
  };

  await context.api.writeBookJson(
    "POST",
    context.bookId ?? "",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/transactions`,
    { transaction },
  );

  printRows(
    [
      {
        date: transaction.occurredOn,
        description: transaction.description,
        id: transaction.id,
        postings: String(transaction.postings.length),
        status: resolvedStatus,
      },
    ],
    ["id", "date", "description", "status", "postings"],
    context.format,
  );
}

function addListOptions(command: Command): Command {
  return addDateOptions(command)
    .option("--account <idOrPattern>", "filter by account id or name pattern")
    .option("--status <state>", "pending|cleared|deleted")
    .option("--limit <n>", "page size", "50")
    .option("--cursor <token>", "pagination cursor");
}

function addAddOptions(command: Command): Command {
  return command
    .argument("[amount]", "amount")
    .argument("[memo]", "description memo")
    .option("--debit <account>", "debit account id or name pattern")
    .option("--credit <account>", "credit account id or name pattern")
    .option("--date <date>", "occurred date", "today")
    .option("--status <state>", "pending|cleared", "pending");
}

export function registerTransactionsCommands(program: Command): void {
  const transactions = program.command("transactions").description("Transaction commands");

  addListOptions(
    transactions
      .command("list")
      .alias("ls")
      .description("List transactions"),
  ).action(async function transactionsListAction() {
    await runTransactionsList(this);
  });

  addAddOptions(
    transactions
      .command("add")
      .description("Add a transaction"),
  ).action(async function transactionsAddAction(amountArg?: string, memoArg?: string) {
    await runTransactionsAdd(this, amountArg, memoArg);
  });

  addListOptions(program.command("reg").description("Alias for transactions list"))
    .action(async function regAction() {
      await runTransactionsList(this);
    });

  addAddOptions(program.command("add").description("Alias for transactions add"))
    .action(async function addAction(amountArg?: string, memoArg?: string) {
      await runTransactionsAdd(this, amountArg, memoArg);
    });
}
