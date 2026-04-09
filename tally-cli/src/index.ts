#!/usr/bin/env node
import { Command } from "commander";
import { registerAccountsCommands } from "./commands/accounts";
import { registerBooksCommands } from "./commands/books";
import { registerDashboardCommand } from "./commands/dashboard";
import { registerTransactionsCommands } from "./commands/transactions";
import { registerUseCommand } from "./commands/use";
import { ApiResponseError, NetworkError } from "./lib/api-client";
import type { OutputFormat } from "./lib/types";

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

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  printError(error);
  process.exit(1);
});
