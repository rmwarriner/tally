import { describe, expect, it } from "vitest";
import { createMoney } from "@gnucash-ng/domain";
import {
  addTransaction,
  createAuditEvent,
  createDemoWorkspace,
  deleteTransaction,
  destroyTransaction,
  reconcileAccount,
  updateTransaction,
} from "./index";

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

  it("appends a durable audit event for successful transaction updates", () => {
    const workspace = createDemoWorkspace();
    const result = updateTransaction(
      workspace,
      "txn-grocery-1",
      {
        id: "txn-grocery-1",
        occurredOn: "2026-04-02",
        description: "Updated grocery run",
        payee: "Neighborhood Market",
        postings: [
          { accountId: "acct-expense-groceries", amount: createMoney("USD", 155) },
          { accountId: "acct-checking", amount: createMoney("USD", -155), cleared: true },
        ],
      },
      {
        audit: {
          actor: "Primary",
          occurredAt: "2026-04-03T12:00:00Z",
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.document.auditEvents.at(-1)).toMatchObject({
      actor: "Primary",
      entityIds: ["txn-grocery-1"],
      eventType: "transaction.updated",
      occurredAt: "2026-04-03T12:00:00Z",
    });
  });

  it("appends durable audit events for transaction soft delete and destroy", () => {
    const workspace = createDemoWorkspace();
    const deleted = deleteTransaction(
      workspace,
      "txn-grocery-1",
      {
        deletedAt: "2026-04-03T13:00:00Z",
      },
      {
        audit: {
          actor: "Primary",
          occurredAt: "2026-04-03T13:00:00Z",
        },
      },
    );

    expect(deleted.ok).toBe(true);
    expect(deleted.document.auditEvents.at(-1)).toMatchObject({
      actor: "Primary",
      entityIds: ["txn-grocery-1"],
      eventType: "transaction.deleted",
      occurredAt: "2026-04-03T13:00:00Z",
    });

    const destroyed = destroyTransaction(deleted.document, "txn-grocery-1", {
      audit: {
        actor: "Admin",
        occurredAt: "2026-04-03T13:05:00Z",
      },
    });

    expect(destroyed.ok).toBe(true);
    expect(destroyed.document.auditEvents.at(-1)).toMatchObject({
      actor: "Admin",
      entityIds: ["txn-grocery-1"],
      eventType: "transaction.destroyed",
      occurredAt: "2026-04-03T13:05:00Z",
    });
  });

  it("falls back to event type and system actor when audit context omits identifiers", () => {
    const workspace = createDemoWorkspace();
    const event = createAuditEvent(
      workspace,
      {
        entityIds: [],
        eventType: "transaction.created",
        summary: {},
      },
      {
        occurredAt: "2026-04-03T14:00:00Z",
      },
    );

    expect(event.id).toBe("audit:transaction.created:transaction.created:2026-04-03T14:00:00Z");
    expect(event.actor).toBe("system");
    expect(event.entityIds).toEqual([]);
  });
});
