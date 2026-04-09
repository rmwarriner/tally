import { writeFile } from "node:fs/promises";
import type { Command } from "commander";
import { loadAccounts, resolveAccountId } from "../lib/accounts";
import { buildContext } from "../lib/context";
import { currentMonthToDate, resolveDateRange } from "../lib/period";
import { printRows } from "../lib/output";

interface ExportEnvelope {
  export: {
    contents: string;
    fileName: string;
    format: string;
    transactionCount?: number;
  };
}

function addDateOptions(command: Command): Command {
  return command
    .option("-p, --period <expr>", "period shorthand")
    .option("-b, --begin <date>", "start date (inclusive)")
    .option("-e, --end <date>", "end date (inclusive)")
    .option("--out <file>", "write exported file to disk")
    .option("--account <idOrPattern>", "account id or name pattern");
}

async function writeOrPrintExport(
  command: Command,
  payload: ExportEnvelope["export"],
  outPath: string | undefined,
): Promise<void> {
  if (outPath) {
    await writeFile(outPath, payload.contents, "utf8");
    const context = buildContext(command, { requireBook: true });
    printRows(
      [
        {
          fileName: payload.fileName,
          format: payload.format,
          out: outPath,
          transactions: String(payload.transactionCount ?? ""),
        },
      ],
      ["format", "fileName", "transactions", "out"],
      context.format,
    );
    return;
  }

  process.stdout.write(payload.contents.endsWith("\n") ? payload.contents : `${payload.contents}\n`);
}

async function runExport(command: Command, format: "qif" | "ofx" | "qfx"): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const opts = command.opts();

  if (!opts.account) {
    throw new Error(`${format} export requires --account.`);
  }

  const accounts = await loadAccounts(command);
  const accountId = resolveAccountId(accounts, String(opts.account));

  const range =
    resolveDateRange({
      begin: opts.begin,
      end: opts.end,
      period: opts.period,
    }) ?? currentMonthToDate();

  const body = await context.api.requestJson<ExportEnvelope>(
    "GET",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/exports/${format}`,
    {
      query: {
        accountId,
        from: range.from,
        to: range.to,
      },
    },
  );

  await writeOrPrintExport(command, body.export, opts.out);
}

async function runGnuCashExport(command: Command): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const opts = command.opts();

  const body = await context.api.requestJson<ExportEnvelope>(
    "GET",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/exports/gnucash-xml`,
  );

  await writeOrPrintExport(command, body.export, opts.out);
}

export function registerExportCommands(program: Command): void {
  const exports = program.command("export").description("Export data from the current book");

  addDateOptions(exports.command("qif").description("Export QIF statement"))
    .action(async function exportQifAction() {
      await runExport(this, "qif");
    });

  addDateOptions(exports.command("ofx").description("Export OFX statement"))
    .action(async function exportOfxAction() {
      await runExport(this, "ofx");
    });

  addDateOptions(exports.command("qfx").description("Export QFX statement"))
    .action(async function exportQfxAction() {
      await runExport(this, "qfx");
    });

  addDateOptions(exports.command("gnucash").description("Export GnuCash XML snapshot"))
    .action(async function exportGnuCashAction() {
      await runGnuCashExport(this);
    });
}
