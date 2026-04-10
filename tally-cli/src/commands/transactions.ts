import { randomUUID } from "node:crypto";
import { confirm, input, select } from "@inquirer/prompts";
import type { Command } from "commander";
import { loadAccounts, resolveAccountId, type CliAccount } from "../lib/accounts";
import { buildContext, type CommandContext } from "../lib/context";
import { parseHumanDate, resolveDateRange } from "../lib/period";
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

class InteractiveCancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InteractiveCancelledError";
  }
}

function addDateOptions(command: Command): Command {
  return command
    .option("-p, --period <expr>", "period shorthand")
    .option("-b, --begin <date>", "start date (inclusive)")
    .option("-e, --end <date>", "end date (inclusive)");
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

function toSuggestedAccountId(selector: string): string {
  const normalized = selector
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (normalized.length > 0) {
    return `acct-${normalized}`;
  }
  return `acct-${randomUUID().slice(0, 8)}`;
}

function toSuggestedAccountName(selector: string, fallbackId: string): string {
  const trimmed = selector.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return fallbackId;
}

async function promptToCreateAccount(
  context: CommandContext,
  selector: string,
): Promise<CliAccount> {
  const defaultId = toSuggestedAccountId(selector);
  const accountId = (
    await input({
      default: defaultId,
      message: "New account ID:",
      validate: (value) => {
        if (value.trim().length === 0) {
          return "Account ID is required.";
        }
        return true;
      },
    })
  ).trim();
  const accountName = (
    await input({
      default: toSuggestedAccountName(selector, accountId),
      message: "New account name:",
      validate: (value) => (value.trim().length > 0 ? true : "Account name is required."),
    })
  ).trim();
  const accountCode = (
    await input({
      message: "New account code:",
      validate: (value) => (value.trim().length > 0 ? true : "Account code is required."),
    })
  ).trim();
  const accountType = await select({
    choices: [
      { name: "Asset", value: "asset" },
      { name: "Liability", value: "liability" },
      { name: "Equity", value: "equity" },
      { name: "Income", value: "income" },
      { name: "Expense", value: "expense" },
    ],
    message: "Account type:",
  });

  await context.api.writeBookJson(
    "POST",
    context.bookId ?? "",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/accounts`,
    {
      account: {
        code: accountCode,
        id: accountId,
        name: accountName,
        type: accountType,
      },
    },
  );

  console.log(`Created account ${accountName} (${accountId}).`);
  return {
    id: accountId,
    name: accountName,
  };
}

async function collectPostingsInteractively(
  context: CommandContext,
  accounts: CliAccount[],
): Promise<TransactionPosting[]> {
  const postings: TransactionPosting[] = [];
  let imbalance = 0;

  while (postings.length < 2 || imbalance !== 0) {
    console.log(`\nPosting ${postings.length + 1}`);
    let accountId = "";

    while (!accountId) {
      const accountSelector = await input({
        message: "Account:",
        validate: (value) => (value.trim().length > 0 ? true : "Account is required."),
      });

      try {
        accountId = resolveAccountId(accounts, accountSelector);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to resolve account.";
        if (!message.startsWith("No account found for selector")) {
          console.log(message);
          continue;
        }

        const action = await select({
          choices: [
            { name: "Try a different account", value: "retry" },
            { name: "Create this account now", value: "create" },
            { name: "Cancel transaction", value: "cancel" },
          ],
          message: `No account found for "${accountSelector.trim()}".`,
        });

        if (action === "cancel") {
          throw new InteractiveCancelledError("Transaction add cancelled.");
        }

        if (action === "retry") {
          continue;
        }

        try {
          const created = await promptToCreateAccount(context, accountSelector);
          accounts.push(created);
          accountId = created.id;
        } catch (createError) {
          const createMessage =
            createError instanceof Error ? createError.message : "Could not create account.";
          console.log(`Could not create account: ${createMessage}`);
        }
      }
    }

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
    console.log(JSON.stringify(body.transactions, null, 2));
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

    try {
      postings = await collectPostingsInteractively(context, accounts);
    } catch (error) {
      if (error instanceof InteractiveCancelledError) {
        console.log("Cancelled.");
        return;
      }
      throw error;
    }
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
