import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createMoney } from "@tally/domain";
import { createLogger, type LogRecord } from "@tally/logging";
import {
  addHouseholdMember,
  addTransaction,
  applyScheduledTransactionException,
  archiveAccount,
  buildDashboardSnapshot,
  closeWorkspacePeriod,
  createDemoWorkspace,
  deleteTransaction,
  denyApproval,
  destroyTransaction,
  executeScheduledTransaction,
  grantApproval,
  importTransactionsFromCsvRows,
  importTransactionsFromStatement,
  importWorkspaceFromGnuCashXml,
  importTransactionsFromQif,
  recordEnvelopeAllocation,
  reconcileAccount,
  removeHouseholdMember,
  requestApproval,
  setHouseholdMemberRole,
  upsertAccount,
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

  it("skips duplicate fingerprints in qif imports", () => {
    const workspace = createDemoWorkspace();
    const qifStatement = "!Type:Bank\nD04/04/2026\nT100.00\nPPaycheck\n^\n";
    const params = {
      batchId: "qif-dup-1",
      cashAccountId: "acct-checking",
      defaultCounterpartAccountId: "acct-expense-groceries",
      importedAt: "2026-04-05T00:00:00Z",
      qif: qifStatement,
      sourceLabel: "checking.qif",
    };
    const first = importTransactionsFromQif(workspace, params, { audit: { actor: "Primary" } });
    expect(first.ok).toBe(true);
    const count = first.document.transactions.length;
    const second = importTransactionsFromQif(first.document, { ...params, batchId: "qif-dup-2" }, { audit: { actor: "Primary" } });
    expect(second.ok).toBe(true);
    expect(second.document.transactions).toHaveLength(count);
  });

  it("rejects ofx imports with invalid account references", () => {
    const workspace = createDemoWorkspace();
    const result = importTransactionsFromStatement(
      workspace,
      {
        batchId: "ofx-bad-1",
        cashAccountId: "acct-nonexistent",
        defaultCounterpartAccountId: "acct-expense-groceries",
        format: "ofx",
        importedAt: "2026-04-05T00:00:00Z",
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
<TRNAMT>100.00
<FITID>fit-bad-1
<NAME>Payment
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`,
      },
      { audit: { actor: "Primary" } },
    );

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/unknown account/i);
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

  it("rejects ofx import when transaction date falls in a locked period", () => {
    const workspace = createDemoWorkspace();
    // Close March (demo workspace has no unreconciled transactions in March)
    const closed = closeWorkspacePeriod(
      workspace,
      { closedAt: "2026-04-01T00:00:00Z", closedBy: "Primary", from: "2026-03-01", to: "2026-03-31" },
      { audit: { actor: "Primary" } },
    );
    expect(closed.ok).toBe(true);
    const result = importTransactionsFromStatement(
      closed.document,
      {
        batchId: "ofx-locked-1",
        cashAccountId: "acct-checking",
        defaultCounterpartAccountId: "acct-expense-groceries",
        format: "ofx",
        importedAt: "2026-04-01T00:00:00Z",
        sourceLabel: "checking.ofx",
        statement: `OFXHEADER:100
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260315000000
<TRNAMT>100.00
<FITID>fit-locked-1
<NAME>Payment
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`,
      },
      { audit: { actor: "Primary" } },
    );

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/locked/i);
  });

  it("rejects gnucash xml imports with invalid xml", () => {
    const workspace = createDemoWorkspace();
    const result = importWorkspaceFromGnuCashXml(
      workspace,
      {
        importedAt: "2026-04-05T00:00:00Z",
        sourceLabel: "workspace.gnucash.xml",
        xml: "<gnc-v2 />",
      },
      { audit: { actor: "Primary" } },
    );

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("skips duplicate fingerprints in ofx imports", () => {
    const workspace = createDemoWorkspace();
    const ofxStatement = `OFXHEADER:100
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260404000000
<TRNAMT>100.00
<FITID>fit-unique-1
<NAME>Paycheck
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;
    const params = {
      batchId: "ofx-dup-1",
      cashAccountId: "acct-checking",
      defaultCounterpartAccountId: "acct-expense-groceries",
      format: "ofx" as const,
      importedAt: "2026-04-05T00:00:00Z",
      sourceLabel: "checking.ofx",
      statement: ofxStatement,
    };
    // First import succeeds
    const first = importTransactionsFromStatement(workspace, params, { audit: { actor: "Primary" } });
    expect(first.ok).toBe(true);
    const transactionCount = first.document.transactions.length;

    // Second import with same data — duplicate fingerprint is skipped
    const second = importTransactionsFromStatement(first.document, { ...params, batchId: "ofx-dup-2" }, { audit: { actor: "Primary" } });
    expect(second.ok).toBe(true);
    expect(second.document.transactions).toHaveLength(transactionCount);
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

  it("rejects a close period when the workspace is not ready to close", () => {
    // Demo workspace has transactions on 2026-04-01 with an unreconciled checking account,
    // which causes the reconciliation readiness check to fail.
    const workspace = createDemoWorkspace();
    const result = closeWorkspacePeriod(
      workspace,
      {
        closedAt: "2026-04-07T00:00:00Z",
        closedBy: "Primary",
        from: "2026-04-01",
        to: "2026-04-30",
      },
      { audit: { actor: "Primary" } },
    );

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("not ready to close");
  });

  it("sorts close periods when more than one period is added", () => {
    const workspace = createDemoWorkspace();
    // Close an earlier period first
    const first = closeWorkspacePeriod(
      workspace,
      {
        closedAt: "2026-03-01T00:00:00Z",
        closedBy: "Primary",
        from: "2026-02-01",
        to: "2026-02-28",
      },
      { audit: { actor: "Primary" } },
    );
    expect(first.ok).toBe(true);

    // Close a later period — the sort comparator at line 1514 will run with 2 periods
    const second = closeWorkspacePeriod(
      first.document,
      {
        closedAt: "2026-04-01T00:00:00Z",
        closedBy: "Primary",
        from: "2026-03-01",
        to: "2026-03-31",
      },
      { audit: { actor: "Primary" } },
    );
    expect(second.ok).toBe(true);
    expect(second.document.closePeriods).toHaveLength(2);
    // Periods should be sorted by from date
    expect(second.document.closePeriods?.[0]?.from).toBe("2026-02-01");
    expect(second.document.closePeriods?.[1]?.from).toBe("2026-03-01");
  });

  it("rejects invalid or overlapping close periods", () => {
    const workspace = createDemoWorkspace();

    const badDates = closeWorkspacePeriod(
      workspace,
      {
        closedAt: "2026-04-01T00:00:00Z",
        closedBy: "Primary",
        from: "not-a-date",
        to: "also-bad",
      },
      { audit: { actor: "Primary" } },
    );
    expect(badDates.ok).toBe(false);
    expect(badDates.errors).toContain("Close period from must use ISO date format YYYY-MM-DD.");
    expect(badDates.errors).toContain("Close period to must use ISO date format YYYY-MM-DD.");

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

  describe("addHouseholdMember", () => {
    it("adds a new member to the workspace", () => {
      const workspace = createDemoWorkspace();
      const result = addHouseholdMember(
        workspace,
        { actor: "Child" },
        { audit: { actor: "Primary" } },
      );

      expect(result.ok).toBe(true);
      expect(result.document.householdMembers).toContain("Child");
      expect(result.document.auditEvents.at(-1)?.eventType).toBe("household-member.added");
      expect(result.document.auditEvents.at(-1)?.summary).toMatchObject({
        actor: "Child",
        role: "member",
      });
    });

    it("adds a new member with an explicit role", () => {
      const workspace = createDemoWorkspace();
      const result = addHouseholdMember(
        workspace,
        { actor: "Child", role: "guardian" },
        { audit: { actor: "Primary" } },
      );

      expect(result.ok).toBe(true);
      expect(result.document.householdMemberRoles?.["Child"]).toBe("guardian");
    });

    it("rejects an empty actor string", () => {
      const workspace = createDemoWorkspace();
      const result = addHouseholdMember(workspace, { actor: "" });

      expect(result.ok).toBe(false);
      expect(result.errors).toEqual(["Household member actor is required."]);
      expect(result.document.householdMembers).toEqual(workspace.householdMembers);
    });

    it("rejects a whitespace-only actor string", () => {
      const workspace = createDemoWorkspace();
      const result = addHouseholdMember(workspace, { actor: "   " });

      expect(result.ok).toBe(false);
      expect(result.errors).toEqual(["Household member actor is required."]);
    });

    it("rejects a duplicate actor", () => {
      const workspace = createDemoWorkspace();
      const existing = workspace.householdMembers[0];
      const result = addHouseholdMember(workspace, { actor: existing });

      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("already a household member");
    });
  });

  describe("removeHouseholdMember", () => {
    it("removes an existing member", () => {
      const workspace = {
        ...createDemoWorkspace(),
        householdMembers: ["Primary", "Partner", "Admin"],
        householdMemberRoles: {
          Primary: "guardian" as const,
          Partner: "member" as const,
          Admin: "admin" as const,
        },
      };
      const result = removeHouseholdMember(
        workspace,
        { actor: "Partner" },
        { audit: { actor: "Admin" } },
      );

      expect(result.ok).toBe(true);
      expect(result.document.householdMembers).not.toContain("Partner");
      expect(result.document.householdMemberRoles?.["Partner"]).toBeUndefined();
      expect(result.document.auditEvents.at(-1)?.eventType).toBe("household-member.removed");
    });

    it("rejects removal of a non-member", () => {
      const workspace = createDemoWorkspace();
      const result = removeHouseholdMember(workspace, { actor: "Nobody" });

      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("not a household member");
    });

    it("rejects removal of the last admin", () => {
      const workspace = {
        ...createDemoWorkspace(),
        householdMembers: ["Primary", "Admin"],
        householdMemberRoles: {
          Primary: "guardian" as const,
          Admin: "admin" as const,
        },
      };
      const result = removeHouseholdMember(workspace, { actor: "Admin" });

      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("last admin");
    });

    it("allows removal of an admin when another admin remains", () => {
      const workspace = {
        ...createDemoWorkspace(),
        householdMembers: ["Admin1", "Admin2"],
        householdMemberRoles: {
          Admin1: "admin" as const,
          Admin2: "admin" as const,
        },
      };
      const result = removeHouseholdMember(workspace, { actor: "Admin1" });

      expect(result.ok).toBe(true);
      expect(result.document.householdMembers).not.toContain("Admin1");
    });
  });

  describe("setHouseholdMemberRole", () => {
    it("updates the role of an existing member", () => {
      const workspace = {
        ...createDemoWorkspace(),
        householdMembers: ["Primary", "Partner", "Admin"],
        householdMemberRoles: {
          Primary: "guardian" as const,
          Partner: "member" as const,
          Admin: "admin" as const,
        },
      };
      const result = setHouseholdMemberRole(
        workspace,
        { actor: "Partner", role: "guardian" },
        { audit: { actor: "Admin" } },
      );

      expect(result.ok).toBe(true);
      expect(result.document.householdMemberRoles?.["Partner"]).toBe("guardian");
      expect(result.document.auditEvents.at(-1)?.eventType).toBe("household-member.role-changed");
      expect(result.document.auditEvents.at(-1)?.summary).toMatchObject({
        actor: "Partner",
        previousRole: "member",
        role: "guardian",
      });
    });

    it("rejects role change for a non-member", () => {
      const workspace = createDemoWorkspace();
      const result = setHouseholdMemberRole(workspace, { actor: "Nobody", role: "guardian" });

      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("not a household member");
    });

    it("rejects demotion of the last admin", () => {
      const workspace = {
        ...createDemoWorkspace(),
        householdMembers: ["Primary", "Admin"],
        householdMemberRoles: {
          Primary: "guardian" as const,
          Admin: "admin" as const,
        },
      };
      const result = setHouseholdMemberRole(workspace, { actor: "Admin", role: "guardian" });

      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("last admin");
    });

    it("allows demotion of an admin when another admin remains", () => {
      const workspace = {
        ...createDemoWorkspace(),
        householdMembers: ["Admin1", "Admin2"],
        householdMemberRoles: {
          Admin1: "admin" as const,
          Admin2: "admin" as const,
        },
      };
      const result = setHouseholdMemberRole(workspace, { actor: "Admin1", role: "guardian" });

      expect(result.ok).toBe(true);
      expect(result.document.householdMemberRoles?.["Admin1"]).toBe("guardian");
    });

    it("keeps admin role when setting admin to admin", () => {
      const workspace = {
        ...createDemoWorkspace(),
        householdMembers: ["Admin"],
        householdMemberRoles: { Admin: "admin" as const },
      };
      const result = setHouseholdMemberRole(workspace, { actor: "Admin", role: "admin" });

      expect(result.ok).toBe(true);
      expect(result.document.householdMemberRoles?.["Admin"]).toBe("admin");
    });

    it("adds a role entry for a member with no previous role entry", () => {
      const workspace = {
        ...createDemoWorkspace(),
        householdMembers: ["Primary", "NoRole"],
        householdMemberRoles: { Primary: "guardian" as const },
      };
      const result = setHouseholdMemberRole(workspace, { actor: "NoRole", role: "guardian" });

      expect(result.ok).toBe(true);
      expect(result.document.auditEvents.at(-1)?.summary).toMatchObject({
        previousRole: "member",
        role: "guardian",
      });
    });
  });

  describe("approval commands", () => {
    const approvalId = "approval-1";
    const transactionId = "txn-grocery-1";
    const requestedAt = "2026-04-08T10:00:00.000Z";

    it("requestApproval creates a pending approval for a destroy-transaction", () => {
      const workspace = createDemoWorkspace();
      const result = requestApproval(workspace, {
        approvalId,
        kind: "destroy-transaction",
        entityId: transactionId,
        requestedBy: "Admin",
        requestedAt,
      });

      expect(result.ok).toBe(true);
      const approval = result.document.pendingApprovals?.find((a) => a.id === approvalId);
      expect(approval).toMatchObject({
        id: approvalId,
        kind: "destroy-transaction",
        entityId: transactionId,
        requestedBy: "Admin",
        status: "pending",
      });
      expect(approval?.expiresAt).toBeDefined();
      expect(result.document.auditEvents.at(-1)?.eventType).toBe("approval.requested");
    });

    it("requestApproval rejects a duplicate approval id", () => {
      const workspace = createDemoWorkspace();
      const first = requestApproval(workspace, {
        approvalId,
        kind: "destroy-transaction",
        entityId: transactionId,
        requestedBy: "Admin",
        requestedAt,
      });
      const second = requestApproval(first.document, {
        approvalId,
        kind: "destroy-transaction",
        entityId: transactionId,
        requestedBy: "Admin",
        requestedAt,
      });

      expect(second.ok).toBe(false);
      expect(second.errors[0]).toContain("already exists");
    });

    it("requestApproval rejects a missing transaction", () => {
      const workspace = createDemoWorkspace();
      const result = requestApproval(workspace, {
        approvalId,
        kind: "destroy-transaction",
        entityId: "txn-does-not-exist",
        requestedBy: "Admin",
        requestedAt,
      });

      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("not found");
    });

    it("grantApproval destroys the transaction and records audit events", () => {
      const workspace = createDemoWorkspace();
      const afterRequest = requestApproval(workspace, {
        approvalId,
        kind: "destroy-transaction",
        entityId: transactionId,
        requestedBy: "Admin1",
        requestedAt,
      });

      const result = grantApproval(afterRequest.document, {
        approvalId,
        reviewedBy: "Admin2",
        reviewedAt: "2026-04-08T11:00:00.000Z",
      });

      expect(result.ok).toBe(true);
      expect(result.document.transactions.some((t) => t.id === transactionId)).toBe(false);
      const approval = result.document.pendingApprovals?.find((a) => a.id === approvalId);
      expect(approval?.status).toBe("approved");
      expect(approval?.reviewedBy).toBe("Admin2");
      expect(result.document.auditEvents.some((e) => e.eventType === "approval.granted")).toBe(true);
    });

    it("grantApproval rejects self-approval", () => {
      const workspace = createDemoWorkspace();
      const afterRequest = requestApproval(workspace, {
        approvalId,
        kind: "destroy-transaction",
        entityId: transactionId,
        requestedBy: "Admin",
        requestedAt,
      });

      const result = grantApproval(afterRequest.document, {
        approvalId,
        reviewedBy: "Admin",
        reviewedAt: "2026-04-08T11:00:00.000Z",
      });

      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("different actor");
    });

    it("grantApproval rejects an expired approval", () => {
      const workspace = createDemoWorkspace();
      const afterRequest = requestApproval(workspace, {
        approvalId,
        kind: "destroy-transaction",
        entityId: transactionId,
        requestedBy: "Admin1",
        requestedAt,
      });

      const result = grantApproval(afterRequest.document, {
        approvalId,
        reviewedBy: "Admin2",
        reviewedAt: "2026-04-10T10:00:00.000Z", // 2 days later, past 24h TTL
      });

      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("expired");
    });

    it("grantApproval rejects an already-reviewed approval", () => {
      const workspace = createDemoWorkspace();
      const afterRequest = requestApproval(workspace, {
        approvalId,
        kind: "destroy-transaction",
        entityId: transactionId,
        requestedBy: "Admin1",
        requestedAt,
      });
      const afterGrant = grantApproval(afterRequest.document, {
        approvalId,
        reviewedBy: "Admin2",
        reviewedAt: "2026-04-08T11:00:00.000Z",
      });

      const result = grantApproval(afterGrant.document, {
        approvalId,
        reviewedBy: "Admin2",
        reviewedAt: "2026-04-08T12:00:00.000Z",
      });

      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("already approved");
    });

    it("denyApproval marks approval denied and records audit event", () => {
      const workspace = createDemoWorkspace();
      const afterRequest = requestApproval(workspace, {
        approvalId,
        kind: "destroy-transaction",
        entityId: transactionId,
        requestedBy: "Admin1",
        requestedAt,
      });

      const result = denyApproval(afterRequest.document, {
        approvalId,
        reviewedBy: "Admin2",
        reviewedAt: "2026-04-08T11:00:00.000Z",
      });

      expect(result.ok).toBe(true);
      const approval = result.document.pendingApprovals?.find((a) => a.id === approvalId);
      expect(approval?.status).toBe("denied");
      expect(approval?.reviewedBy).toBe("Admin2");
      // transaction should still exist
      expect(result.document.transactions.some((t) => t.id === transactionId)).toBe(true);
      expect(result.document.auditEvents.some((e) => e.eventType === "approval.denied")).toBe(true);
    });

    it("denyApproval rejects an already-reviewed approval", () => {
      const workspace = createDemoWorkspace();
      const afterRequest = requestApproval(workspace, {
        approvalId,
        kind: "destroy-transaction",
        entityId: transactionId,
        requestedBy: "Admin1",
        requestedAt,
      });
      const afterDeny = denyApproval(afterRequest.document, {
        approvalId,
        reviewedBy: "Admin2",
        reviewedAt: "2026-04-08T11:00:00.000Z",
      });

      const result = denyApproval(afterDeny.document, {
        approvalId,
        reviewedBy: "Admin2",
        reviewedAt: "2026-04-08T12:00:00.000Z",
      });

      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("already denied");
    });
  });

  describe("upsertAccount", () => {
    it("creates a new account when the id does not exist", () => {
      const workspace = createDemoWorkspace();
      const result = upsertAccount(
        workspace,
        { id: "acct-new", code: "9000", name: "New Account", type: "asset" },
        { audit: { actor: "Primary" } },
      );

      expect(result.ok).toBe(true);
      expect(result.document.accounts.find((a) => a.id === "acct-new")).toBeDefined();
      expect(result.document.auditEvents.at(-1)?.eventType).toBe("account.upserted");
      expect(result.document.auditEvents.at(-1)?.summary).toMatchObject({
        accountId: "acct-new",
        isCreate: true,
      });
    });

    it("updates an existing account", () => {
      const workspace = createDemoWorkspace();
      const existing = workspace.accounts[0];
      const result = upsertAccount(
        workspace,
        { ...existing, name: "Updated Name" },
        { audit: { actor: "Primary" } },
      );

      expect(result.ok).toBe(true);
      expect(result.document.accounts.find((a) => a.id === existing.id)?.name).toBe("Updated Name");
      expect(result.document.auditEvents.at(-1)?.summary).toMatchObject({ isCreate: false });
    });

    it("rejects an account with an empty id", () => {
      const workspace = createDemoWorkspace();
      const result = upsertAccount(workspace, { id: "", code: "9000", name: "X", type: "asset" });

      expect(result.ok).toBe(false);
      expect(result.errors).toContain("account.id is required.");
    });

    it("rejects an account with an empty code", () => {
      const workspace = createDemoWorkspace();
      const result = upsertAccount(workspace, { id: "x", code: "", name: "X", type: "asset" });

      expect(result.ok).toBe(false);
      expect(result.errors).toContain("account.code is required.");
    });

    it("rejects an account with an empty name", () => {
      const workspace = createDemoWorkspace();
      const result = upsertAccount(workspace, { id: "x", code: "9000", name: "", type: "asset" });

      expect(result.ok).toBe(false);
      expect(result.errors).toContain("account.name is required.");
    });

    it("rejects an account with an invalid type", () => {
      const workspace = createDemoWorkspace();
      const result = upsertAccount(workspace, {
        id: "x",
        code: "9000",
        name: "X",
        type: "bogus" as never,
      });

      expect(result.ok).toBe(false);
      expect(result.errors).toContain(
        "account.type must be asset, liability, equity, income, or expense.",
      );
    });

    it("rejects a parentAccountId that does not exist", () => {
      const workspace = createDemoWorkspace();
      const result = upsertAccount(workspace, {
        id: "x",
        code: "9000",
        name: "X",
        type: "asset",
        parentAccountId: "nonexistent",
      });

      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("does not exist");
    });

    it("accepts a valid parentAccountId", () => {
      const workspace = createDemoWorkspace();
      const parent = workspace.accounts[0];
      const result = upsertAccount(workspace, {
        id: "child-acct",
        code: "9001",
        name: "Child",
        type: parent.type,
        parentAccountId: parent.id,
      });

      expect(result.ok).toBe(true);
    });
  });

  describe("archiveAccount", () => {
    it("archives an account with no transactions", () => {
      const workspace = createDemoWorkspace();
      // Use an account not referenced by any active transaction
      const unreferencedAccount = workspace.accounts.find(
        (a) => !workspace.transactions.some((t) => t.postings.some((p) => p.accountId === a.id)),
      );
      if (!unreferencedAccount) {
        return; // Skip if demo workspace has all accounts in use
      }

      const result = archiveAccount(
        workspace,
        { accountId: unreferencedAccount.id, archivedAt: "2026-04-08T00:00:00.000Z" },
        { audit: { actor: "Primary" } },
      );

      expect(result.ok).toBe(true);
      expect(result.document.accounts.find((a) => a.id === unreferencedAccount.id)?.archivedAt).toBe(
        "2026-04-08T00:00:00.000Z",
      );
      expect(result.document.auditEvents.at(-1)?.eventType).toBe("account.archived");
    });

    it("rejects archiving a non-existent account", () => {
      const workspace = createDemoWorkspace();
      const result = archiveAccount(workspace, { accountId: "does-not-exist" });

      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("not found");
    });

    it("rejects archiving an already-archived account", () => {
      const workspace = createDemoWorkspace();
      const unreferencedAccount = workspace.accounts.find(
        (a) => !workspace.transactions.some((t) => t.postings.some((p) => p.accountId === a.id)),
      );
      if (!unreferencedAccount) return;

      const first = archiveAccount(workspace, { accountId: unreferencedAccount.id });
      expect(first.ok).toBe(true);

      const second = archiveAccount(first.document, { accountId: unreferencedAccount.id });
      expect(second.ok).toBe(false);
      expect(second.errors[0]).toContain("already archived");
    });

    it("rejects archiving an account that has undeleted transactions", () => {
      const workspace = createDemoWorkspace();
      const accountWithTransactions = workspace.accounts.find((a) =>
        workspace.transactions.some(
          (t) => !t.deletion && t.postings.some((p) => p.accountId === a.id),
        ),
      );
      if (!accountWithTransactions) return;

      const result = archiveAccount(workspace, { accountId: accountWithTransactions.id });

      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("undeleted transactions");
    });
  });
});
