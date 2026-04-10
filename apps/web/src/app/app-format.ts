import type { BookResponse } from "./api";

const monthByToken: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function getMonthRange(year: number, month: number): { from: string; to: string } {
  const toDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${pad2(month)}-01`,
    to: `${year}-${pad2(month)}-${pad2(toDay)}`,
  };
}

export function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function formatSignedCurrency(amount: number): string {
  const formatted = formatCurrency(Math.abs(amount));
  return amount < 0 ? `-${formatted}` : formatted;
}

export type AmountStyle = "both" | "color" | "sign";

export function formatAmount(
  value: number,
  formatCurrencyFn: (n: number) => string,
  style: AmountStyle,
): string {
  const formatted = formatCurrencyFn(Math.abs(value));
  if (value > 0 && (style === "both" || style === "sign")) {
    return `+${formatted}`;
  }
  if (value < 0) {
    return `-${formatted}`;
  }
  return formatted;
}

export function formatTransactionStatus(status: "cleared" | "open" | "reconciled"): string {
  switch (status) {
    case "reconciled":
      return "Reconciled";
    case "cleared":
      return "Cleared";
    default:
      return "Open";
  }
}

export function formatAccountOptionLabel(
  account: BookResponse["book"]["accounts"][number],
): string {
  return account.code ? `${account.name} (${account.code})` : account.name;
}

export function formatPeriodLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function parsePeriodExpression(text: string): { from: string; to: string } | null {
  const normalized = text.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  const yearOnlyMatch = normalized.match(/^(\d{4})$/);
  if (yearOnlyMatch) {
    const year = Number.parseInt(yearOnlyMatch[1], 10);
    return {
      from: `${year}-01-01`,
      to: `${year}-12-31`,
    };
  }

  const isoMonthMatch = normalized.match(/^(\d{4})-(\d{2})$/);
  if (isoMonthMatch) {
    const year = Number.parseInt(isoMonthMatch[1], 10);
    const month = Number.parseInt(isoMonthMatch[2], 10);
    if (month >= 1 && month <= 12) {
      return getMonthRange(year, month);
    }
    return null;
  }

  const monthYearMatch = normalized.match(/^([a-z]+)\s+(\d{4})$/);
  if (monthYearMatch) {
    const month = monthByToken[monthYearMatch[1]];
    if (!month) {
      return null;
    }
    const year = Number.parseInt(monthYearMatch[2], 10);
    return getMonthRange(year, month);
  }

  return null;
}

export function parseCsvRows(csvText: string) {
  return csvText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [occurredOn, description, amount, counterpartAccountId, cashAccountId] = line.split(",");

      return {
        occurredOn: occurredOn.trim(),
        description: description.trim(),
        amount: Number.parseFloat(amount.trim()),
        counterpartAccountId: counterpartAccountId.trim(),
        cashAccountId: cashAccountId.trim(),
      };
    });
}

export function createTransactionId(): string {
  return `txn-web-${Date.now()}`;
}

export function createEntityId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}
