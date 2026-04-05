import type { FinanceWorkspaceDocument } from "./types";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function migrateWorkspaceDocument(input: unknown): FinanceWorkspaceDocument {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Workspace document must be an object.");
  }

  const document = input as Partial<FinanceWorkspaceDocument> & Record<string, unknown>;

  if (typeof document.id !== "string" || document.id.length === 0) {
    throw new Error("Workspace document id is required.");
  }

  if (typeof document.name !== "string" || document.name.length === 0) {
    throw new Error("Workspace document name is required.");
  }

  if (typeof document.baseCommodityCode !== "string" || document.baseCommodityCode.length === 0) {
    throw new Error("Workspace document baseCommodityCode is required.");
  }

  return {
    schemaVersion: 1,
    id: document.id,
    name: document.name,
    baseCommodityCode: document.baseCommodityCode,
    householdMembers: asStringArray(document.householdMembers),
    commodities: Array.isArray(document.commodities) ? document.commodities : [],
    accounts: Array.isArray(document.accounts) ? document.accounts : [],
    transactions: Array.isArray(document.transactions) ? document.transactions : [],
    scheduledTransactions: Array.isArray(document.scheduledTransactions) ? document.scheduledTransactions : [],
    baselineBudgetLines: Array.isArray(document.baselineBudgetLines) ? document.baselineBudgetLines : [],
    envelopes: Array.isArray(document.envelopes) ? document.envelopes : [],
    envelopeAllocations: Array.isArray(document.envelopeAllocations) ? document.envelopeAllocations : [],
    importBatches: Array.isArray(document.importBatches) ? document.importBatches : [],
    reconciliationSessions: Array.isArray(document.reconciliationSessions) ? document.reconciliationSessions : [],
    closePeriods: Array.isArray(document.closePeriods) ? document.closePeriods : [],
    auditEvents: Array.isArray(document.auditEvents) ? document.auditEvents : [],
  };
}
