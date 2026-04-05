import type { FinanceWorkspaceDocument } from "./types";

export interface QifEntry {
  amount: number;
  category?: string;
  date: string;
  memo?: string;
  payee?: string;
}

export interface ParsedQif {
  entries: QifEntry[];
  errors: string[];
}

function normalizeLineEndings(contents: string): string {
  return contents.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function parseQifDate(value: string): string | null {
  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);

  if (slashMatch) {
    const [, monthValue, dayValue, yearValue] = slashMatch;
    const month = Number.parseInt(monthValue, 10);
    const day = Number.parseInt(dayValue, 10);
    const parsedYear = Number.parseInt(yearValue, 10);
    const year = yearValue.length === 2 ? (parsedYear >= 70 ? 1900 + parsedYear : 2000 + parsedYear) : parsedYear;

    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const apostropheMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})'(\d{2})$/);

  if (apostropheMatch) {
    const [, monthValue, dayValue, yearValue] = apostropheMatch;
    const month = Number.parseInt(monthValue, 10);
    const day = Number.parseInt(dayValue, 10);
    const parsedYear = Number.parseInt(yearValue, 10);
    const year = parsedYear >= 70 ? 1900 + parsedYear : 2000 + parsedYear;

    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

function parseQifAmount(value: string): number | null {
  const normalized = value.trim().replace(/,/g, "");
  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function formatQifDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${month}/${day}/${year}`;
}

function sanitizeQifLine(value: string): string {
  return value.replace(/[\r\n^]/g, " ").trim();
}

export function parseQif(contents: string): ParsedQif {
  const lines = normalizeLineEndings(contents).split("\n");
  const errors: string[] = [];
  const entries: QifEntry[] = [];
  let record: Partial<QifEntry> = {};
  let inRecord = false;
  let recordIndex = 0;

  function finalizeRecord(): void {
    if (!inRecord) {
      return;
    }

    recordIndex += 1;

    if (!record.date) {
      errors.push(`entry ${recordIndex}: date is required.`);
    }

    if (typeof record.amount !== "number" || !Number.isFinite(record.amount)) {
      errors.push(`entry ${recordIndex}: amount is required.`);
    }

    if (record.date && typeof record.amount === "number" && Number.isFinite(record.amount)) {
      entries.push({
        amount: record.amount,
        category: record.category,
        date: record.date,
        memo: record.memo,
        payee: record.payee,
      });
    }

    record = {};
    inRecord = false;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.length === 0) {
      continue;
    }

    if (line.startsWith("!Type:")) {
      continue;
    }

    if (line === "^") {
      finalizeRecord();
      continue;
    }

    inRecord = true;
    const prefix = line[0];
    const value = line.slice(1);

    switch (prefix) {
      case "D": {
        const parsedDate = parseQifDate(value);

        if (!parsedDate) {
          errors.push(`entry ${recordIndex + 1}: unsupported date format ${value.trim()}.`);
        } else {
          record.date = parsedDate;
        }
        break;
      }
      case "T": {
        const parsedAmount = parseQifAmount(value);

        if (parsedAmount === null) {
          errors.push(`entry ${recordIndex + 1}: amount must be numeric.`);
        } else {
          record.amount = parsedAmount;
        }
        break;
      }
      case "L":
        record.category = value.trim();
        break;
      case "M":
        record.memo = value.trim();
        break;
      case "P":
        record.payee = value.trim();
        break;
      case "S":
      case "$":
      case "E":
        errors.push(`entry ${recordIndex + 1}: split transactions are not supported.`);
        break;
      default:
        break;
    }
  }

  finalizeRecord();
  return { entries, errors };
}

export function buildQifExport(params: {
  accountId: string;
  from: string;
  to: string;
  workspace: FinanceWorkspaceDocument;
}): {
  contents: string;
  fileName: string;
  transactionCount: number;
} {
  const transactions = params.workspace.transactions
    .filter((transaction) => transaction.occurredOn >= params.from && transaction.occurredOn <= params.to)
    .filter((transaction) => transaction.postings.some((posting) => posting.accountId === params.accountId))
    .sort((left, right) => left.occurredOn.localeCompare(right.occurredOn) || left.id.localeCompare(right.id));

  const lines = ["!Type:Bank"];

  for (const transaction of transactions) {
    const posting = transaction.postings.find((candidate) => candidate.accountId === params.accountId);

    if (!posting) {
      continue;
    }

    const counterpartPostings = transaction.postings.filter((candidate) => candidate.accountId !== params.accountId);
    const category =
      counterpartPostings.length === 1
        ? params.workspace.accounts.find((account) => account.id === counterpartPostings[0]?.accountId)?.name ??
          counterpartPostings[0]?.accountId
        : "[Split]";
    const memo = posting.memo ?? transaction.description;
    const payee = transaction.payee ?? transaction.description;

    lines.push(`D${formatQifDate(transaction.occurredOn)}`);
    lines.push(`T${posting.amount.quantity}`);
    lines.push(`P${sanitizeQifLine(payee)}`);
    lines.push(`M${sanitizeQifLine(memo)}`);

    if (category) {
      lines.push(`L${sanitizeQifLine(category)}`);
    }

    lines.push("^");
  }

  return {
    contents: `${lines.join("\n")}\n`,
    fileName: `${params.workspace.id}-${params.accountId}-${params.from}-${params.to}.qif`,
    transactionCount: transactions.length,
  };
}
