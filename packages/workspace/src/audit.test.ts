import { describe, expect, it } from "vitest";
import { createMoney } from "@gnucash-ng/domain";
import { addTransaction, createDemoWorkspace, reconcileAccount } from "./index";

describe("workspace audit events", () => {
  it("appends a durable audit event for successful transaction creation", () => {
    const workspace = createDemoWorkspace();
    const result = addTransaction(
      workspace,
      {
        id: "txn-phone-1",
        occurredOn: "2026-04-03",
        description: "Phone bill",
        payee: "Carrier",
        postings: [
          { accountId: "acct-expense-utilities", amount: createMoney("USD", 72.15) },
          { accountId: "acct-checking", amount: createMoney("USD", -72.15), cleared: true },
        ],
      },
      {
        audit: {
          actor: "Primary",
          occurredAt: "2026-04-03T10:00:00Z",
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.document.auditEvents).toHaveLength(1);
    expect(result.document.auditEvents[0]).toMatchObject({
      workspaceId: workspace.id,
      actor: "Primary",
      eventType: "transaction.created",
      occurredAt: "2026-04-03T10:00:00Z",
      entityIds: ["txn-phone-1"],
    });
  });

  it("does not append audit events for rejected commands", () => {
    const workspace = createDemoWorkspace();
    const result = addTransaction(
      workspace,
      {
        id: "txn-invalid",
        occurredOn: "2026-04-03",
        description: "Broken entry",
        postings: [
          { accountId: "acct-expense-utilities", amount: createMoney("USD", 72.15) },
          { accountId: "acct-checking", amount: createMoney("USD", -60), cleared: true },
        ],
      },
      {
        audit: {
          actor: "Primary",
          occurredAt: "2026-04-03T10:00:00Z",
        },
      },
    );

    expect(result.ok).toBe(false);
    expect(result.document.auditEvents).toHaveLength(0);
  });

  it("records reconciliation audit events with the relevant entity ids", () => {
    const workspace = createDemoWorkspace();
    const result = reconcileAccount(
      workspace,
      {
        accountId: "acct-checking",
        statementDate: "2026-04-02",
        statementBalance: 3051.58,
        clearedTransactionIds: ["txn-paycheck-1", "txn-grocery-1"],
      },
      {
        audit: {
          actor: "Primary",
          occurredAt: "2026-04-03T11:00:00Z",
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.document.auditEvents).toHaveLength(1);
    expect(result.document.auditEvents[0]).toMatchObject({
      actor: "Primary",
      eventType: "reconciliation.recorded",
      entityIds: ["acct-checking", "txn-grocery-1", "txn-paycheck-1"],
    });
  });
});
