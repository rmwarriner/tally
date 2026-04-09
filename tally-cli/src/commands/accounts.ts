import type { Command } from "commander";
import { buildContext } from "../lib/context";
import { currentMonthToDate } from "../lib/period";
import { formatMoney, printRows } from "../lib/output";

interface Account {
  archivedAt?: string;
  id: string;
  name: string;
  parentAccountId?: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
}

interface AccountsEnvelope {
  accounts: Account[];
}

interface DashboardEnvelope {
  dashboard: {
    accountBalances: Array<{ accountId: string; balance: number }>;
  };
}

function buildBalanceMap(
  accountBalances: Array<{ accountId: string; balance: number }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of accountBalances) {
    map.set(item.accountId, (map.get(item.accountId) ?? 0) + item.balance);
  }
  return map;
}

function flattenTree(
  accounts: Account[],
  balances: Map<string, number>,
  depth: number | undefined,
): Array<{ account: string; balance: string }> {
  const children = new Map<string, Account[]>();
  const roots: Account[] = [];

  for (const account of accounts) {
    if (account.parentAccountId && accounts.some((item) => item.id === account.parentAccountId)) {
      const existing = children.get(account.parentAccountId) ?? [];
      existing.push(account);
      children.set(account.parentAccountId, existing);
    } else {
      roots.push(account);
    }
  }

  const rows: Array<{ account: string; balance: string }> = [];

  const visit = (account: Account, level: number): void => {
    if (depth !== undefined && level > depth) {
      return;
    }

    rows.push({
      account: `${"  ".repeat(level)}${account.name}`,
      balance: formatMoney(balances.get(account.id) ?? 0),
    });

    const next = children.get(account.id) ?? [];
    next.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of next) {
      visit(child, level + 1);
    }
  };

  roots.sort((a, b) => a.name.localeCompare(b.name));
  for (const root of roots) {
    visit(root, 0);
  }

  return rows;
}

export function registerAccountsCommands(program: Command): void {
  const runAccountsList = async (command: Command): Promise<void> => {
    const context = buildContext(command, { requireBook: true });
    const opts = command.opts();
    const includeArchived = opts.includeArchived === true;
    const depth = opts.depth ? Number.parseInt(opts.depth, 10) : undefined;

    if (depth !== undefined && (!Number.isInteger(depth) || depth < 0)) {
      throw new Error("depth must be a non-negative integer");
    }

    const range = currentMonthToDate();

    const [accountsBody, dashboardBody] = await Promise.all([
      context.api.requestJson<AccountsEnvelope>(
        "GET",
        `/api/books/${encodeURIComponent(context.bookId ?? "")}/accounts`,
        {
          query: {
            includeArchived,
          },
        },
      ),
        context.api.requestJson<DashboardEnvelope>(
        "GET",
        `/api/books/${encodeURIComponent(context.bookId ?? "")}/dashboard`,
        {
          query: {
            from: range.from,
            to: range.to,
          },
        },
      ),
    ]);

    const visibleAccounts = includeArchived
      ? accountsBody.accounts
      : accountsBody.accounts.filter((account) => !account.archivedAt);
    const balanceMap = buildBalanceMap(dashboardBody.dashboard.accountBalances);
    const rows = flattenTree(visibleAccounts, balanceMap, depth);
    printRows(rows, ["account", "balance"], context.format);
  };

  const accounts = program.command("accounts").description("Account commands");
  accounts
    .command("list")
    .description("List accounts with balances")
    .option("--depth <n>", "limit account hierarchy depth")
    .option("--include-archived", "include archived accounts")
    .action(async function accountsListAction() {
      await runAccountsList(this);
    });

  program
    .command("bal")
    .description("Alias for accounts list")
    .option("--depth <n>", "limit account hierarchy depth")
    .option("--include-archived", "include archived accounts")
    .action(async function balAction() {
      await runAccountsList(this);
    });
}
