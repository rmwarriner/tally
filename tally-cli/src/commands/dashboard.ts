import type { Command } from "commander";
import { buildContext } from "../lib/context";
import { currentMonthToDate, resolveDateRange } from "../lib/period";
import { formatMoney, printKeyValue } from "../lib/output";

interface DashboardEnvelope {
  dashboard: {
    accountBalances: Array<{ accountId: string; accountName: string; balance: number }>;
    budgetErrors: string[];
    dueTransactions: Array<{ id: string }>;
    ledgerErrors: string[];
    netWorth: {
      commodityCode: string;
      quantity: number;
    };
  };
}

function addDateOptions(command: Command): Command {
  return command
    .option("-p, --period <expr>", "period shorthand")
    .option("-b, --begin <date>", "start date (inclusive)")
    .option("-e, --end <date>", "end date (inclusive)");
}

async function runDashboard(command: Command): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const opts = command.opts();
  const range =
    resolveDateRange({
      begin: opts.begin,
      end: opts.end,
      period: opts.period,
    }) ?? currentMonthToDate();

  const body = await context.api.requestJson<DashboardEnvelope>(
    "GET",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/dashboard`,
    {
      query: {
        from: range.from,
        to: range.to,
      },
    },
  );

  if (context.format === "json") {
    console.log(JSON.stringify(body.dashboard, null, 2));
    return;
  }

  printKeyValue(
    {
      range: `${range.from}..${range.to}`,
      netWorth: `${body.dashboard.netWorth.commodityCode} ${formatMoney(body.dashboard.netWorth.quantity)}`,
      accountBalances: body.dashboard.accountBalances.length,
      upcomingSchedules: body.dashboard.dueTransactions.length,
      ledgerErrors: body.dashboard.ledgerErrors.length,
      budgetErrors: body.dashboard.budgetErrors.length,
    },
    context.format,
  );
}

export function registerDashboardCommand(program: Command): void {
  const dashboard = addDateOptions(program.command("dashboard").description("Show dashboard summary"));
  dashboard.action(async function dashboardAction() {
    await runDashboard(this);
  });

  program.action(async function rootDashboardAction() {
    await runDashboard(this);
  });
}
