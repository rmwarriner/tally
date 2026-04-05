import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createMoney } from "@gnucash-ng/domain";
import { createLogger, type LogRecord } from "@gnucash-ng/logging";
import { createDemoWorkspace } from "@gnucash-ng/workspace";
import { saveWorkspaceToFile } from "@gnucash-ng/workspace/src/node";
import { ApiError } from "./errors";
import {
  createFileSystemWorkspaceRepository,
  createWorkspaceService,
} from "./index";
import type { DashboardEnvelope, ErrorEnvelope, WorkspaceEnvelope } from "./index";

describe("workspace service", () => {
  function expectWorkspaceBody(
    body: WorkspaceEnvelope | ErrorEnvelope,
  ): asserts body is WorkspaceEnvelope {
    expect("workspace" in body).toBe(true);
  }

  function expectDashboardBody(
    body: DashboardEnvelope | ErrorEnvelope,
  ): asserts body is DashboardEnvelope {
    expect("dashboard" in body).toBe(true);
  }

  function expectErrorBody(body: WorkspaceEnvelope | ErrorEnvelope): asserts body is ErrorEnvelope {
    expect("errors" in body).toBe(true);
    expect("error" in body).toBe(true);
  }

  async function createFixture() {
    const directory = await mkdtemp(join(tmpdir(), "gnucash-ng-api-"));
    const workspace = createDemoWorkspace();
    const workspacePath = join(directory, `${workspace.id}.json`);

    await saveWorkspaceToFile(workspacePath, workspace);

    return {
      cleanup: async () => rm(directory, { recursive: true, force: true }),
      directory,
      workspace,
      workspacePath,
    };
  }

  function createTestLogger(records: LogRecord[]) {
    return createLogger({
      minLevel: "debug",
      service: "api-tests",
      sink(record) {
        records.push(record);
      },
    });
  }

  it("loads a workspace document through the service read path", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      logger: createTestLogger([]),
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.getWorkspace({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      workspaceId: fixture.workspace.id,
    });

    expect(response.status).toBe(200);
    expectWorkspaceBody(response.body);
    expect(response.body.workspace.id).toBe(fixture.workspace.id);

    await fixture.cleanup();
  });

  it("returns a dashboard projection for the requested date range", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      logger: createTestLogger([]),
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.getDashboard({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      from: "2026-04-01",
      to: "2026-04-30",
      workspaceId: fixture.workspace.id,
    });

    expect(response.status).toBe(200);
    expectDashboardBody(response.body);
    expect(response.body.dashboard.netWorth.quantity).toBeCloseTo(3051.58);
    expect(response.body.dashboard.budgetSnapshot).toHaveLength(3);

    await fixture.cleanup();
  });

  it("persists a posted transaction and records an audit event", async () => {
    const records: LogRecord[] = [];
    const fixture = await createFixture();
    const service = createWorkspaceService({
      logger: createTestLogger(records),
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.postTransaction({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      transaction: {
        id: "txn-cell-1",
        occurredOn: "2026-04-03",
        description: "Cell phone",
        payee: "Carrier",
        postings: [
          { accountId: "acct-expense-utilities", amount: createMoney("USD", 82.49) },
          { accountId: "acct-checking", amount: createMoney("USD", -82.49), cleared: true },
        ],
      },
      workspaceId: fixture.workspace.id,
    });

    expect(response.status).toBe(201);
    expectWorkspaceBody(response.body);
    expect(response.body.workspace.transactions.some((item) => item.id === "txn-cell-1")).toBe(true);
    expect(response.body.workspace.auditEvents.at(-1)?.eventType).toBe("transaction.created");
    expect(records.some((record) => record.message === "service command completed")).toBe(true);

    const refreshed = await service.getWorkspace({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      workspaceId: fixture.workspace.id,
    });
    expectWorkspaceBody(refreshed.body);
    expect(refreshed.body.workspace.transactions.some((item) => item.id === "txn-cell-1")).toBe(true);

    await fixture.cleanup();
  });

  it("propagates request ids through service and repository logging", async () => {
    const records: LogRecord[] = [];
    const fixture = await createFixture();
    const logger = createTestLogger(records);
    const service = createWorkspaceService({
      logger,
      repository: createFileSystemWorkspaceRepository({
        logger,
        rootDirectory: fixture.directory,
      }),
    });

    const response = await service.getWorkspace({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      logger: logger.child({ requestId: "req-service-123" }),
      workspaceId: fixture.workspace.id,
    });

    expect(response.status).toBe(200);
    expect(
      records.some(
        (record) =>
          record.message === "service command started" &&
          record.fields.requestId === "req-service-123" &&
          record.fields.operation === "getWorkspace",
      ),
    ).toBe(true);
    expect(
      records.some(
        (record) =>
          record.message === "workspace storage load started" &&
          record.fields.requestId === "req-service-123" &&
          record.fields.workspaceId === fixture.workspace.id,
      ),
    ).toBe(true);

    await fixture.cleanup();
  });

  it("returns validation errors without persisting invalid transactions", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      logger: createTestLogger([]),
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.postTransaction({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      transaction: {
        id: "txn-bad-1",
        occurredOn: "2026-04-03",
        description: "Broken transaction",
        postings: [
          { accountId: "acct-expense-utilities", amount: createMoney("USD", 82.49) },
          { accountId: "acct-checking", amount: createMoney("USD", -80), cleared: true },
        ],
      },
      workspaceId: fixture.workspace.id,
    });

    expect(response.status).toBe(422);
    expectErrorBody(response.body);
    expect(response.body.errors).toContain("Transaction is not balanced for commodity USD.");

    const refreshed = await service.getWorkspace({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      workspaceId: fixture.workspace.id,
    });
    expectWorkspaceBody(refreshed.body);
    expect(refreshed.body.workspace.transactions.some((item) => item.id === "txn-bad-1")).toBe(false);

    await fixture.cleanup();
  });

  it("updates an existing transaction through the service layer", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      logger: createTestLogger([]),
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.updateTransaction({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      transaction: {
        id: "txn-grocery-1",
        occurredOn: "2026-04-02",
        description: "Updated grocery run",
        payee: "Neighborhood Market",
        postings: [
          { accountId: "acct-expense-groceries", amount: createMoney("USD", 155) },
          { accountId: "acct-checking", amount: createMoney("USD", -155), cleared: true },
        ],
        tags: ["household", "edited"],
      },
      transactionId: "txn-grocery-1",
      workspaceId: fixture.workspace.id,
    });

    expect(response.status).toBe(200);
    expectWorkspaceBody(response.body);
    expect(
      response.body.workspace.transactions.find((item) => item.id === "txn-grocery-1"),
    ).toMatchObject({
      description: "Updated grocery run",
      tags: ["household", "edited"],
    });
    expect(response.body.workspace.auditEvents.at(-1)?.eventType).toBe("transaction.updated");

    await fixture.cleanup();
  });

  it("records reconciliations through the service layer", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      logger: createTestLogger([]),
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.postReconciliation({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      payload: {
        accountId: "acct-checking",
        clearedTransactionIds: ["txn-paycheck-1", "txn-grocery-1"],
        statementBalance: 3051.58,
        statementDate: "2026-04-02",
      },
      workspaceId: fixture.workspace.id,
    });

    expect(response.status).toBe(200);
    expectWorkspaceBody(response.body);
    expect(response.body.workspace.reconciliationSessions).toHaveLength(1);
    expect(response.body.workspace.auditEvents.at(-1)?.eventType).toBe("reconciliation.recorded");

    await fixture.cleanup();
  });

  it("upserts baseline budget lines through the service layer", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      logger: createTestLogger([]),
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.postBaselineBudgetLine({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      line: {
        accountId: "acct-expense-groceries",
        budgetPeriod: "monthly",
        period: "2026-05",
        plannedAmount: createMoney("USD", 700),
      },
      workspaceId: fixture.workspace.id,
    });

    expect(response.status).toBe(200);
    expectWorkspaceBody(response.body);
    expect(
      response.body.workspace.baselineBudgetLines.some(
        (item) => item.accountId === "acct-expense-groceries" && item.period === "2026-05",
      ),
    ).toBe(true);

    await fixture.cleanup();
  });

  it("upserts envelopes and records allocations through the service layer", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      logger: createTestLogger([]),
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });

    const envelopeResponse = await service.postEnvelope({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      envelope: {
        availableAmount: createMoney("USD", 150),
        expenseAccountId: "acct-expense-housing",
        fundingAccountId: "acct-checking",
        id: "env-housing",
        name: "Housing Buffer",
        rolloverEnabled: true,
        targetAmount: createMoney("USD", 150),
      },
      workspaceId: fixture.workspace.id,
    });

    expect(envelopeResponse.status).toBe(200);
    expectWorkspaceBody(envelopeResponse.body);
    expect(envelopeResponse.body.workspace.envelopes.some((item) => item.id === "env-housing")).toBe(true);

    const allocationResponse = await service.postEnvelopeAllocation({
      allocation: {
        amount: createMoney("USD", 75),
        envelopeId: "env-housing",
        id: "alloc-housing-1",
        occurredOn: "2026-04-10",
        type: "fund",
      },
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      workspaceId: fixture.workspace.id,
    });

    expect(allocationResponse.status).toBe(200);
    expectWorkspaceBody(allocationResponse.body);
    expect(
      allocationResponse.body.workspace.envelopeAllocations.some((item) => item.id === "alloc-housing-1"),
    ).toBe(true);

    await fixture.cleanup();
  });

  it("upserts scheduled transactions through the service layer", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      logger: createTestLogger([]),
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.postScheduledTransaction({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      schedule: {
        autoPost: true,
        frequency: "monthly",
        id: "sched-utilities",
        name: "Monthly Utilities",
        nextDueOn: "2026-05-15",
        templateTransaction: {
          description: "Monthly utilities",
          payee: "City Utilities",
          postings: [
            { accountId: "acct-expense-utilities", amount: createMoney("USD", 120) },
            { accountId: "acct-checking", amount: createMoney("USD", -120) },
          ],
        },
      },
      workspaceId: fixture.workspace.id,
    });

    expect(response.status).toBe(200);
    expectWorkspaceBody(response.body);
    expect(response.body.workspace.scheduledTransactions.some((item) => item.id === "sched-utilities")).toBe(
      true,
    );

    await fixture.cleanup();
  });

  it("executes due scheduled transactions through the service layer", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      logger: createTestLogger([]),
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.executeScheduledTransaction({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      payload: {
        occurredOn: "2026-05-01",
      },
      scheduleId: "sched-rent",
      workspaceId: fixture.workspace.id,
    });

    expect(response.status).toBe(201);
    expectWorkspaceBody(response.body);
    expect(response.body.workspace.transactions.some((item) => item.id === "sched-rent:2026-05-01")).toBe(true);
    expect(response.body.workspace.scheduledTransactions.find((item) => item.id === "sched-rent")?.nextDueOn).toBe(
      "2026-06-01",
    );
    expect(response.body.workspace.auditEvents.some((event) => event.eventType === "schedule.executed")).toBe(true);

    await fixture.cleanup();
  });

  it("applies schedule exceptions through the service layer", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      logger: createTestLogger([]),
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.applyScheduledTransactionException({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      payload: {
        action: "defer",
        nextDueOn: "2026-05-05",
        note: "Landlord grace period",
      },
      scheduleId: "sched-rent",
      workspaceId: fixture.workspace.id,
    });

    expect(response.status).toBe(200);
    expectWorkspaceBody(response.body);
    expect(response.body.workspace.scheduledTransactions.find((item) => item.id === "sched-rent")?.nextDueOn).toBe(
      "2026-05-05",
    );
    expect(
      response.body.workspace.auditEvents.some((event) => event.eventType === "schedule.exception.applied"),
    ).toBe(true);

    await fixture.cleanup();
  });

  it("forbids access for actors outside the household", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      logger: createTestLogger([]),
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.getWorkspace({
      auth: { actor: "Intruder", kind: "token", role: "member", token: "bad" },
      workspaceId: fixture.workspace.id,
    });

    expect(response.status).toBe(403);
    expectErrorBody(response.body);
    expect(response.body.errors[0]).toContain("not authorized");
    expect(response.body.error.code).toBe("auth.forbidden");

    await fixture.cleanup();
  });

  it("returns typed not found errors for missing workspaces", async () => {
    const service = createWorkspaceService({
      logger: createTestLogger([]),
      repository: createFileSystemWorkspaceRepository({ rootDirectory: "/tmp/gnucash-ng-missing" }),
    });

    const response = await service.getWorkspace({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      workspaceId: "missing-workspace",
    });

    expect(response.status).toBe(404);
    expectErrorBody(response.body);
    expect(response.body.error.code).toBe("workspace.not_found");
  });

  it("masks unexpected repository failures as internal errors", async () => {
    const service = createWorkspaceService({
      logger: createTestLogger([]),
      repository: {
        async load() {
          throw new Error("disk exploded");
        },
        async save() {
          throw new ApiError({
            code: "repository.unavailable",
            expose: false,
            message: "Workspace storage is unavailable.",
            status: 500,
          });
        },
      },
    });

    const response = await service.getWorkspace({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      workspaceId: "workspace-household-demo",
    });

    expect(response.status).toBe(500);
    expectErrorBody(response.body);
    expect(response.body.error.code).toBe("internal.unexpected");
    expect(response.body.errors[0]).toBe("An unexpected error occurred.");
  });
});
