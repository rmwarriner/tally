import { describe, expect, it } from "vitest";
import { migrateBookDocument } from "./migrate";

describe("workspace migration", () => {
  it("fills in missing arrays for legacy workspace documents", () => {
    const migrated = migrateBookDocument({
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
    const migrated = migrateBookDocument({
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

  it("filters household member role bindings to known role values", () => {
    const migrated = migrateBookDocument({
      accounts: [],
      auditEvents: [],
      baseCommodityCode: "USD",
      commodities: [],
      envelopeAllocations: [],
      envelopes: [],
      householdMemberRoles: {
        Ghost: "owner",
        Partner: "member",
        Primary: "guardian",
      },
      householdMembers: ["Primary", "Partner"],
      id: "legacy-workspace",
      importBatches: [],
      name: "Legacy Workspace",
      reconciliationSessions: [],
      scheduledTransactions: [],
      schemaVersion: 1,
      transactions: [],
    });

    expect(migrated.householdMemberRoles).toEqual({
      Partner: "member",
      Primary: "guardian",
    });
  });

  it("rejects non-object documents", () => {
    expect(() => migrateBookDocument(null)).toThrow("Book document must be an object.");
    expect(() => migrateBookDocument([])).toThrow("Book document must be an object.");
  });

  it("rejects missing required identity fields", () => {
    expect(() =>
      migrateBookDocument({
        baseCommodityCode: "USD",
        id: "",
        name: "Legacy Workspace",
      }),
    ).toThrow("Book document id is required.");

    expect(() =>
      migrateBookDocument({
        baseCommodityCode: "USD",
        id: "legacy-workspace",
        name: "",
      }),
    ).toThrow("Book document name is required.");

    expect(() =>
      migrateBookDocument({
        baseCommodityCode: "",
        id: "legacy-workspace",
        name: "Legacy Workspace",
      }),
    ).toThrow("Book document baseCommodityCode is required.");
  });
});
