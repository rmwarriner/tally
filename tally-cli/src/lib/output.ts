import Table from "cli-table3";
import type { OutputFormat } from "./types";

export function resolveOutputFormat(
  requested: OutputFormat | undefined,
  isTty: boolean,
): OutputFormat {
  if (requested) {
    return requested;
  }

  return isTty ? "table" : "json";
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

export type Row = Record<string, string | number | boolean | null | undefined>;

function toDisplayValue(value: Row[string]): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

export function printRows(
  rows: Row[],
  columns: string[],
  format: OutputFormat,
): void {
  if (format === "json") {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (format === "csv") {
    const header = columns.join(",");
    const body = rows
      .map((row) =>
        columns
          .map((column) => escapeCsv(toDisplayValue(row[column])))
          .join(","),
      )
      .join("\n");
    console.log(body ? `${header}\n${body}` : header);
    return;
  }

  if (rows.length === 0) {
    console.log("(no results)");
    return;
  }

  const table = new Table({ head: columns });
  for (const row of rows) {
    table.push(columns.map((column) => toDisplayValue(row[column])));
  }
  console.log(table.toString());
}

export function printKeyValue(
  values: Record<string, string | number | boolean | null | undefined>,
  format: OutputFormat,
): void {
  const rows = Object.entries(values).map(([key, value]) => ({
    key,
    value: toDisplayValue(value),
  }));
  printRows(rows, ["key", "value"], format);
}
