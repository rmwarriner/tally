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
});
