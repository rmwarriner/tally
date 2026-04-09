import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { confirm, input, select } from "@inquirer/prompts";
import type { Command } from "commander";
import { loadAccounts, resolveAccountId, type CliAccount } from "../lib/accounts";
import { buildContext } from "../lib/context";
import { formatMoney, printRows } from "../lib/output";
import { parseHumanDate } from "../lib/period";

interface Posting {
  accountId: string;
  amount: {
    commodityCode: string;
    quantity: number;
  };
}

interface Schedule {
  id: string;
  name: string;
  frequency: "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "annually";
  nextDueOn: string;
  autoPost: boolean;
  templateTransaction: {
    description: string;
    payee?: string;
    tags?: string[];
    postings: Posting[];
  };
}

interface BookEnvelope {
  book: {
    scheduledTransactions: Schedule[];
  };
}

function parseAmount(raw: string): number {
  const normalized = raw.trim().replaceAll(",", "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed === 0) {
    throw new Error(`Invalid amount: ${raw}`);
  }
  return parsed;
}

function parseTags(raw: string | undefined): string[] | undefined {
  if (!raw) {
    return undefined;
  }

  const tags = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return tags.length > 0 ? tags : undefined;
}

function parseFrequency(value: string): Schedule["frequency"] {
  if (
    value === "daily" ||
    value === "weekly" ||
    value === "biweekly" ||
    value === "monthly" ||
    value === "quarterly" ||
    value === "annually"
  ) {
    return value;
  }

  throw new Error("frequency must be one of daily, weekly, biweekly, monthly, quarterly, annually");
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

async function collectPostingsInteractively(accounts: CliAccount[]): Promise<Posting[]> {
  const postings: Posting[] = [];
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
    const formatted = imbalance > 0 ? `+${formatMoney(imbalance)}` : formatMoney(imbalance);
    console.log(`Unbalanced: ${formatted} ${marker}`.trim());
  }

  return postings;
}

function scheduleRows(schedules: Schedule[]): Array<Record<string, string | boolean>> {
  return schedules.map((schedule) => ({
    autoPost: schedule.autoPost,
    frequency: schedule.frequency,
    id: schedule.id,
    name: schedule.name,
    nextDueOn: schedule.nextDueOn,
    postings: String(schedule.templateTransaction.postings.length),
  }));
}

async function runSchedulesList(command: Command): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const response = await context.api.requestJson<BookEnvelope>(
    "GET",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}`,
  );

  const schedules = response.book.scheduledTransactions ?? [];
  if (context.format === "json") {
    console.log(JSON.stringify(schedules, null, 2));
    return;
  }

  printRows(
    scheduleRows(schedules),
    ["id", "name", "frequency", "nextDueOn", "autoPost", "postings"],
    context.format,
  );
}

async function loadScheduleFromFile(path: string): Promise<Schedule> {
  const contents = await readFile(path, "utf8");
  const parsed = JSON.parse(contents) as { schedule?: Schedule } | Schedule;
  if ("schedule" in parsed && parsed.schedule) {
    return parsed.schedule;
  }
  return parsed as Schedule;
}

async function buildScheduleFromFlags(command: Command): Promise<Schedule | undefined> {
  const opts = command.opts();

  if (typeof opts.json === "string" && opts.json.length > 0) {
    return loadScheduleFromFile(opts.json);
  }

  const hasDirectPostingFlags =
    typeof opts.amount === "string" && typeof opts.debit === "string" && typeof opts.credit === "string";

  if (!hasDirectPostingFlags) {
    return undefined;
  }

  if (!opts.name) {
    throw new Error("schedules add direct mode requires --name.");
  }

  if (!opts.frequency) {
    throw new Error("schedules add direct mode requires --frequency.");
  }

  if (!opts.nextDueOn) {
    throw new Error("schedules add direct mode requires --next-due-on.");
  }

  const accounts = await loadAccounts(command);
  const amount = Math.abs(parseAmount(String(opts.amount)));
  const debitId = resolveAccountId(accounts, String(opts.debit));
  const creditId = resolveAccountId(accounts, String(opts.credit));

  return {
    autoPost: opts.autoPost === true,
    frequency: parseFrequency(String(opts.frequency)),
    id: String(opts.id ?? `sched-cli-${randomUUID().slice(0, 8)}`),
    name: String(opts.name),
    nextDueOn: parseHumanDate(String(opts.nextDueOn)),
    templateTransaction: {
      description: String(opts.description ?? opts.name),
      payee: typeof opts.payee === "string" ? opts.payee : undefined,
      postings: [
        {
          accountId: debitId,
          amount: { commodityCode: "USD", quantity: amount },
        },
        {
          accountId: creditId,
          amount: { commodityCode: "USD", quantity: -amount },
        },
      ],
      tags: parseTags(typeof opts.tags === "string" ? opts.tags : undefined),
    },
  };
}

async function buildScheduleInteractively(command: Command): Promise<Schedule> {
  if (process.stdin.isTTY !== true) {
    throw new Error(
      "Non-interactive schedules add requires either --json <file> or --name/--frequency/--next-due-on/--amount/--debit/--credit.",
    );
  }

  const opts = command.opts();
  const accounts = await loadAccounts(command);

  const name = (
    await input({
      default: opts.name,
      message: "Schedule name:",
      validate: (value) => (value.trim().length > 0 ? true : "Schedule name is required."),
    })
  ).trim();

  const frequency = await select<Schedule["frequency"]>({
    choices: [
      { name: "daily", value: "daily" },
      { name: "weekly", value: "weekly" },
      { name: "biweekly", value: "biweekly" },
      { name: "monthly", value: "monthly" },
      { name: "quarterly", value: "quarterly" },
      { name: "annually", value: "annually" },
    ],
    default: (opts.frequency as Schedule["frequency"] | undefined) ?? "monthly",
    message: "Frequency:",
  });

  const nextDueOn = parseHumanDate(
    await input({
      default: opts.nextDueOn ?? "today",
      message: "Next due date:",
      validate: (value) => {
        try {
          parseHumanDate(value);
          return true;
        } catch (error) {
          return error instanceof Error ? error.message : "Invalid date";
        }
      },
    }),
  );

  const description = (
    await input({
      default: opts.description ?? name,
      message: "Template description:",
      validate: (value) => (value.trim().length > 0 ? true : "Description is required."),
    })
  ).trim();

  const payeeRaw = (await input({ default: opts.payee, message: "Payee (optional):" })).trim();
  const tagsRaw = (await input({ default: opts.tags, message: "Tags (comma-separated, optional):" })).trim();
  const autoPost = await confirm({ default: opts.autoPost === true, message: "Auto-post when due?" });
  const postings = await collectPostingsInteractively(accounts);

  return {
    autoPost,
    frequency,
    id: String(opts.id ?? `sched-cli-${randomUUID().slice(0, 8)}`),
    name,
    nextDueOn,
    templateTransaction: {
      description,
      payee: payeeRaw.length > 0 ? payeeRaw : undefined,
      postings,
      tags: parseTags(tagsRaw),
    },
  };
}

async function runSchedulesAdd(command: Command): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const schedule = (await buildScheduleFromFlags(command)) ?? (await buildScheduleInteractively(command));

  const response = await context.api.writeBookJson<BookEnvelope>(
    "POST",
    context.bookId ?? "",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/schedules`,
    { schedule },
  );

  const saved =
    response.book.scheduledTransactions.find((candidate) => candidate.id === schedule.id) ?? schedule;

  printRows(
    [
      {
        autoPost: saved.autoPost,
        frequency: saved.frequency,
        id: saved.id,
        name: saved.name,
        nextDueOn: saved.nextDueOn,
        postings: String(saved.templateTransaction.postings.length),
      },
    ],
    ["id", "name", "frequency", "nextDueOn", "autoPost", "postings"],
    context.format,
  );
}

async function runScheduleExecute(command: Command, scheduleId: string): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const opts = command.opts();
  const occurredOn = parseHumanDate(String(opts.occurredOn ?? "today"));

  await context.api.writeBookJson<BookEnvelope>(
    "POST",
    context.bookId ?? "",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/schedules/${encodeURIComponent(scheduleId)}/execute`,
    {
      payload: {
        occurredOn,
        transactionId: typeof opts.transactionId === "string" ? opts.transactionId : undefined,
      },
    },
  );

  printRows(
    [
      {
        action: "execute",
        occurredOn,
        scheduleId,
      },
    ],
    ["action", "scheduleId", "occurredOn"],
    context.format,
  );
}

async function runScheduleSkip(command: Command, scheduleId: string): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const opts = command.opts();

  await context.api.writeBookJson<BookEnvelope>(
    "POST",
    context.bookId ?? "",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/schedules/${encodeURIComponent(scheduleId)}/exceptions`,
    {
      payload: {
        action: "skip-next",
        effectiveOn: typeof opts.effectiveOn === "string" ? parseHumanDate(opts.effectiveOn) : undefined,
      },
    },
  );

  printRows(
    [
      {
        action: "skip-next",
        effectiveOn: typeof opts.effectiveOn === "string" ? parseHumanDate(opts.effectiveOn) : "",
        scheduleId,
      },
    ],
    ["action", "scheduleId", "effectiveOn"],
    context.format,
  );
}

async function runScheduleDefer(command: Command, scheduleId: string): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const opts = command.opts();

  if (!opts.nextDueOn) {
    throw new Error("schedules defer requires --next-due-on.");
  }

  const nextDueOn = parseHumanDate(String(opts.nextDueOn));
  const effectiveOn = typeof opts.effectiveOn === "string" ? parseHumanDate(opts.effectiveOn) : undefined;

  await context.api.writeBookJson<BookEnvelope>(
    "POST",
    context.bookId ?? "",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/schedules/${encodeURIComponent(scheduleId)}/exceptions`,
    {
      payload: {
        action: "defer",
        effectiveOn,
        nextDueOn,
        note: typeof opts.note === "string" ? opts.note : undefined,
      },
    },
  );

  printRows(
    [
      {
        action: "defer",
        effectiveOn: effectiveOn ?? "",
        nextDueOn,
        note: typeof opts.note === "string" ? opts.note : "",
        scheduleId,
      },
    ],
    ["action", "scheduleId", "nextDueOn", "effectiveOn", "note"],
    context.format,
  );
}

export function registerSchedulesCommands(program: Command): void {
  const schedules = program.command("schedules").description("Scheduled transaction commands");

  schedules
    .command("list")
    .description("List scheduled transactions")
    .action(async function schedulesListAction() {
      await runSchedulesList(this);
    });

  schedules
    .command("add")
    .description("Create a schedule")
    .option("--json <file>", "full schedule payload JSON file")
    .option("--id <id>", "override schedule id")
    .option("--name <name>", "schedule name")
    .option("--frequency <frequency>", "daily|weekly|biweekly|monthly|quarterly|annually")
    .option("--next-due-on <date>", "next due date")
    .option("--amount <amount>", "single transfer amount")
    .option("--debit <account>", "debit account id or name pattern")
    .option("--credit <account>", "credit account id or name pattern")
    .option("--description <text>", "template transaction description")
    .option("--payee <name>", "template payee")
    .option("--tags <tags>", "template tags (comma-separated)")
    .option("--auto-post", "auto-post when due")
    .action(async function schedulesAddAction() {
      await runSchedulesAdd(this);
    });

  schedules
    .command("execute")
    .description("Execute a schedule")
    .argument("<id>", "schedule id")
    .option("--occurred-on <date>", "execution date", "today")
    .option("--transaction-id <id>", "override generated transaction id")
    .action(async function schedulesExecuteAction(id: string) {
      await runScheduleExecute(this, id);
    });

  schedules
    .command("skip")
    .description("Skip the next schedule occurrence")
    .argument("<id>", "schedule id")
    .option("--effective-on <date>", "effective date override")
    .action(async function schedulesSkipAction(id: string) {
      await runScheduleSkip(this, id);
    });

  schedules
    .command("defer")
    .description("Defer the next schedule occurrence")
    .argument("<id>", "schedule id")
    .requiredOption("--next-due-on <date>", "next due date")
    .option("--effective-on <date>", "effective date override")
    .option("--note <text>", "exception note")
    .action(async function schedulesDeferAction(id: string) {
      await runScheduleDefer(this, id);
    });
}
