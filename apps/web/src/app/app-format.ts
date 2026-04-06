import type { WorkspaceResponse } from "./api";

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
  account: WorkspaceResponse["workspace"]["accounts"][number],
): string {
  return account.code ? `${account.name} (${account.code})` : account.name;
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
