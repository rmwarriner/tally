import type { Command } from "commander";
import { buildContext } from "../lib/context";
import { currentMonthToDate, resolveDateRange } from "../lib/period";
import { formatMoney, printRows } from "../lib/output";

type ApiReportKind =
  | "budget-vs-actual"
  | "cash-flow"
  | "envelope-summary"
  | "income-statement"
  | "net-worth";

type CliReportKind = "budget" | "cash-flow" | "envelopes" | "income" | "net-worth";

interface MoneyAmount {
  commodityCode: string;
  quantity: number;
}

interface NetWorthReport {
  kind: "net-worth";
  from: string;
  to: string;
  balances: Array<{
    accountId: string;
    accountName: string;
    accountType: string;
    balance: number;
  }>;
  total: MoneyAmount;
}

interface IncomeReport {
  kind: "income-statement";
  from: string;
  to: string;
  lines: Array<{
    accountId: string;
    accountName: string;
    accountType: "income" | "expense";
    amount: MoneyAmount;
  }>;
  incomeTotal: MoneyAmount;
  expenseTotal: MoneyAmount;
  netIncome: MoneyAmount;
}

interface CashFlowReport {
  kind: "cash-flow";
  from: string;
  to: string;
  lines: Array<{
    accountId: string;
    accountName: string;
    inflow: MoneyAmount;
    outflow: MoneyAmount;
    net: MoneyAmount;
  }>;
  totals: {
    inflow: MoneyAmount;
    outflow: MoneyAmount;
    net: MoneyAmount;
  };
}

interface BudgetReport {
  kind: "budget-vs-actual";
  from: string;
  to: string;
  lines: Array<{
    accountId: string;
    accountName: string;
    planned: MoneyAmount;
    actual: MoneyAmount;
    variance: MoneyAmount;
  }>;
  totals: {
    planned: MoneyAmount;
    actual: MoneyAmount;
    variance: MoneyAmount;
  };
}

interface EnvelopesReport {
  kind: "envelope-summary";
  from: string;
  to: string;
  lines: Array<{
    envelopeId: string;
    name: string;
    planned: MoneyAmount;
    funded: MoneyAmount;
    spent: MoneyAmount;
    available: MoneyAmount;
  }>;
  totals: {
    planned: MoneyAmount;
    funded: MoneyAmount;
    spent: MoneyAmount;
    available: MoneyAmount;
  };
}

type BookReport = NetWorthReport | IncomeReport | CashFlowReport | BudgetReport | EnvelopesReport;

interface ReportEnvelope {
  report: BookReport;
}

function addDateOptions(command: Command): Command {
  return command
    .option("-p, --period <expr>", "period shorthand")
    .option("-b, --begin <date>", "start date (inclusive)")
    .option("-e, --end <date>", "end date (inclusive)");
}

function mapKind(kind: CliReportKind): ApiReportKind {
  switch (kind) {
    case "budget":
      return "budget-vs-actual";
    case "cash-flow":
      return "cash-flow";
    case "envelopes":
      return "envelope-summary";
    case "income":
      return "income-statement";
    case "net-worth":
      return "net-worth";
  }
}

function rowsForReport(report: BookReport): Array<Record<string, string>> {
  switch (report.kind) {
    case "net-worth":
      return [
        ...report.balances.map((line) => ({
          account: line.accountName,
          id: line.accountId,
          type: line.accountType,
          balance: formatMoney(line.balance),
        })),
        {
          account: "TOTAL",
          id: "",
          type: "",
          balance: formatMoney(report.total.quantity),
        },
      ];
    case "income-statement":
      return [
        ...report.lines.map((line) => ({
          account: line.accountName,
          id: line.accountId,
          type: line.accountType,
          amount: formatMoney(line.amount.quantity),
        })),
        {
          account: "TOTAL INCOME",
          id: "",
          type: "",
          amount: formatMoney(report.incomeTotal.quantity),
        },
        {
          account: "TOTAL EXPENSE",
          id: "",
          type: "",
          amount: formatMoney(report.expenseTotal.quantity),
        },
        {
          account: "NET INCOME",
          id: "",
          type: "",
          amount: formatMoney(report.netIncome.quantity),
        },
      ];
    case "cash-flow":
      return [
        ...report.lines.map((line) => ({
          account: line.accountName,
          id: line.accountId,
          inflow: formatMoney(line.inflow.quantity),
          outflow: formatMoney(line.outflow.quantity),
          net: formatMoney(line.net.quantity),
        })),
        {
          account: "TOTAL",
          id: "",
          inflow: formatMoney(report.totals.inflow.quantity),
          outflow: formatMoney(report.totals.outflow.quantity),
          net: formatMoney(report.totals.net.quantity),
        },
      ];
    case "budget-vs-actual":
      return [
        ...report.lines.map((line) => ({
          account: line.accountName,
          id: line.accountId,
          planned: formatMoney(line.planned.quantity),
          actual: formatMoney(line.actual.quantity),
          variance: formatMoney(line.variance.quantity),
        })),
        {
          account: "TOTAL",
          id: "",
          planned: formatMoney(report.totals.planned.quantity),
          actual: formatMoney(report.totals.actual.quantity),
          variance: formatMoney(report.totals.variance.quantity),
        },
      ];
    case "envelope-summary":
      return [
        ...report.lines.map((line) => ({
          envelope: line.name,
          id: line.envelopeId,
          planned: formatMoney(line.planned.quantity),
          funded: formatMoney(line.funded.quantity),
          spent: formatMoney(line.spent.quantity),
          available: formatMoney(line.available.quantity),
        })),
        {
          envelope: "TOTAL",
          id: "",
          planned: formatMoney(report.totals.planned.quantity),
          funded: formatMoney(report.totals.funded.quantity),
          spent: formatMoney(report.totals.spent.quantity),
          available: formatMoney(report.totals.available.quantity),
        },
      ];
  }
}

function columnsForReport(report: BookReport): string[] {
  switch (report.kind) {
    case "net-worth":
      return ["account", "id", "type", "balance"];
    case "income-statement":
      return ["account", "id", "type", "amount"];
    case "cash-flow":
      return ["account", "id", "inflow", "outflow", "net"];
    case "budget-vs-actual":
      return ["account", "id", "planned", "actual", "variance"];
    case "envelope-summary":
      return ["envelope", "id", "planned", "funded", "spent", "available"];
  }
}

async function runReport(command: Command, kind: CliReportKind): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const opts = command.opts();
  const range =
    resolveDateRange({
      begin: opts.begin,
      end: opts.end,
      period: opts.period,
    }) ?? currentMonthToDate();

  const apiKind = mapKind(kind);
  const body = await context.api.requestJson<ReportEnvelope>(
    "GET",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/reports/${encodeURIComponent(apiKind)}`,
    {
      query: {
        from: range.from,
        to: range.to,
      },
    },
  );

  if (context.format === "json") {
    console.log(JSON.stringify(body.report, null, 2));
    return;
  }

  const rows = rowsForReport(body.report);
  const columns = columnsForReport(body.report);
  printRows(rows, columns, context.format);
}

function registerSingleReport(report: Command, kind: CliReportKind): void {
  addDateOptions(report)
    // Accepted for compatibility with prior spec discussion; report endpoint currently ignores this value.
    .option("--budget-id <id>", "budget identifier (optional)")
    .action(async function reportAction() {
      await runReport(this, kind);
    });
}

export function registerReportCommands(program: Command): void {
  const report = program.command("report").description("Report commands");

  registerSingleReport(report.command("net-worth").description("Net worth report"), "net-worth");
  registerSingleReport(report.command("income").description("Income statement report"), "income");
  registerSingleReport(report.command("cash-flow").description("Cash flow report"), "cash-flow");
  registerSingleReport(report.command("budget").description("Budget vs actual report"), "budget");
  registerSingleReport(report.command("envelopes").description("Envelope summary report"), "envelopes");
}
