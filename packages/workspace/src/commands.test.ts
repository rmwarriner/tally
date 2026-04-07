import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createMoney } from "@tally/domain";
import { createLogger, type LogRecord } from "@tally/logging";
import {
  addTransaction,
  applyScheduledTransactionException,
  buildDashboardSnapshot,
  closeWorkspacePeriod,
  createDemoWorkspace,
  deleteTransaction,
  destroyTransaction,
  executeScheduledTransaction,
  importTransactionsFromCsvRows,
  importTransactionsFromStatement,
  importWorkspaceFromGnuCashXml,
  importTransactionsFromQif,
  recordEnvelopeAllocation,
  reconcileAccount,
  upsertBaselineBudgetLine,
  upsertEnvelope,
  updateTransaction,
} from "./index";
import { buildGnuCashXmlExport } from "./gnucash-xml";
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

  it("updates an existing transaction and records an audit event", () => {
    const workspace = createDemoWorkspace();
    const result = updateTransaction(
      workspace,
      "txn-grocery-1",
      {
        id: "txn-grocery-1",
        occurredOn: "2026-04-02",
        description: "Weekly groceries and supplies",
        payee: "Neighborhood Market",
        postings: [
          { accountId: "acct-expense-groceries", amount: createMoney("USD", 160) },
          { accountId: "acct-checking", amount: createMoney("USD", -160), cleared: true },
        ],
        tags: ["household", "edited"],
      },
      {
        audit: { actor: "Primary" },
      },
    );

    expect(result.ok).toBe(true);
    expect(
      result.document.transactions.find((transaction) => transaction.id === "txn-grocery-1"),
    ).toMatchObject({
      description: "Weekly groceries and supplies",
      tags: ["household", "edited"],
    });
    expect(result.document.auditEvents.at(-1)?.eventType).toBe("transaction.updated");
  });

  it("rejects updates for missing transactions", () => {
    const workspace = createDemoWorkspace();
    const result = updateTransaction(
      workspace,
      "txn-missing",
      {
        id: "txn-missing",
        occurredOn: "2026-04-02",
        description: "Missing",
        postings: [
          { accountId: "acct-expense-groceries", amount: createMoney("USD", 100) },
          { accountId: "acct-checking", amount: createMoney("USD", -100) },
        ],
      },
      {
        audit: { actor: "Primary" },
      },
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(["Transaction txn-missing does not exist."]);
  });

  it("soft-deletes transactions without leaving them in operational balances", () => {
    const workspace = createDemoWorkspace();
    const before = buildDashboardSnapshot(workspace, {
      from: "2026-04-01",
      to: "2026-04-30",
    });
    const result = deleteTransaction(
      workspace,
      "txn-grocery-1",
      {
        deletedAt: "2026-04-03T12:00:00Z",
      },
      {
        audit: { actor: "Primary", occurredAt: "2026-04-03T12:00:00Z" },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.document.transactions.find((transaction) => transaction.id === "txn-grocery-1")?.deletion).toEqual({
      deletedAt: "2026-04-03T12:00:00Z",
      deletedBy: "Primary",
    });
    expect(result.document.auditEvents.at(-1)?.eventType).toBe("transaction.deleted");

    const after = buildDashboardSnapshot(result.document, {
      from: "2026-04-01",
      to: "2026-04-30",
    });
    expect(after.accountBalances.find((balance) => balance.accountId === "acct-checking")?.balance).toBeGreaterThan(
      before.accountBalances.find((balance) => balance.accountId === "acct-checking")?.balance ?? 0,
    );
  });

  it("destroys unreferenced transactions and records a durable destroy audit event", () => {
    const workspace = createDemoWorkspace();
    const result = destroyTransaction(workspace, "txn-grocery-1", {
      audit: { actor: "Primary", occurredAt: "2026-04-03T12:05:00Z" },
    });

    expect(result.ok).toBe(true);
    expect(result.document.transactions.some((transaction) => transaction.id === "txn-grocery-1")).toBe(false);
    expect(result.document.auditEvents.at(-1)).toMatchObject({
      actor: "Primary",
      entityIds: ["txn-grocery-1"],
      eventType: "transaction.destroyed",
    });
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

  it("imports qif transactions with category mappings", () => {
    const workspace = createDemoWorkspace();
    const result = importTransactionsFromQif(
      workspace,
      {
        batchId: "qif-import-1",
        cashAccountId: "acct-checking",
        categoryMappings: {
          Salary: "acct-income-salary",
        },
        defaultCounterpartAccountId: "acct-expense-groceries",
        importedAt: "2026-04-05T00:00:00Z",
        qif: `!Type:Bank
D04/03/2026
T-45.12
PCity Utilities
MElectric bill
LUtilities
^
D04/04/2026
T3200.00
PEmployer
MPayroll
LSalary
^
`,
        sourceLabel: "checking.qif",
      },
      {
        audit: { actor: "Primary" },
      },
    );

    expect(result.ok).toBe(true);
    expect(
      result.document.transactions.filter((transaction) => transaction.id.startsWith("qif-import-1")),
    ).toHaveLength(2);
    expect(
      result.document.transactions.find((transaction) => transaction.id === "qif-import-1:2")?.postings,
    ).toEqual([
      {
        accountId: "acct-income-salary",
        amount: createMoney("USD", -3200),
        memo: "Payroll",
      },
      {
        accountId: "acct-checking",
        amount: createMoney("USD", 3200),
        memo: "Payroll",
        cleared: true,
      },
    ]);
    expect(result.document.auditEvents.at(-1)?.eventType).toBe("import.qif.recorded");
  });

  it("imports ofx transactions with name mappings", () => {
    const workspace = createDemoWorkspace();
    const result = importTransactionsFromStatement(
      workspace,
      {
        batchId: "ofx-import-1",
        cashAccountId: "acct-checking",
        defaultCounterpartAccountId: "acct-expense-groceries",
        format: "ofx",
        importedAt: "2026-04-05T00:00:00Z",
        nameMappings: {
          Employer: "acct-income-salary",
        },
        sourceLabel: "checking.ofx",
        statement: `OFXHEADER:100
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260404000000
<TRNAMT>3200.00
<FITID>fit-1
<NAME>Employer
<MEMO>Payroll
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`,
      },
      {
        audit: { actor: "Primary" },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.document.transactions.find((transaction) => transaction.id === "ofx-import-1:1")?.postings).toEqual([
      {
        accountId: "acct-income-salary",
        amount: createMoney("USD", -3200),
        memo: "Payroll",
      },
      {
        accountId: "acct-checking",
        amount: createMoney("USD", 3200),
        memo: "Payroll",
        cleared: true,
      },
    ]);
    expect(result.document.auditEvents.at(-1)?.eventType).toBe("import.ofx.recorded");
  });

  it("imports qfx transactions and records the qfx audit event", () => {
    const workspace = createDemoWorkspace();
    const result = importTransactionsFromStatement(
      workspace,
      {
        batchId: "qfx-import-1",
        cashAccountId: "acct-checking",
        defaultCounterpartAccountId: "acct-expense-groceries",
        format: "qfx",
        importedAt: "2026-04-05T00:00:00Z",
        sourceLabel: "checking.qfx",
        statement: `OFXHEADER:100
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260404
<TRNAMT>-12.50
<FITID>fit-qfx-1
<NAME>Coffee Shop
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`,
      },
      {
        audit: { actor: "Primary" },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.document.auditEvents.at(-1)?.eventType).toBe("import.qfx.recorded");
  });

  it("rejects malformed statement imports before creating transactions", () => {
    const workspace = createDemoWorkspace();
    const result = importTransactionsFromStatement(
      workspace,
      {
        batchId: "bad-statement-1",
        cashAccountId: "acct-checking",
        defaultCounterpartAccountId: "acct-expense-groceries",
        format: "ofx",
        importedAt: "2026-04-05T00:00:00Z",
        sourceLabel: "bad.ofx",
        statement: "<OFX></OFX>",
      },
      {
        audit: { actor: "Primary" },
      },
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(["statement: no STMTTRN entries were found."]);
  });

  it("replaces a workspace from gnucash xml", () => {
    const workspace = createDemoWorkspace();
    const xml = buildGnuCashXmlExport({ workspace }).contents.replace(
      'name="Household Finance"',
      'name="Imported Household Finance"',
    );
    const result = importWorkspaceFromGnuCashXml(
      workspace,
      {
        importedAt: "2026-04-05T00:00:00Z",
        sourceLabel: "workspace.gnucash.xml",
        xml,
      },
      {
        audit: { actor: "Primary" },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.document.name).toBe("Imported Household Finance");
    expect(result.document.auditEvents.at(-1)?.eventType).toBe("import.gnucash-xml.recorded");
  });

  it("rejects gnucash xml imports for a different workspace id", () => {
    const workspace = createDemoWorkspace();
    const xml = buildGnuCashXmlExport({
      workspace: {
        ...workspace,
        id: "other-workspace",
      },
    }).contents;
    const result = importWorkspaceFromGnuCashXml(
      workspace,
      {
        importedAt: "2026-04-05T00:00:00Z",
        sourceLabel: "workspace.gnucash.xml",
        xml,
      },
      {
        audit: { actor: "Primary" },
      },
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      `Workspace XML id other-workspace does not match target workspace ${workspace.id}.`,
    ]);
  });

  it("records closed periods and blocks locked transactions", () => {
    const workspace = createDemoWorkspace();
    const closed = closeWorkspacePeriod(
      workspace,
      {
        closedAt: "2026-04-01T00:00:00Z",
        closedBy: "Primary",
        from: "2026-03-01",
        to: "2026-03-31",
      },
      {
        audit: { actor: "Primary" },
      },
    );

    expect(closed.ok).toBe(true);
    expect(closed.document.closePeriods).toHaveLength(1);
    expect(closed.document.auditEvents.at(-1)?.eventType).toBe("close.recorded");

    const lockedTransaction = addTransaction(
      closed.document,
      {
        id: "txn-locked-1",
        occurredOn: "2026-03-15",
        description: "Backdated transaction",
        postings: [
          { accountId: "acct-expense-groceries", amount: createMoney("USD", 20) },
          { accountId: "acct-checking", amount: createMoney("USD", -20), cleared: true },
        ],
      },
      {
        audit: { actor: "Primary" },
      },
    );

    expect(lockedTransaction.ok).toBe(false);
    expect(lockedTransaction.errors[0]).toContain("locked by closed period 2026-03-01 through 2026-03-31");
  });

  it("rejects invalid or overlapping close periods", () => {
    const workspace = createDemoWorkspace();

    const invalid = closeWorkspacePeriod(
      workspace,
      {
        closedAt: "not-a-timestamp",
        closedBy: "Primary",
        from: "2026-03-31",
        to: "2026-03-01",
      },
      {
        audit: { actor: "Primary" },
      },
    );

    expect(invalid.ok).toBe(false);
    expect(invalid.errors).toContain("Close period closedAt must be a valid ISO timestamp.");
    expect(invalid.errors).toContain("Close period from must be less than or equal to to.");

    const closed = closeWorkspacePeriod(
      workspace,
      {
        closedAt: "2026-04-01T00:00:00Z",
        closedBy: "Primary",
        from: "2026-03-01",
        to: "2026-03-31",
      },
      {
        audit: { actor: "Primary" },
      },
    );

    expect(closed.ok).toBe(true);

    const overlapping = closeWorkspacePeriod(
      closed.document,
      {
        closedAt: "2026-04-02T00:00:00Z",
        closedBy: "Primary",
        from: "2026-03-15",
        to: "2026-04-15",
      },
      {
        audit: { actor: "Primary" },
      },
    );

    expect(overlapping.ok).toBe(false);
    expect(overlapping.errors[0]).toContain("overlaps existing closed period");
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

  it("rejects scheduled transaction execution when missing, malformed, locked, or not due", () => {
    const workspace = createDemoWorkspace();

    expect(
      executeScheduledTransaction(
        workspace,
        {
          occurredOn: "2026-05-01",
          scheduleId: "sched-missing",
        },
        {
          audit: { actor: "Primary" },
        },
      ),
    ).toMatchObject({
      ok: false,
      errors: ["Scheduled transaction sched-missing does not exist."],
    });

    expect(
      executeScheduledTransaction(
        workspace,
        {
          occurredOn: "05/01/2026",
          scheduleId: "sched-rent",
        },
        {
          audit: { actor: "Primary" },
        },
      ),
    ).toMatchObject({
      ok: false,
      errors: ["Scheduled transaction occurredOn must use ISO date format YYYY-MM-DD."],
    });

    expect(
      executeScheduledTransaction(
        workspace,
        {
          occurredOn: "2026-04-01",
          scheduleId: "sched-rent",
        },
        {
          audit: { actor: "Primary" },
        },
      ),
    ).toMatchObject({
      ok: false,
      errors: ["Scheduled transaction sched-rent is not due on 2026-04-01."],
    });

    const closedDocument = {
      ...workspace,
      closePeriods: [
        {
          closedAt: "2026-06-01T00:00:00Z",
          closedBy: "Primary",
          from: "2026-05-01",
          id: "close:2026-05-01:2026-05-31",
          to: "2026-05-31",
        },
      ],
    };
    expect(
      executeScheduledTransaction(
        closedDocument,
        {
          occurredOn: "2026-05-01",
          scheduleId: "sched-rent",
        },
        {
          audit: { actor: "Primary" },
        },
      ).errors[0],
    ).toContain("locked by closed period");
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

  it("rejects invalid schedule exceptions and budget or envelope writes", () => {
    const workspace = createDemoWorkspace();

    expect(
      applyScheduledTransactionException(
        workspace,
        {
          action: "skip-next",
          effectiveOn: "05/01/2026",
          scheduleId: "sched-rent",
        },
        {
          audit: { actor: "Primary" },
        },
      ),
    ).toMatchObject({
      ok: false,
      errors: ["Scheduled transaction effectiveOn must use ISO date format YYYY-MM-DD."],
    });

    expect(
      applyScheduledTransactionException(
        workspace,
        {
          action: "defer",
          nextDueOn: "2026-05-01",
          scheduleId: "sched-rent",
        },
        {
          audit: { actor: "Primary" },
        },
      ),
    ).toMatchObject({
      ok: false,
      errors: ["Scheduled transaction nextDueOn must be later than the current due date."],
    });

    expect(
      upsertBaselineBudgetLine(
        workspace,
        {
          accountId: "acct-checking",
          budgetPeriod: "monthly",
          period: "2026-05",
          plannedAmount: createMoney("USD", 700),
        },
        {
          audit: { actor: "Primary" },
        },
      ),
    ).toMatchObject({
      ok: false,
      errors: ["Baseline budgets should point to income or expense accounts only."],
    });

    const invalidEnvelope = upsertEnvelope(
      workspace,
      {
        availableAmount: createMoney("USD", -10),
        expenseAccountId: "acct-checking",
        fundingAccountId: "acct-expense-groceries",
        id: "env-invalid",
        name: "Invalid Envelope",
        rolloverEnabled: false,
      },
      {
        audit: { actor: "Primary" },
      },
    );

    expect(invalidEnvelope.ok).toBe(false);
    expect(invalidEnvelope.errors).toContain("Envelope expense account must reference an expense account.");
  });

  it("rejects invalid envelope allocations and reconciliation requests", () => {
    const workspace = createDemoWorkspace();

    expect(
      recordEnvelopeAllocation(
        workspace,
        {
          amount: createMoney("USD", 50),
          envelopeId: "env-missing",
          id: "alloc-missing",
          occurredOn: "2026-04-15",
          type: "fund",
        },
        {
          audit: { actor: "Primary" },
        },
      ),
    ).toMatchObject({
      ok: false,
      errors: ["Unknown envelope env-missing."],
    });

    expect(
      recordEnvelopeAllocation(
        workspace,
        {
          amount: createMoney("EUR", 50),
          envelopeId: "env-groceries",
          id: "alloc-bad-commodity",
          occurredOn: "2026-04-15",
          type: "fund",
        },
        {
          audit: { actor: "Primary" },
        },
      ),
    ).toMatchObject({
      ok: false,
      errors: ["Envelope allocation commodity must match the envelope commodity."],
    });

    expect(
      reconcileAccount(
        workspace,
        {
          accountId: "acct-missing",
          clearedTransactionIds: [],
          statementBalance: 0,
          statementDate: "2026-04-30",
        },
        {
          audit: { actor: "Primary" },
        },
      ),
    ).toMatchObject({
      ok: false,
      errors: ["Unknown account acct-missing."],
    });

    const warningResult = reconcileAccount(
      workspace,
      {
        accountId: "acct-checking",
        clearedTransactionIds: ["txn-paycheck-1"],
        statementBalance: 0,
        statementDate: "2026-04-30",
      },
      {
        audit: { actor: "Primary" },
      },
    );

    expect(warningResult.ok).toBe(true);
    expect(warningResult.errors).toEqual(["Reconciliation difference is not zero."]);
  });

  it("saves and loads workspace documents through the file adapter", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tally-"));
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
