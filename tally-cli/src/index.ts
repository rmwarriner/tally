#!/usr/bin/env node
import { Command } from "commander";
import { registerAccountsCommands } from "./commands/accounts";
import { registerBackupCommands } from "./commands/backup";
import { registerBooksCommands } from "./commands/books";
import { registerCloseCommand } from "./commands/close";
import { registerDashboardCommand } from "./commands/dashboard";
import { registerExportCommands } from "./commands/export";
import { registerImportCommands } from "./commands/import";
import { registerMembersCommands } from "./commands/members";
import { registerReconcileCommand } from "./commands/reconcile";
import { registerReportCommands } from "./commands/report";
import { registerSchedulesCommands } from "./commands/schedules";
import { registerApprovalsCommands } from "./commands/approvals";
import { registerAuditCommands } from "./commands/audit";
import { registerTokensCommands } from "./commands/tokens";
import { registerTransactionsCommands } from "./commands/transactions";
import { registerUseCommand } from "./commands/use";
import { ApiResponseError, NetworkError } from "./lib/api-client";
import type { OutputFormat } from "./lib/types";

function extractMissingBookId(message: string): string | null {
  const workspaceMatch = message.match(/^Workspace (.+) was not found\.?$/i);
  if (workspaceMatch?.[1]) {
    return workspaceMatch[1];
  }

  const bookMatch = message.match(/^Book (.+) was not found\.?$/i);
  if (bookMatch?.[1]) {
    return bookMatch[1];
  }

  return null;
}

function printError(error: unknown): void {
  if (error instanceof NetworkError) {
    console.error(`error: ${error.message}`);
    return;
  }

  if (error instanceof ApiResponseError) {
    if (error.status === 401 || error.status === 403) {
      console.error("error: authentication failed - check TALLY_TOKEN or config file");
      return;
    }

    const missingBookId = extractMissingBookId(error.message);
    if (error.status === 404 && (error.code === "book.not_found" || missingBookId)) {
      if (missingBookId) {
        console.error(`error: selected book '${missingBookId}' was not found.`);
      } else {
        console.error("error: selected book was not found.");
      }
      console.error("hint: run `tally books list` then `tally use <bookId>`.");
      return;
    }

    if (error.details && typeof error.details === "object" && "issues" in (error.details as Record<string, unknown>)) {
      const issues = (error.details as { issues?: unknown }).issues;
      if (Array.isArray(issues) && issues.length > 0) {
        console.error(`error: ${error.message}`);
        for (const issue of issues) {
          console.error(`- ${String(issue)}`);
        }
        return;
      }
    }

    console.error(`error: ${error.message}`);
    return;
  }

  if (error instanceof Error) {
    console.error(`error: ${error.message}`);
    if (process.env.DEBUG === "tally") {
      console.error(error.stack ?? "");
    }
    return;
  }

  console.error("error: unexpected failure");
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("tally")
    .description("Tally CLI")
    .option("--book <id>", "override current book")
    .option("--api <url>", "override API base URL")
    .option("--token <token>", "override auth token")
    .option("--format <format>", "output format (table|json|csv)", (value: string) => {
      if (value !== "table" && value !== "json" && value !== "csv") {
        throw new Error("format must be one of table, json, csv");
      }
      return value as OutputFormat;
    })
    .option("--no-color", "disable ANSI color output", true)
    .showHelpAfterError();

  registerBooksCommands(program);
  registerUseCommand(program);
  registerTransactionsCommands(program);
  registerAccountsCommands(program);
  registerDashboardCommand(program);
  registerReportCommands(program);
  registerImportCommands(program);
  registerExportCommands(program);
  registerReconcileCommand(program);
  registerBackupCommands(program);
  registerSchedulesCommands(program);
  registerApprovalsCommands(program);
  registerAuditCommands(program);
  registerCloseCommand(program);
  registerMembersCommands(program);
  registerTokensCommands(program);

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  printError(error);
  process.exit(1);
});
