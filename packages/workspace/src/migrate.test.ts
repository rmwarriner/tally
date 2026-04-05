import { describe, expect, it } from "vitest";
import { migrateWorkspaceDocument } from "./migrate";

describe("workspace migration", () => {
  it("fills in missing arrays for legacy workspace documents", () => {
    const migrated = migrateWorkspaceDocument({
      accounts: [],
      auditEvents: [],
      baseCommodityCode: "USD",
      commodities: [],
      envelopeAllocations: [],
      envelopes: [],
      householdMembers: [],
      id: "legacy-workspace",
      name: "Legacy Workspace",
      reconciliationSessions: [],
      scheduledTransactions: [],
      schemaVersion: 1,
      transactions: [],
    });

    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.importBatches).toEqual([]);
    expect(migrated.closePeriods).toEqual([]);
    expect(migrated.baselineBudgetLines).toEqual([]);
  });

  it("filters household members down to string values", () => {
    const migrated = migrateWorkspaceDocument({
      accounts: [],
      auditEvents: [],
      baseCommodityCode: "USD",
      commodities: [],
      envelopeAllocations: [],
      envelopes: [],
      householdMembers: ["Primary", 42, null, "Partner"],
      id: "legacy-workspace",
      importBatches: [],
      name: "Legacy Workspace",
      reconciliationSessions: [],
      scheduledTransactions: [],
      schemaVersion: 1,
      transactions: [],
    });

    expect(migrated.householdMembers).toEqual(["Primary", "Partner"]);
  });

  it("rejects non-object documents", () => {
    expect(() => migrateWorkspaceDocument(null)).toThrow("Workspace document must be an object.");
    expect(() => migrateWorkspaceDocument([])).toThrow("Workspace document must be an object.");
  });

  it("rejects missing required identity fields", () => {
    expect(() =>
      migrateWorkspaceDocument({
        baseCommodityCode: "USD",
        id: "",
        name: "Legacy Workspace",
      }),
    ).toThrow("Workspace document id is required.");

    expect(() =>
      migrateWorkspaceDocument({
        baseCommodityCode: "USD",
        id: "legacy-workspace",
        name: "",
      }),
    ).toThrow("Workspace document name is required.");

    expect(() =>
      migrateWorkspaceDocument({
        baseCommodityCode: "",
        id: "legacy-workspace",
        name: "Legacy Workspace",
      }),
    ).toThrow("Workspace document baseCommodityCode is required.");
  });
});
