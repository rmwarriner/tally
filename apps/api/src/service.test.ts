import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createMoney } from "@tally/domain";
import { createLogger, type LogRecord } from "@tally/logging";
import { buildGnuCashXmlExport, createDemoBook } from "@tally/book";
import { saveBookToFile } from "@tally/book/src/node";
import { ApiError } from "./errors";
import {
  createFileSystemBookRepository,
  createBookService,
} from "./index";
import type { DashboardEnvelope, ErrorEnvelope, BookEnvelope } from "./index";

describe("book service", () => {
  function expectBookBody(
    body: BookEnvelope | ErrorEnvelope,
  ): asserts body is BookEnvelope {
    expect("book" in body).toBe(true);
  }

  function expectDashboardBody(
    body: DashboardEnvelope | ErrorEnvelope,
  ): asserts body is DashboardEnvelope {
    expect("dashboard" in body).toBe(true);
  }

  function expectErrorBody(body: BookEnvelope | ErrorEnvelope): asserts body is ErrorEnvelope {
    expect("errors" in body).toBe(true);
    expect("error" in body).toBe(true);
  }

  function expectAnyErrorBody(body: unknown): asserts body is ErrorEnvelope {
    expect(typeof body).toBe("object");
    expect(body).not.toBeNull();
    expect("errors" in (body as Record<string, unknown>)).toBe(true);
    expect("error" in (body as Record<string, unknown>)).toBe(true);
  }

  async function createFixture() {
    const directory = await mkdtemp(join(tmpdir(), "tally-api-"));
    const book = createDemoBook();
    const bookPath = join(directory, `${book.id}.json`);

    await saveBookToFile(bookPath, book);

    return {
      cleanup: async () => rm(directory, { recursive: true, force: true }),
      directory,
      book,
      bookPath,
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

  it("loads a book document through the service read path", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.getBook({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(200);
    expectBookBody(response.body);
    expect(response.body.book.id).toBe(fixture.book.id);

    await fixture.cleanup();
  });

  it("returns a dashboard projection for the requested date range", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.getDashboard({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      from: "2026-04-01",
      to: "2026-04-30",
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(200);
    expectDashboardBody(response.body);
    expect(response.body.dashboard.netWorth.quantity).toBeCloseTo(3051.58);
    expect(response.body.dashboard.budgetSnapshot).toHaveLength(3);

    await fixture.cleanup();
  });

  it("returns a cash-flow report for the requested date range", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.getReport({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      from: "2026-04-01",
      kind: "cash-flow",
      to: "2026-04-30",
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(200);
    expect("report" in response.body).toBe(true);
    if ("report" in response.body) {
      expect(response.body.report.kind).toBe("cash-flow");
    }

    await fixture.cleanup();
  });

  it("rejects read access for actors outside the book household", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.getReport({
      auth: { actor: "Outside User", kind: "token", role: "member", token: "token-2" },
      from: "2026-04-01",
      kind: "cash-flow",
      to: "2026-04-30",
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(403);
    expectAnyErrorBody(response.body);
    expect(response.body.error.code).toBe("auth.forbidden");

    await fixture.cleanup();
  });

  it("rejects protected read endpoints for non-member actors", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const auth = { actor: "Outside User", kind: "token" as const, role: "member" as const, token: "token-2" };

    const responses = await Promise.all([
      service.getBook({ auth, bookId: fixture.book.id }),
      service.getDashboard({
        auth,
        from: "2026-04-01",
        to: "2026-04-30",
        bookId: fixture.book.id,
      }),
      service.getBackups({ auth, bookId: fixture.book.id }),
      service.getCloseSummary({
        auth,
        from: "2026-04-01",
        to: "2026-04-30",
        bookId: fixture.book.id,
      }),
      service.getQifExport({
        accountId: "acct-checking",
        auth,
        from: "2026-04-01",
        to: "2026-04-30",
        bookId: fixture.book.id,
      }),
      service.getStatementExport({
        accountId: "acct-checking",
        auth,
        format: "qfx",
        from: "2026-04-01",
        to: "2026-04-30",
        bookId: fixture.book.id,
      }),
      service.getGnuCashXmlExport({ auth, bookId: fixture.book.id }),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
      expectAnyErrorBody(response.body);
      expect(response.body.error.code).toBe("auth.forbidden");
    }

    await fixture.cleanup();
  });

  it("persists a posted transaction and records an audit event", async () => {
    const records: LogRecord[] = [];
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger(records),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
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
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(201);
    expectBookBody(response.body);
    expect(response.body.book.transactions.some((item) => item.id === "txn-cell-1")).toBe(true);
    expect(response.body.book.auditEvents.at(-1)?.eventType).toBe("transaction.created");
    expect(response.body.book.auditEvents.at(-1)?.summary.actorRole).toBe("guardian");
    expect(response.body.book.auditEvents.at(-1)?.summary.authorization).toMatchObject({
      access: "write",
      effectiveRole: "guardian",
      grantedBy: "book-role",
    });
    expect(records.some((record) => record.message === "service command completed")).toBe(true);

    const refreshed = await service.getBook({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      bookId: fixture.book.id,
    });
    expectBookBody(refreshed.body);
    expect(refreshed.body.book.transactions.some((item) => item.id === "txn-cell-1")).toBe(true);

    await fixture.cleanup();
  });

  it("imports ofx statements through the service layer", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.postStatementImport({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      payload: {
        batchId: "service-ofx-1",
        cashAccountId: "acct-checking",
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
<TRNTYPE>DEBIT
<DTPOSTED>20260403000000
<TRNAMT>-45.12
<FITID>fit-service-1
<NAME>City Utilities
<MEMO>Electric bill
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`,
      },
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(201);
    expectBookBody(response.body);
    expect(response.body.book.auditEvents.at(-1)?.eventType).toBe("import.ofx.recorded");

    await fixture.cleanup();
  });

  it("returns validation failures for malformed statement imports", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.postStatementImport({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      payload: {
        batchId: "service-ofx-bad-1",
        cashAccountId: "acct-checking",
        defaultCounterpartAccountId: "acct-expense-groceries",
        format: "qfx",
        importedAt: "2026-04-05T00:00:00Z",
        sourceLabel: "checking.qfx",
        statement: "<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>bad</DTPOSTED><TRNAMT>x</TRNAMT></STMTTRN></BANKTRANLIST></OFX>",
      },
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(422);
    expectErrorBody(response.body);
    expect(response.body.error.code).toBe("validation.failed");

    await fixture.cleanup();
  });

  it("rejects protected write endpoints for non-member actors", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const auth = { actor: "Outside User", kind: "token" as const, role: "member" as const, token: "token-2" };

    const responses = await Promise.all([
      service.postCsvImport({
        auth,
        payload: {
          batchId: "csv-1",
          importedAt: "2026-04-05T00:00:00Z",
          rows: [
            {
              amount: 25,
              cashAccountId: "acct-checking",
              counterpartAccountId: "acct-expense-groceries",
              description: "Groceries",
              occurredOn: "2026-04-03",
            },
          ],
          sourceLabel: "checking.csv",
        },
        bookId: fixture.book.id,
      }),
      service.postQifImport({
        auth,
        payload: {
          batchId: "qif-1",
          cashAccountId: "acct-checking",
          defaultCounterpartAccountId: "acct-expense-groceries",
          importedAt: "2026-04-05T00:00:00Z",
          qif: "!Type:Bank\nD04/03/2026\nT-45.12\nPCity Utilities\n^\n",
          sourceLabel: "checking.qif",
        },
        bookId: fixture.book.id,
      }),
      service.postTransaction({
        auth,
        transaction: {
          description: "Utilities",
          id: "txn-forbidden-1",
          occurredOn: "2026-04-03",
          postings: [
            { accountId: "acct-expense-utilities", amount: createMoney("USD", 45.12) },
            { accountId: "acct-checking", amount: createMoney("USD", -45.12) },
          ],
        },
        bookId: fixture.book.id,
      }),
      service.updateTransaction({
        auth,
        transaction: {
          description: "Updated groceries",
          id: "txn-grocery-1",
          occurredOn: "2026-04-02",
          postings: [
            { accountId: "acct-expense-groceries", amount: createMoney("USD", 150) },
            { accountId: "acct-checking", amount: createMoney("USD", -150) },
          ],
        },
        transactionId: "txn-grocery-1",
        bookId: fixture.book.id,
      }),
      service.postBaselineBudgetLine({
        auth,
        line: {
          accountId: "acct-expense-groceries",
          budgetPeriod: "monthly",
          period: "2026-05",
          plannedAmount: createMoney("USD", 700),
        },
        bookId: fixture.book.id,
      }),
      service.postEnvelope({
        auth,
        envelope: {
          availableAmount: createMoney("USD", 150),
          expenseAccountId: "acct-expense-housing",
          fundingAccountId: "acct-checking",
          id: "env-housing",
          name: "Housing Buffer",
          rolloverEnabled: true,
          targetAmount: createMoney("USD", 150),
        },
        bookId: fixture.book.id,
      }),
      service.postEnvelopeAllocation({
        allocation: {
          amount: createMoney("USD", 50),
          envelopeId: "env-groceries",
          id: "alloc-forbidden-1",
          occurredOn: "2026-04-15",
          type: "fund",
        },
        auth,
        bookId: fixture.book.id,
      }),
      service.postReconciliation({
        auth,
        payload: {
          accountId: "acct-checking",
          clearedTransactionIds: ["txn-paycheck-1"],
          statementBalance: 3051.58,
          statementDate: "2026-04-02",
        },
        bookId: fixture.book.id,
      }),
      service.postScheduledTransaction({
        auth,
        schedule: {
          autoPost: false,
          frequency: "monthly",
          id: "sched-utilities",
          name: "Monthly Utilities",
          nextDueOn: "2026-05-15",
          templateTransaction: {
            description: "Monthly utilities",
            postings: [
              { accountId: "acct-expense-utilities", amount: createMoney("USD", 120) },
              { accountId: "acct-checking", amount: createMoney("USD", -120) },
            ],
          },
        },
        bookId: fixture.book.id,
      }),
      service.executeScheduledTransaction({
        auth,
        payload: { occurredOn: "2026-05-01" },
        scheduleId: "sched-rent",
        bookId: fixture.book.id,
      }),
      service.applyScheduledTransactionException({
        auth,
        payload: {
          action: "defer",
          nextDueOn: "2026-05-05",
        },
        scheduleId: "sched-rent",
        bookId: fixture.book.id,
      }),
      service.postBackup({ auth, bookId: fixture.book.id }),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
      expectAnyErrorBody(response.body);
      expect(response.body.error.code).toBe("auth.forbidden");
    }

    await fixture.cleanup();
  });

  it("exports and reimports gnucash xml through the service layer", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const exported = await service.getGnuCashXmlExport({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      bookId: fixture.book.id,
    });

    expect(exported.status).toBe(200);
    expect("export" in exported.body).toBe(true);

    const xml = buildGnuCashXmlExport({ book: fixture.book }).contents.replace(
      'name="Household Finance"',
      'name="Imported Through Service"',
    );
    const imported = await service.postGnuCashXmlImport({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      payload: {
        importedAt: "2026-04-05T00:00:00Z",
        sourceLabel: "book.gnucash.xml",
        xml,
      },
      bookId: fixture.book.id,
    });

    expect(imported.status).toBe(200);
    expectBookBody(imported.body);
    expect(imported.body.book.name).toBe("Imported Through Service");

    await fixture.cleanup();
  });

  it("returns validation failures for mismatched gnucash xml book ids", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const imported = await service.postGnuCashXmlImport({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      payload: {
        importedAt: "2026-04-05T00:00:00Z",
        sourceLabel: "book.gnucash.xml",
        xml: buildGnuCashXmlExport({ book: { ...fixture.book, id: "other-book" } }).contents,
      },
      bookId: fixture.book.id,
    });

    expect(imported.status).toBe(422);
    expectErrorBody(imported.body);
    expect(imported.body.error.code).toBe("validation.failed");

    await fixture.cleanup();
  });

  it("persists close periods through the service layer", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.postClosePeriod({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      payload: {
        closedAt: "2026-04-01T00:00:00Z",
        from: "2026-03-01",
        to: "2026-03-31",
      },
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(201);
    expectBookBody(response.body);
    expect(response.body.book.closePeriods).toHaveLength(1);

    await fixture.cleanup();
  });

  it("returns validation failures for overlapping close periods", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const first = await service.postClosePeriod({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      payload: {
        closedAt: "2026-04-01T00:00:00Z",
        from: "2026-03-01",
        to: "2026-03-31",
      },
      bookId: fixture.book.id,
    });
    expect(first.status).toBe(201);

    const second = await service.postClosePeriod({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      payload: {
        closedAt: "2026-04-02T00:00:00Z",
        from: "2026-03-15",
        to: "2026-04-15",
      },
      bookId: fixture.book.id,
    });

    expect(second.status).toBe(422);
    expectErrorBody(second.body);
    expect(second.body.error.code).toBe("validation.failed");

    await fixture.cleanup();
  });

  it("creates, lists, and restores backups through the service layer", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const backupResponse = await service.postBackup({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      bookId: fixture.book.id,
    });

    expect(backupResponse.status).toBe(201);
    expect("backup" in backupResponse.body).toBe(true);

    const updateResponse = await service.postGnuCashXmlImport({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      payload: {
        importedAt: "2026-04-05T00:00:00Z",
        sourceLabel: "book.gnucash.xml",
        xml: buildGnuCashXmlExport({ book: fixture.book }).contents.replace(
          'name="Household Finance"',
          'name="Changed Before Restore"',
        ),
      },
      bookId: fixture.book.id,
    });
    expect(updateResponse.status).toBe(200);

    const listResponse = await service.getBackups({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      bookId: fixture.book.id,
    });

    expect(listResponse.status).toBe(200);
    expect("backups" in listResponse.body).toBe(true);
    if (!("backups" in listResponse.body) || !("backup" in backupResponse.body)) {
      throw new Error("backup response shape mismatch");
    }

    const restoreResponse = await service.postBackupRestore({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      backupId: backupResponse.body.backup.id,
      bookId: fixture.book.id,
    });

    expect(restoreResponse.status).toBe(200);
    expectBookBody(restoreResponse.body);
    expect(restoreResponse.body.book.name).toBe("Household Finance");

    await fixture.cleanup();
  });

  it("forbids operate-level mutations for book members without guardian or admin role", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.postBackup({
      auth: { actor: "Partner", kind: "token", role: "member", token: "token-2" },
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(403);
    expectAnyErrorBody(response.body);
    expect(response.body.error.code).toBe("auth.forbidden");

    await fixture.cleanup();
  });

  it("returns not found for missing backups during restore", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const restoreResponse = await service.postBackupRestore({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      backupId: "backup-missing",
      bookId: fixture.book.id,
    });

    expect(restoreResponse.status).toBe(404);
    expectErrorBody(restoreResponse.body);
    expect(restoreResponse.body.error.code).toBe("book.not_found");

    await fixture.cleanup();
  });

  it("returns export payloads for qif and ofx endpoints", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const qif = await service.getQifExport({
      accountId: "acct-checking",
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      from: "2026-04-01",
      to: "2026-04-30",
      bookId: fixture.book.id,
    });
    const ofx = await service.getStatementExport({
      accountId: "acct-checking",
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      format: "ofx",
      from: "2026-04-01",
      to: "2026-04-30",
      bookId: fixture.book.id,
    });

    expect(qif.status).toBe(200);
    expect("export" in qif.body).toBe(true);
    expect(ofx.status).toBe(200);
    expect("export" in ofx.body).toBe(true);

    await fixture.cleanup();
  });

  it("propagates request ids through service and repository logging", async () => {
    const records: LogRecord[] = [];
    const fixture = await createFixture();
    const logger = createTestLogger(records);
    const service = createBookService({
      logger,
      repository: createFileSystemBookRepository({
        logger,
        rootDirectory: fixture.directory,
      }),
    });

    const response = await service.getBook({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      logger: logger.child({ requestId: "req-service-123" }),
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(200);
    expect(
      records.some(
        (record) =>
          record.message === "service command started" &&
          record.fields.requestId === "req-service-123" &&
          record.fields.operation === "getBook",
      ),
    ).toBe(true);
    expect(
      records.some(
        (record) =>
          record.message === "book storage load started" &&
          record.fields.requestId === "req-service-123" &&
          record.fields.bookId === fixture.book.id,
      ),
    ).toBe(true);

    await fixture.cleanup();
  });

  it("returns validation errors without persisting invalid transactions", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
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
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(422);
    expectErrorBody(response.body);
    expect(response.body.errors).toContain("Transaction is not balanced for commodity USD.");

    const refreshed = await service.getBook({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      bookId: fixture.book.id,
    });
    expectBookBody(refreshed.body);
    expect(refreshed.body.book.transactions.some((item) => item.id === "txn-bad-1")).toBe(false);

    await fixture.cleanup();
  });

  it("updates an existing transaction through the service layer", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
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
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(200);
    expectBookBody(response.body);
    expect(
      response.body.book.transactions.find((item) => item.id === "txn-grocery-1"),
    ).toMatchObject({
      description: "Updated grocery run",
      tags: ["household", "edited"],
    });
    expect(response.body.book.auditEvents.at(-1)?.eventType).toBe("transaction.updated");

    await fixture.cleanup();
  });

  it("soft-deletes transactions through the service layer without returning them in book reads", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.deleteTransaction({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      transactionId: "txn-grocery-1",
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(200);
    expectBookBody(response.body);
    expect(response.body.book.transactions.some((item) => item.id === "txn-grocery-1")).toBe(false);
    expect(response.body.book.auditEvents.at(-1)?.eventType).toBe("transaction.deleted");

    const refreshed = await service.getBook({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      bookId: fixture.book.id,
    });
    expectBookBody(refreshed.body);
    expect(refreshed.body.book.transactions.some((item) => item.id === "txn-grocery-1")).toBe(false);

    await fixture.cleanup();
  });

  it("requires privileged authority for transaction destroy through the service layer", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const forbidden = await service.destroyTransaction({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      transactionId: "txn-grocery-1",
      bookId: fixture.book.id,
    });

    expect(forbidden.status).toBe(403);
    expectAnyErrorBody(forbidden.body);
    expect(forbidden.body.error.code).toBe("auth.forbidden");

    const allowed = await service.destroyTransaction({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      transactionId: "txn-grocery-1",
      bookId: fixture.book.id,
    });

    expect(allowed.status).toBe(200);
    expectBookBody(allowed.body);
    expect(allowed.body.book.transactions.some((item) => item.id === "txn-grocery-1")).toBe(false);
    expect(allowed.body.book.auditEvents.at(-1)?.eventType).toBe("transaction.destroyed");

    await fixture.cleanup();
  });

  it("records reconciliations through the service layer", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.postReconciliation({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      payload: {
        accountId: "acct-checking",
        clearedTransactionIds: ["txn-paycheck-1", "txn-grocery-1"],
        statementBalance: 3051.58,
        statementDate: "2026-04-02",
      },
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(200);
    expectBookBody(response.body);
    expect(response.body.book.reconciliationSessions).toHaveLength(1);
    expect(response.body.book.auditEvents.at(-1)?.eventType).toBe("reconciliation.recorded");

    await fixture.cleanup();
  });

  it("upserts baseline budget lines through the service layer", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.postBaselineBudgetLine({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      line: {
        accountId: "acct-expense-groceries",
        budgetPeriod: "monthly",
        period: "2026-05",
        plannedAmount: createMoney("USD", 700),
      },
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(200);
    expectBookBody(response.body);
    expect(
      response.body.book.baselineBudgetLines.some(
        (item) => item.accountId === "acct-expense-groceries" && item.period === "2026-05",
      ),
    ).toBe(true);

    await fixture.cleanup();
  });

  it("upserts envelopes and records allocations through the service layer", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
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
      bookId: fixture.book.id,
    });

    expect(envelopeResponse.status).toBe(200);
    expectBookBody(envelopeResponse.body);
    expect(envelopeResponse.body.book.envelopes.some((item) => item.id === "env-housing")).toBe(true);

    const allocationResponse = await service.postEnvelopeAllocation({
      allocation: {
        amount: createMoney("USD", 75),
        envelopeId: "env-housing",
        id: "alloc-housing-1",
        occurredOn: "2026-04-10",
        type: "fund",
      },
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      bookId: fixture.book.id,
    });

    expect(allocationResponse.status).toBe(200);
    expectBookBody(allocationResponse.body);
    expect(
      allocationResponse.body.book.envelopeAllocations.some((item) => item.id === "alloc-housing-1"),
    ).toBe(true);

    await fixture.cleanup();
  });

  it("upserts scheduled transactions through the service layer", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
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
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(200);
    expectBookBody(response.body);
    expect(response.body.book.scheduledTransactions.some((item) => item.id === "sched-utilities")).toBe(
      true,
    );

    await fixture.cleanup();
  });

  it("executes due scheduled transactions through the service layer", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.executeScheduledTransaction({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      payload: {
        occurredOn: "2026-05-01",
      },
      scheduleId: "sched-rent",
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(201);
    expectBookBody(response.body);
    expect(response.body.book.transactions.some((item) => item.id === "sched-rent:2026-05-01")).toBe(true);
    expect(response.body.book.scheduledTransactions.find((item) => item.id === "sched-rent")?.nextDueOn).toBe(
      "2026-06-01",
    );
    expect(response.body.book.auditEvents.some((event) => event.eventType === "schedule.executed")).toBe(true);

    await fixture.cleanup();
  });

  it("applies schedule exceptions through the service layer", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.applyScheduledTransactionException({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      payload: {
        action: "defer",
        nextDueOn: "2026-05-05",
        note: "Landlord grace period",
      },
      scheduleId: "sched-rent",
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(200);
    expectBookBody(response.body);
    expect(response.body.book.scheduledTransactions.find((item) => item.id === "sched-rent")?.nextDueOn).toBe(
      "2026-05-05",
    );
    expect(
      response.body.book.auditEvents.some((event) => event.eventType === "schedule.exception.applied"),
    ).toBe(true);

    await fixture.cleanup();
  });

  it("forbids access for actors outside the household", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.getBook({
      auth: { actor: "Intruder", kind: "token", role: "member", token: "bad" },
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(403);
    expectErrorBody(response.body);
    expect(response.body.errors[0]).toContain("not authorized");
    expect(response.body.error.code).toBe("auth.forbidden");

    await fixture.cleanup();
  });

  it("returns typed not found errors for missing books", async () => {
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: "/tmp/tally-missing" }),
    });

    const response = await service.getBook({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      bookId: "missing-book",
    });

    expect(response.status).toBe(404);
    expectErrorBody(response.body);
    expect(response.body.error.code).toBe("book.not_found");
  });

  it("masks unexpected repository failures as internal errors", async () => {
    const service = createBookService({
      logger: createTestLogger([]),
      repository: {
        async createBackup() {
          throw new Error("disk exploded");
        },
        async listBackups() {
          throw new Error("disk exploded");
        },
        async load() {
          throw new Error("disk exploded");
        },
        async restoreBackup() {
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

    const response = await service.getBook({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      bookId: "book-household-demo",
    });

    expect(response.status).toBe(500);
    expectErrorBody(response.body);
    expect(response.body.error.code).toBe("internal.unexpected");
    expect(response.body.errors[0]).toBe("An unexpected error occurred.");
  });

  it("returns audit events for the workspace", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    // Seed a transaction so an audit event exists.
    await service.postTransaction({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      transaction: {
        id: "txn-audit-test-1",
        occurredOn: "2026-04-05",
        description: "Audit test",
        postings: [
          { accountId: "acct-expense-utilities", amount: createMoney("USD", 10) },
          { accountId: "acct-checking", amount: createMoney("USD", -10), cleared: true },
        ],
      },
      bookId: fixture.book.id,
    });

    const response = await service.getAuditEvents({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(200);
    expect("auditEvents" in response.body).toBe(true);
    if ("auditEvents" in response.body) {
      expect(response.body.auditEvents.some((e) => e.eventType === "transaction.created")).toBe(true);
    }

    await fixture.cleanup();
  });

  it("filters audit events by eventType", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    await service.postTransaction({
      auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      transaction: {
        id: "txn-audit-filter-1",
        occurredOn: "2026-04-05",
        description: "Filter test",
        postings: [
          { accountId: "acct-expense-utilities", amount: createMoney("USD", 5) },
          { accountId: "acct-checking", amount: createMoney("USD", -5), cleared: true },
        ],
      },
      bookId: fixture.book.id,
    });

    const response = await service.getAuditEvents({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      eventType: "transaction.created",
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(200);
    if ("auditEvents" in response.body) {
      expect(response.body.auditEvents.every((e) => e.eventType === "transaction.created")).toBe(true);
    }

    await fixture.cleanup();
  });

  it("limits audit events with the limit parameter", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    // Post two transactions to ensure multiple events.
    for (const id of ["txn-limit-a", "txn-limit-b", "txn-limit-c"]) {
      await service.postTransaction({
        auth: { actor: "Primary", kind: "token", role: "member", token: "token-1" },
        transaction: {
          id,
          occurredOn: "2026-04-05",
          description: "Limit test",
          postings: [
            { accountId: "acct-expense-utilities", amount: createMoney("USD", 1) },
            { accountId: "acct-checking", amount: createMoney("USD", -1), cleared: true },
          ],
        },
        bookId: fixture.book.id,
      });
    }

    const response = await service.getAuditEvents({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      limit: 2,
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(200);
    if ("auditEvents" in response.body) {
      expect(response.body.auditEvents.length).toBeLessThanOrEqual(2);
    }

    await fixture.cleanup();
  });

  it("rejects audit event reads for actors outside the workspace", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      logger: createTestLogger([]),
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.getAuditEvents({
      auth: { actor: "Outside User", kind: "token", role: "member", token: "token-2" },
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(403);

    await fixture.cleanup();
  });

  it("lists accounts without archived accounts by default", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.getAccounts({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(200);
    const body = response.body as { accounts: unknown[] };
    expect(Array.isArray(body.accounts)).toBe(true);
    expect(body.accounts.length).toBe(fixture.book.accounts.length);

    await fixture.cleanup();
  });

  it("creates a new account via postAccount", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.postAccount({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      account: { id: "acct-new", code: "9999", name: "Test Account", type: "asset" },
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(200);
    expectBookBody(response.body);

    await fixture.cleanup();
  });

  it("archives an account with no transactions via archiveAccount", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    // First add an account with no transactions
    await service.postAccount({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      account: { id: "acct-archive-me", code: "8888", name: "To Archive", type: "asset" },
      bookId: fixture.book.id,
    });

    const response = await service.archiveAccount({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      accountId: "acct-archive-me",
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(200);

    await fixture.cleanup();
  });

  it("returns 409 when archiving an account with transactions", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const accountWithTransactions = fixture.book.accounts.find((a) =>
      fixture.book.transactions.some(
        (t) => !t.deletion && t.postings.some((p) => p.accountId === a.id),
      ),
    );

    if (!accountWithTransactions) {
      await fixture.cleanup();
      return;
    }

    const response = await service.archiveAccount({
      auth: { actor: "local-admin", kind: "local", role: "local-admin" },
      accountId: accountWithTransactions.id,
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(409);

    await fixture.cleanup();
  });

  it("rejects getAccounts with insufficient access", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });

    const response = await service.getAccounts({
      auth: { actor: "stranger", kind: "token", role: "member", token: "wrong-token" },
      bookId: fixture.book.id,
    });

    expect(response.status).toBe(403);

    await fixture.cleanup();
  });
});
