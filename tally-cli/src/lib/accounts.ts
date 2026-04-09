import type { Command } from "commander";
import { buildContext } from "./context";

export interface CliAccount {
  id: string;
  name: string;
}

interface AccountsEnvelope {
  accounts: CliAccount[];
}

export async function loadAccounts(command: Command): Promise<CliAccount[]> {
  const context = buildContext(command, { requireBook: true });
  const body = await context.api.requestJson<AccountsEnvelope>(
    "GET",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/accounts`,
    { query: { includeArchived: true } },
  );
  return body.accounts;
}

export function resolveAccountId(accounts: CliAccount[], selector: string): string {
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
