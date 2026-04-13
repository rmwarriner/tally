import type { FinanceBookDocument } from "./types";
import { listActiveTransactions } from "./transaction-lifecycle";

export interface StatementEntry {
  amount: number;
  date: string;
  fitId?: string;
  memo?: string;
  name?: string;
  transactionType?: string;
}

export interface ParsedStatement {
  entries: StatementEntry[];
  errors: string[];
}

function normalizeLineEndings(contents: string): string {
  return contents.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function parseStatementDate(value: string): string | null {
  const match = value.trim().match(/^(\d{4})(\d{2})(\d{2})/);

  if (!match) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseStatementAmount(value: string): number | null {
  const parsed = Number.parseFloat(value.trim().replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeField(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

const TAG_PATTERNS = {
  DTPOSTED: /<DTPOSTED>([^\n<]+)/i,
  TRNAMT: /<TRNAMT>([^\n<]+)/i,
  FITID: /<FITID>([^\n<]+)/i,
  MEMO: /<MEMO>([^\n<]+)/i,
  NAME: /<NAME>([^\n<]+)/i,
  TRNTYPE: /<TRNTYPE>([^\n<]+)/i,
} as const;

type TagName = keyof typeof TAG_PATTERNS;

function extractTagValue(block: string, tagName: TagName): string | undefined {
  const pattern = TAG_PATTERNS[tagName];
  const match = block.match(pattern);
  return match?.[1]?.trim();
}

export function parseOfxStatement(contents: string): ParsedStatement {
  const normalized = normalizeLineEndings(contents);
  const blocks = normalized.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  const entries: StatementEntry[] = [];
  const errors: string[] = [];

  blocks.forEach((block, index) => {
    const postedAt = extractTagValue(block, "DTPOSTED");
    const amountText = extractTagValue(block, "TRNAMT");
    const date = postedAt ? parseStatementDate(postedAt) : null;
    const amount = amountText ? parseStatementAmount(amountText) : null;

    if (!date) {
      errors.push(`entry ${index + 1}: DTPOSTED must contain YYYYMMDD date text.`);
    }

    if (amount === null) {
      errors.push(`entry ${index + 1}: TRNAMT must be numeric.`);
    }

    if (!date || amount === null) {
      return;
    }

    entries.push({
      amount,
      date,
      fitId: extractTagValue(block, "FITID"),
      memo: extractTagValue(block, "MEMO"),
      name: extractTagValue(block, "NAME"),
      transactionType: extractTagValue(block, "TRNTYPE"),
    });
  });

  if (blocks.length === 0) {
    errors.push("statement: no STMTTRN entries were found.");
  }

  return { entries, errors };
}

export function buildOfxExport(params: {
  accountId: string;
  format: "ofx" | "qfx";
  from: string;
  to: string;
  book: FinanceBookDocument;
}): {
  contents: string;
  fileName: string;
  transactionCount: number;
} {
  const account = params.book.accounts.find((candidate) => candidate.id === params.accountId);

  if (!account) {
    throw new Error(`Account ${params.accountId} does not exist.`);
  }

  const transactions = listActiveTransactions(params.book.transactions)
    .filter((transaction) => transaction.occurredOn >= params.from && transaction.occurredOn <= params.to)
    .filter((transaction) => transaction.postings.some((posting) => posting.accountId === params.accountId))
    .sort((left, right) => left.occurredOn.localeCompare(right.occurredOn) || left.id.localeCompare(right.id));

  const body = transactions
    .map((transaction) => {
      const posting = transaction.postings.find((candidate) => candidate.accountId === params.accountId);

      if (!posting) {
        return "";
      }

      const description = sanitizeField(transaction.payee ?? transaction.description);
      const memo = sanitizeField(posting.memo ?? transaction.description);
      const fitId = sanitizeField(transaction.source?.externalReference ?? transaction.id);
      const transactionType =
        posting.amount.quantity >= 0 ? "CREDIT" : "DEBIT";

      return [
        "<STMTTRN>",
        `<TRNTYPE>${transactionType}`,
        `<DTPOSTED>${transaction.occurredOn.replace(/-/g, "")}`,
        `<TRNAMT>${posting.amount.quantity.toFixed(2)}`,
        `<FITID>${escapeXml(fitId)}`,
        `<NAME>${escapeXml(description)}`,
        `<MEMO>${escapeXml(memo)}`,
        "</STMTTRN>",
      ].join("\n");
    })
    .filter((block) => block.length > 0)
    .join("\n");

  const contents = [
    "OFXHEADER:100",
    "DATA:OFXSGML",
    "VERSION:102",
    "SECURITY:NONE",
    "ENCODING:USASCII",
    "CHARSET:1252",
    "COMPRESSION:NONE",
    "OLDFILEUID:NONE",
    "NEWFILEUID:NONE",
    "",
    "<OFX>",
    "<BANKMSGSRSV1>",
    "<STMTTRNRS>",
    "<STMTRS>",
    "<BANKACCTFROM>",
    `<ACCTID>${escapeXml(account.id)}`,
    "</BANKACCTFROM>",
    "<BANKTRANLIST>",
    body,
    "</BANKTRANLIST>",
    "</STMTRS>",
    "</STMTTRNRS>",
    "</BANKMSGSRSV1>",
    "</OFX>",
    "",
  ].join("\n");

  return {
    contents,
    fileName: `${params.book.id}-${params.accountId}-${params.from}-${params.to}.${params.format}`,
    transactionCount: transactions.length,
  };
}
