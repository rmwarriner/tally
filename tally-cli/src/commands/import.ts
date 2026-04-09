import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { Command } from "commander";
import { loadAccounts, resolveAccountId } from "../lib/accounts";
import { buildContext } from "../lib/context";
import { printRows } from "../lib/output";

interface CsvImportRow {
  occurredOn: string;
  description: string;
  amount: number;
  counterpartAccountId: string;
  cashAccountId: string;
  payee?: string;
  memo?: string;
  tags?: string[];
}

interface ImportBatch {
  id: string;
  importedAt: string;
  provider: string;
  sourceLabel: string;
  transactionIds: string[];
}

interface BookEnvelope {
  book: {
    importBatches: ImportBatch[];
    transactions: Array<{ id: string }>;
  };
}

function batchId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function parseNumber(value: string): number {
  const normalized = value.trim().replaceAll(",", "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric amount: ${value}`);
  }
  return parsed;
}

function parseCsv(content: string): CsvImportRow[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = "";
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]!;
      if (char === '"') {
        const next = line[index + 1];
        if (quoted && next === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
        continue;
      }

      if (char === "," && !quoted) {
        cells.push(current.trim());
        current = "";
        continue;
      }

      current += char;
    }

    cells.push(current.trim());
    return cells;
  };

  const headers = parseLine(lines[0]!).map((cell) => cell.toLowerCase());
  const headerIndex = new Map(headers.map((name, index) => [name, index]));

  const requiredHeaders = ["occurredon", "description", "amount", "counterpartaccountid", "cashaccountid"];
  for (const required of requiredHeaders) {
    if (!headerIndex.has(required)) {
      throw new Error(`CSV is missing required column: ${required}`);
    }
  }

  const rows: CsvImportRow[] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const raw = parseLine(lines[lineIndex]!);
    const field = (name: string): string => raw[headerIndex.get(name) ?? -1] ?? "";

    const occurredOn = field("occurredon");
    const description = field("description");
    const amount = parseNumber(field("amount"));
    const counterpartAccountId = field("counterpartaccountid");
    const cashAccountId = field("cashaccountid");

    if (!occurredOn || !description || !counterpartAccountId || !cashAccountId) {
      throw new Error(`CSV row ${lineIndex + 1} is missing required values.`);
    }

    const payee = field("payee") || undefined;
    const memo = field("memo") || undefined;
    const tagsRaw = field("tags");
    const tags = tagsRaw
      ? tagsRaw
        .split(/[|;]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
      : undefined;

    rows.push({
      amount,
      cashAccountId,
      counterpartAccountId,
      description,
      memo,
      occurredOn,
      payee,
      tags,
    });
  }

  return rows;
}

function countQifEntries(contents: string): number {
  return contents
    .split(/\r?\n/)
    .filter((line) => line.trim() === "^")
    .length;
}

function countStatementEntries(contents: string): number {
  return (contents.match(/<STMTTRN>/gi) ?? []).length;
}

function printImportResult(
  command: Command,
  result: {
    batchId: string;
    entries: number;
    file: string;
    format: string;
    imported: number;
    skipped: number;
  },
): void {
  const context = buildContext(command, { requireBook: true });
  printRows([result], ["format", "file", "batchId", "entries", "imported", "skipped"], context.format);
}

function importedCount(book: BookEnvelope["book"], id: string): number {
  const batch = book.importBatches.find((candidate) => candidate.id === id);
  return batch?.transactionIds.length ?? 0;
}

async function runCsvImport(command: Command, file: string): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const contents = await readFile(file, "utf8");
  const rows = parseCsv(contents);
  const id = batchId("csv");

  const response = await context.api.writeBookJson<BookEnvelope>(
    "POST",
    context.bookId ?? "",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/imports/csv`,
    {
      payload: {
        batchId: id,
        importedAt: new Date().toISOString(),
        rows,
        sourceLabel: basename(file),
      },
    },
  );

  const imported = importedCount(response.book, id);
  printImportResult(command, {
    batchId: id,
    entries: rows.length,
    file,
    format: "csv",
    imported,
    skipped: Math.max(rows.length - imported, 0),
  });
}

async function runQifImport(command: Command, file: string): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const opts = command.opts();
  if (!opts.cashAccount || !opts.counterpartAccount) {
    throw new Error("qif import requires --cash-account and --counterpart-account.");
  }

  const accounts = await loadAccounts(command);
  const cashAccountId = resolveAccountId(accounts, String(opts.cashAccount));
  const counterpartAccountId = resolveAccountId(accounts, String(opts.counterpartAccount));
  const qif = await readFile(file, "utf8");
  const id = batchId("qif");
  const entries = countQifEntries(qif);

  const response = await context.api.writeBookJson<BookEnvelope>(
    "POST",
    context.bookId ?? "",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/imports/qif`,
    {
      payload: {
        batchId: id,
        cashAccountId,
        defaultCounterpartAccountId: counterpartAccountId,
        importedAt: new Date().toISOString(),
        qif,
        sourceLabel: basename(file),
      },
    },
  );

  const imported = importedCount(response.book, id);
  printImportResult(command, {
    batchId: id,
    entries,
    file,
    format: "qif",
    imported,
    skipped: Math.max(entries - imported, 0),
  });
}

async function runStatementImport(command: Command, file: string, format: "ofx" | "qfx"): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const opts = command.opts();
  if (!opts.cashAccount || !opts.counterpartAccount) {
    throw new Error(`${format} import requires --cash-account and --counterpart-account.`);
  }

  const accounts = await loadAccounts(command);
  const cashAccountId = resolveAccountId(accounts, String(opts.cashAccount));
  const counterpartAccountId = resolveAccountId(accounts, String(opts.counterpartAccount));
  const statement = await readFile(file, "utf8");
  const id = batchId(format);
  const entries = countStatementEntries(statement);

  const response = await context.api.writeBookJson<BookEnvelope>(
    "POST",
    context.bookId ?? "",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/imports/${format}`,
    {
      payload: {
        batchId: id,
        cashAccountId,
        defaultCounterpartAccountId: counterpartAccountId,
        format,
        importedAt: new Date().toISOString(),
        sourceLabel: basename(file),
        statement,
      },
    },
  );

  const imported = importedCount(response.book, id);
  printImportResult(command, {
    batchId: id,
    entries,
    file,
    format,
    imported,
    skipped: Math.max(entries - imported, 0),
  });
}

async function runGnuCashImport(command: Command, file: string): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const xml = await readFile(file, "utf8");

  const response = await context.api.writeBookJson<BookEnvelope>(
    "POST",
    context.bookId ?? "",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/imports/gnucash-xml`,
    {
      payload: {
        importedAt: new Date().toISOString(),
        sourceLabel: basename(file),
        xml,
      },
    },
  );

  const entries = response.book.transactions.length;
  printImportResult(command, {
    batchId: "(full-book)",
    entries,
    file,
    format: "gnucash",
    imported: entries,
    skipped: 0,
  });
}

function addImportOptions(command: Command): Command {
  return command
    .argument("<file>", "path to import file")
    .option("--cash-account <idOrPattern>", "cash account id or name pattern")
    .option("--counterpart-account <idOrPattern>", "default counterpart account id or name pattern");
}

export function registerImportCommands(program: Command): void {
  const imports = program.command("import").description("Import data into the current book");

  addImportOptions(imports.command("csv").description("Import CSV rows"))
    .action(async function importCsvAction(file: string) {
      await runCsvImport(this, file);
    });

  addImportOptions(imports.command("qif").description("Import QIF statement"))
    .action(async function importQifAction(file: string) {
      await runQifImport(this, file);
    });

  addImportOptions(imports.command("ofx").description("Import OFX statement"))
    .action(async function importOfxAction(file: string) {
      await runStatementImport(this, file, "ofx");
    });

  addImportOptions(imports.command("qfx").description("Import QFX statement"))
    .action(async function importQfxAction(file: string) {
      await runStatementImport(this, file, "qfx");
    });

  addImportOptions(imports.command("gnucash").description("Import GnuCash XML snapshot"))
    .action(async function importGnuCashAction(file: string) {
      await runGnuCashImport(this, file);
    });
}
