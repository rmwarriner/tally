import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createMoney } from "@gnucash-ng/domain";
import { createLogger, type LogRecord } from "@gnucash-ng/logging";
import {
  addTransaction,
  applyScheduledTransactionException,
  createDemoWorkspace,
  executeScheduledTransaction,
  importTransactionsFromCsvRows,
  reconcileAccount,
} from "./index";
import { loadWorkspaceFromFile, saveWorkspaceToFile } from "./storage-node";

describe("workspace commands", () => {
  function createTestLogger(records: LogRecord[]) {
    return createLogger({
      minLevel: "debug",
      service: "workspace-tests",
      sink(record) {
        records.push(record);
      },
    });
  }

  it("adds a valid transaction to the workspace", () => {
    const workspace = createDemoWorkspace();
    const records: LogRecord[] = [];
    const result = addTransaction(workspace, {
      id: "txn-utilities-1",
      occurredOn: "2026-04-03",
      description: "Electric bill",
      payee: "City Utilities",
      postings: [
        { accountId: "acct-expense-utilities", amount: createMoney("USD", 87.11) },
        { accountId: "acct-checking", amount: createMoney("USD", -87.11), cleared: true },
      ],
    }, { logger: createTestLogger(records) });

    expect(result.ok).toBe(true);
    expect(result.document.transactions.at(-1)?.id).toBe("txn-utilities-1");
    expect(result.document.auditEvents).toHaveLength(1);
    expect(records.map((record) => record.message)).toEqual([
      "workspace command started",
      "workspace command completed",
    ]);
  });

  it("reconciles an account and marks cleared postings", () => {
    const workspace = createDemoWorkspace();
    const result = reconcileAccount(workspace, {
      accountId: "acct-checking",
      statementDate: "2026-04-02",
      statementBalance: 3051.58,
      clearedTransactionIds: ["txn-paycheck-1", "txn-grocery-1"],
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.document.reconciliationSessions[0]?.difference.quantity).toBeCloseTo(0);
    expect(result.document.auditEvents[0]?.eventType).toBe("reconciliation.recorded");
    const paycheckPosting = result.document.transactions
      .find((transaction) => transaction.id === "txn-paycheck-1")
      ?.postings.find((posting) => posting.accountId === "acct-checking");

    expect(paycheckPosting?.cleared).toBe(true);
    expect(paycheckPosting?.reconciledAt).toBe("2026-04-02");
  });

  it("imports csv transactions and skips duplicates by fingerprint", () => {
    const workspace = createDemoWorkspace();
    const records: LogRecord[] = [];
    const rows = [
      {
        occurredOn: "2026-04-04",
        description: "Bus pass",
        amount: 45,
        counterpartAccountId: "acct-expense-transport",
        cashAccountId: "acct-checking",
        tags: ["transport"],
      },
      {
        occurredOn: "2026-04-04",
        description: "Bus pass",
        amount: 45,
        counterpartAccountId: "acct-expense-transport",
        cashAccountId: "acct-checking",
        tags: ["transport"],
      },
    ];

    const result = importTransactionsFromCsvRows(workspace, rows, {
      batchId: "import-1",
      sourceLabel: "checking.csv",
      importedAt: "2026-04-05T00:00:00Z",
    }, { logger: createTestLogger(records) });

    expect(result.ok).toBe(true);
    expect(result.document.importBatches[0]?.transactionIds).toEqual(["import-1:1"]);
    expect(
      result.document.transactions.filter((transaction) => transaction.id.startsWith("import-1")),
    ).toHaveLength(1);
    expect(result.document.auditEvents[0]?.eventType).toBe("import.csv.recorded");
    expect(
      records.some(
        (record) =>
          record.message === "workspace command completed" &&
          record.fields.skippedDuplicates === 1,
      ),
    ).toBe(true);
  });

  it("executes due scheduled transactions and advances the schedule", () => {
    const workspace = createDemoWorkspace();
    const result = executeScheduledTransaction(
      workspace,
      {
        occurredOn: "2026-05-01",
        scheduleId: "sched-rent",
      },
      {
        audit: { actor: "Primary" },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.document.transactions.some((transaction) => transaction.id === "sched-rent:2026-05-01")).toBe(
      true,
    );
    expect(result.document.scheduledTransactions.find((schedule) => schedule.id === "sched-rent")?.nextDueOn).toBe(
      "2026-06-01",
    );
    expect(result.document.auditEvents.map((event) => event.eventType).sort()).toEqual([
      "schedule.executed",
      "transaction.created",
    ]);
  });

  it("applies schedule exceptions for skips and deferrals", () => {
    const workspace = createDemoWorkspace();

    const skipped = applyScheduledTransactionException(
      workspace,
      {
        action: "skip-next",
        effectiveOn: "2026-05-01",
        note: "Vacation month",
        scheduleId: "sched-rent",
      },
      {
        audit: { actor: "Primary" },
      },
    );

    expect(skipped.ok).toBe(true);
    expect(skipped.document.scheduledTransactions.find((schedule) => schedule.id === "sched-rent")?.nextDueOn).toBe(
      "2026-06-01",
    );

    const deferred = applyScheduledTransactionException(
      workspace,
      {
        action: "defer",
        nextDueOn: "2026-05-05",
        note: "Landlord grace period",
        scheduleId: "sched-rent",
      },
      {
        audit: { actor: "Primary" },
      },
    );

    expect(deferred.ok).toBe(true);
    expect(deferred.document.scheduledTransactions.find((schedule) => schedule.id === "sched-rent")?.nextDueOn).toBe(
      "2026-05-05",
    );
    expect(
      deferred.document.auditEvents.some((event) => event.eventType === "schedule.exception.applied"),
    ).toBe(true);
  });

  it("saves and loads workspace documents through the file adapter", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gnucash-ng-"));
    const path = join(dir, "workspace.json");
    const workspace = createDemoWorkspace();
    const records: LogRecord[] = [];
    const logger = createTestLogger(records);

    await saveWorkspaceToFile(path, workspace, { logger });
    const loaded = await loadWorkspaceFromFile(path, { logger });

    expect(loaded.id).toBe(workspace.id);
    expect(loaded.transactions).toHaveLength(workspace.transactions.length);
    expect(loaded.auditEvents).toHaveLength(0);
    expect(records.map((record) => record.message)).toContain("workspace storage save completed");
    expect(records.map((record) => record.message)).toContain("workspace storage load completed");

    await rm(dir, { recursive: true, force: true });
  });
});
