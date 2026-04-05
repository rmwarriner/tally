import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildGnuCashXmlExport, createDemoWorkspace } from "@gnucash-ng/workspace";
import { saveWorkspaceToFile } from "@gnucash-ng/workspace/src/node";
import {
  createInMemoryRateLimiter,
  createFileSystemWorkspaceRepository,
  createHttpHandler,
  createWorkspaceService,
} from "./index";

describe("api http transport", () => {
  async function createFixture() {
    const directory = await mkdtemp(join(tmpdir(), "gnucash-ng-http-"));
    const workspace = createDemoWorkspace();
    const workspacePath = join(directory, `${workspace.id}.json`);

    await saveWorkspaceToFile(workspacePath, workspace);

    return {
      cleanup: async () => rm(directory, { recursive: true, force: true }),
      directory,
      workspace,
    };
  }

  it("serves workspace reads over HTTP", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.workspace.id).toBe(fixture.workspace.id);
    expect(response.headers.get("x-request-id")).toBeTruthy();

    await fixture.cleanup();
  });

  it("serves unauthenticated health checks over HTTP", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({
      authIdentities: [{ actor: "Primary", role: "member", token: "top-secret" }],
      service,
    });

    const live = await handler(new Request("http://localhost/health/live"));
    const ready = await handler(new Request("http://localhost/health/ready"));

    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({
      service: "api",
      status: "ok",
    });

    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({
      service: "api",
      status: "ready",
    });

    await fixture.cleanup();
  });

  it("serves request metrics over HTTP", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({
      authIdentities: [{ actor: "Primary", role: "member", token: "top-secret" }],
      service,
    });

    await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}`, {
        headers: {
          authorization: "Bearer top-secret",
        },
      }),
    );

    await handler(new Request("http://localhost/api/unknown"));

    const metricsResponse = await handler(new Request("http://localhost/metrics"));
    const body = await metricsResponse.text();

    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.headers.get("content-type")).toContain("text/plain");
    expect(metricsResponse.headers.get("x-request-id")).toBeTruthy();
    expect(body).toContain("# HELP gnucash_ng_http_requests_total");
    expect(body).toContain(
      'gnucash_ng_http_requests_total{method="GET",route="/api/workspaces/:workspaceId",status="200"} 1',
    );
    expect(body).toContain(
      'gnucash_ng_http_requests_total{method="GET",route="/api/unknown",status="401"} 1',
    );
    expect(body).toContain(
      'gnucash_ng_http_request_failures_total{method="GET",route="/api/unknown",status="401"} 1',
    );
    expect(body).toContain(
      'gnucash_ng_http_request_duration_ms_count{method="GET",route="/api/workspaces/:workspaceId"} 1',
    );

    await fixture.cleanup();
  });

  it("serves dashboard projections over HTTP", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const response = await handler(
      new Request(
        `http://localhost/api/workspaces/${fixture.workspace.id}/dashboard?from=2026-04-01&to=2026-04-30`,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.dashboard.netWorth.quantity).toBeCloseTo(3051.58);

    await fixture.cleanup();
  });

  it("serves reports and close summaries over HTTP", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const reportResponse = await handler(
      new Request(
        `http://localhost/api/workspaces/${fixture.workspace.id}/reports/income-statement?from=2026-04-01&to=2026-04-30`,
      ),
    );
    const reportBody = await reportResponse.json();

    expect(reportResponse.status).toBe(200);
    expect(reportBody.report.kind).toBe("income-statement");
    expect(reportBody.report.netIncome.quantity).toBeCloseTo(3051.58);

    const closeResponse = await handler(
      new Request(
        `http://localhost/api/workspaces/${fixture.workspace.id}/close-summary?from=2026-04-01&to=2026-04-30`,
      ),
    );
    const closeBody = await closeResponse.json();

    expect(closeResponse.status).toBe(200);
    expect(closeBody.closeSummary.readyToClose).toBe(false);
    expect(closeBody.closeSummary.checks.some((check: { id: string }) => check.id === "reconciliation")).toBe(
      true,
    );

    await fixture.cleanup();
  });

  it("imports qif transactions over HTTP", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}/imports/qif`, {
        body: JSON.stringify({
          payload: {
            batchId: "http-qif-1",
            cashAccountId: "acct-checking",
            defaultCounterpartAccountId: "acct-expense-groceries",
            importedAt: "2026-04-05T00:00:00Z",
            qif: `!Type:Bank
D04/03/2026
T-45.12
PCity Utilities
MElectric bill
Lacct-expense-utilities
^
`,
            sourceLabel: "checking.qif",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.workspace.transactions.some((item: { id: string }) => item.id === "http-qif-1:1")).toBe(
      true,
    );
    expect(body.workspace.auditEvents.at(-1).eventType).toBe("import.qif.recorded");

    await fixture.cleanup();
  });

  it("imports ofx transactions over HTTP", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}/imports/ofx`, {
        body: JSON.stringify({
          payload: {
            batchId: "http-ofx-1",
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
<FITID>fit-http-1
<NAME>City Utilities
<MEMO>Electric bill
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`,
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.workspace.transactions.some((item: { id: string }) => item.id === "http-ofx-1:1")).toBe(true);
    expect(body.workspace.auditEvents.at(-1).eventType).toBe("import.ofx.recorded");

    await fixture.cleanup();
  });

  it("exports qif transactions over HTTP", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const response = await handler(
      new Request(
        `http://localhost/api/workspaces/${fixture.workspace.id}/exports/qif?accountId=acct-checking&from=2026-04-01&to=2026-04-30`,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.export.fileName).toBe("workspace-household-demo-acct-checking-2026-04-01-2026-04-30.qif");
    expect(body.export.transactionCount).toBeGreaterThan(0);
    expect(body.export.contents).toContain("!Type:Bank");

    await fixture.cleanup();
  });

  it("accepts transaction posts over HTTP", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}/transactions`, {
        body: JSON.stringify({
          actor: "Primary",
          transaction: {
            id: "txn-http-1",
            occurredOn: "2026-04-03",
            description: "HTTP transaction",
            postings: [
              {
                accountId: "acct-expense-utilities",
                amount: { commodityCode: "USD", quantity: 45.12 },
              },
              {
                accountId: "acct-checking",
                amount: { commodityCode: "USD", quantity: -45.12 },
                cleared: true,
              },
            ],
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.workspace.transactions.some((item: { id: string }) => item.id === "txn-http-1")).toBe(
      true,
    );
    expect(body.workspace.auditEvents.at(-1).actor).toBe("local-admin");

    await fixture.cleanup();
  });

  it("accepts transaction updates over HTTP", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}/transactions/txn-grocery-1`, {
        body: JSON.stringify({
          actor: "Primary",
          transaction: {
            id: "txn-grocery-1",
            occurredOn: "2026-04-02",
            description: "HTTP-updated groceries",
            postings: [
              {
                accountId: "acct-expense-groceries",
                amount: { commodityCode: "USD", quantity: 151.5 },
              },
              {
                accountId: "acct-checking",
                amount: { commodityCode: "USD", quantity: -151.5 },
                cleared: true,
              },
            ],
          },
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(
      body.workspace.transactions.find((item: { id: string }) => item.id === "txn-grocery-1").description,
    ).toBe("HTTP-updated groceries");
    expect(body.workspace.auditEvents.at(-1).eventType).toBe("transaction.updated");

    await fixture.cleanup();
  });

  it("accepts budget line and envelope writes over HTTP", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const budgetResponse = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}/budget-lines`, {
        body: JSON.stringify({
          line: {
            accountId: "acct-expense-groceries",
            budgetPeriod: "monthly",
            period: "2026-05",
            plannedAmount: { commodityCode: "USD", quantity: 700 },
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const envelopeResponse = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}/envelopes`, {
        body: JSON.stringify({
          envelope: {
            availableAmount: { commodityCode: "USD", quantity: 150 },
            expenseAccountId: "acct-expense-housing",
            fundingAccountId: "acct-checking",
            id: "env-housing",
            name: "Housing Buffer",
            rolloverEnabled: true,
            targetAmount: { commodityCode: "USD", quantity: 150 },
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(budgetResponse.status).toBe(200);
    expect(envelopeResponse.status).toBe(200);

    await fixture.cleanup();
  });

  it("accepts envelope allocation and schedule writes over HTTP", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const allocationResponse = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}/envelope-allocations`, {
        body: JSON.stringify({
          allocation: {
            amount: { commodityCode: "USD", quantity: 50 },
            envelopeId: "env-groceries",
            id: "alloc-http-1",
            occurredOn: "2026-04-15",
            type: "fund",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const scheduleResponse = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}/schedules`, {
        body: JSON.stringify({
          schedule: {
            autoPost: false,
            frequency: "monthly",
            id: "sched-utilities",
            name: "Monthly Utilities",
            nextDueOn: "2026-05-15",
            templateTransaction: {
              description: "Monthly utilities",
              postings: [
                {
                  accountId: "acct-expense-utilities",
                  amount: { commodityCode: "USD", quantity: 120 },
                },
                {
                  accountId: "acct-checking",
                  amount: { commodityCode: "USD", quantity: -120 },
                },
              ],
            },
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(allocationResponse.status).toBe(200);
    expect(scheduleResponse.status).toBe(200);

    await fixture.cleanup();
  });

  it("executes due schedules over HTTP", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}/schedules/sched-rent/execute`, {
        body: JSON.stringify({
          payload: {
            occurredOn: "2026-05-01",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.workspace.transactions.some((item: { id: string }) => item.id === "sched-rent:2026-05-01")).toBe(
      true,
    );
    expect(body.workspace.auditEvents.some((event: { eventType: string }) => event.eventType === "schedule.executed")).toBe(
      true,
    );

    await fixture.cleanup();
  });

  it("applies schedule exceptions over HTTP", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}/schedules/sched-rent/exceptions`, {
        body: JSON.stringify({
          payload: {
            action: "defer",
            nextDueOn: "2026-05-05",
            note: "Grace period",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.workspace.scheduledTransactions.find((item: { id: string }) => item.id === "sched-rent")?.nextDueOn).toBe(
      "2026-05-05",
    );
    expect(
      body.workspace.auditEvents.some((event: { eventType: string }) => event.eventType === "schedule.exception.applied"),
    ).toBe(true);

    await fixture.cleanup();
  });

  it("returns 400 for invalid json bodies", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}/transactions`, {
        body: "{",
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errors).toContain("Request body must be valid JSON.");
    expect(body.error.code).toBe("request.invalid");

    await fixture.cleanup();
  });

  it("returns 404 for unknown routes", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const response = await handler(new Request("http://localhost/api/unknown"));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("request.not_found");

    await fixture.cleanup();
  });

  it("returns 401 when auth is required and no token is provided", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({
      authIdentities: [{ actor: "Primary", role: "member", token: "top-secret" }],
      service,
    });

    const response = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}`),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.errors).toContain("Authentication is required.");
    expect(body.error.code).toBe("auth.required");

    await fixture.cleanup();
  });

  it("allows authenticated household members and ignores caller-supplied actor spoofing", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({
      authIdentities: [{ actor: "Primary", role: "member", token: "top-secret" }],
      service,
    });

    const response = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}/transactions`, {
        body: JSON.stringify({
          actor: "Spoofed",
          transaction: {
            id: "txn-auth-1",
            occurredOn: "2026-04-03",
            description: "Authorized transaction",
            postings: [
              {
                accountId: "acct-expense-utilities",
                amount: { commodityCode: "USD", quantity: 45.12 },
              },
              {
                accountId: "acct-checking",
                amount: { commodityCode: "USD", quantity: -45.12 },
                cleared: true,
              },
            ],
          },
        }),
        headers: {
          authorization: "Bearer top-secret",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.workspace.auditEvents.at(-1).actor).toBe("Primary");

    await fixture.cleanup();
  });

  it("returns 403 for authenticated non-members", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({
      authIdentities: [{ actor: "Intruder", role: "member", token: "bad-token" }],
      service,
    });

    const response = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}`, {
        headers: {
          authorization: "Bearer bad-token",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.errors[0]).toContain("not authorized");
    expect(body.error.code).toBe("auth.forbidden");

    await fixture.cleanup();
  });

  it("returns 415 for non-json post bodies", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}/transactions`, {
        body: "actor=Primary",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(415);
    expect(body.errors).toContain("POST requests must use application/json.");
    expect(body.error.code).toBe("request.unsupported_media_type");

    await fixture.cleanup();
  });

  it("returns 400 for malformed transaction payloads", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}/transactions`, {
        body: JSON.stringify({
          transaction: {
            id: "txn-bad-schema",
            occurredOn: "04/03/2026",
            description: "",
            postings: [
              {
                accountId: "acct-expense-utilities",
                amount: { commodityCode: "USD", quantity: "bad" },
              },
            ],
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errors).toContain("transaction.description is required.");
    expect(body.error.code).toBe("validation.failed");
    expect(body.errors).toContain("transaction.occurredOn must use YYYY-MM-DD format.");
    expect(body.errors).toContain("transaction.postings must contain at least two postings.");

    await fixture.cleanup();
  });

  it("returns 400 for malformed reconciliation payloads", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}/reconciliations`, {
        body: JSON.stringify({
          payload: {
            accountId: "",
            clearedTransactionIds: "txn-paycheck-1",
            statementBalance: "bad",
            statementDate: "2026/04/02",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errors).toContain("payload.accountId is required.");
    expect(body.error.code).toBe("validation.failed");
    expect(body.errors).toContain("payload.clearedTransactionIds must be an array.");
    expect(body.errors).toContain("payload.statementBalance must be a finite number.");
    expect(body.errors).toContain("payload.statementDate must use YYYY-MM-DD format.");

    await fixture.cleanup();
  });

  it("returns 400 for malformed csv import payloads", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}/imports/csv`, {
        body: JSON.stringify({
          payload: {
            batchId: "",
            importedAt: "not-a-timestamp",
            rows: [
              {
                amount: "bad",
                cashAccountId: "",
                counterpartAccountId: "acct-expense-transport",
                description: "",
                occurredOn: "2026/04/04",
              },
            ],
            sourceLabel: "",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errors).toContain("payload.batchId is required.");
    expect(body.error.code).toBe("validation.failed");
    expect(body.errors).toContain("payload.sourceLabel is required.");
    expect(body.errors).toContain("payload.importedAt must be a valid ISO timestamp.");
    expect(body.errors).toContain("payload.rows[0].occurredOn must use YYYY-MM-DD format.");
    expect(body.errors).toContain("payload.rows[0].description is required.");
    expect(body.errors).toContain("payload.rows[0].amount must be a finite number.");
    expect(body.errors).toContain("payload.rows[0].cashAccountId is required.");

    await fixture.cleanup();
  });

  it("returns 400 for malformed richer write payloads", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const budgetResponse = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}/budget-lines`, {
        body: JSON.stringify({
          line: {
            accountId: "",
            budgetPeriod: "bad",
            period: "",
            plannedAmount: { commodityCode: "", quantity: "bad" },
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const envelopeResponse = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}/envelopes`, {
        body: JSON.stringify({
          envelope: {
            id: "",
            name: "",
            expenseAccountId: "",
            fundingAccountId: "",
            availableAmount: { commodityCode: "", quantity: "bad" },
            rolloverEnabled: "yes",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const budgetBody = await budgetResponse.json();
    const envelopeBody = await envelopeResponse.json();

    expect(budgetResponse.status).toBe(400);
    expect(budgetBody.error.code).toBe("validation.failed");
    expect(budgetBody.errors).toContain("line.accountId is required.");
    expect(envelopeResponse.status).toBe(400);
    expect(envelopeBody.errors).toContain("envelope.rolloverEnabled must be a boolean.");

    await fixture.cleanup();
  });

  it("returns 413 for oversized request bodies", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ maxBodyBytes: 10, service });

    const response = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}/transactions`, {
        body: JSON.stringify({ actor: "Primary", transaction: { id: "x" } }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.errors).toContain("Request body exceeds the configured size limit.");
    expect(body.error.code).toBe("request.too_large");

    await fixture.cleanup();
  });

  it("adds security headers to responses", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}`),
    );

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("x-request-id")).toBeTruthy();

    await fixture.cleanup();
  });

  it("echoes caller-supplied request ids on responses", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}`, {
        headers: {
          "x-request-id": "req-test-123",
        },
      }),
    );

    expect(response.headers.get("x-request-id")).toBe("req-test-123");

    await fixture.cleanup();
  });

  it("returns 429 when read requests exceed the configured rate limit", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({
      rateLimiter: createInMemoryRateLimiter({ now: () => 1000 }),
      rateLimitPolicy: {
        import: { keyPrefix: "import", limit: 10, windowMs: 60000 },
        mutation: { keyPrefix: "mutation", limit: 10, windowMs: 60000 },
        read: { keyPrefix: "read", limit: 1, windowMs: 60000 },
      },
      service,
    });

    const first = await handler(new Request(`http://localhost/api/workspaces/${fixture.workspace.id}`));
    const second = await handler(new Request(`http://localhost/api/workspaces/${fixture.workspace.id}`));
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(secondBody.errors).toContain("Rate limit exceeded. Retry later.");
    expect(secondBody.error.code).toBe("security.rate_limited");
    expect(second.headers.get("retry-after")).toBe("60");
    expect(second.headers.get("x-ratelimit-limit")).toBe("1");
    expect(second.headers.get("x-ratelimit-remaining")).toBe("0");

    await fixture.cleanup();
  });

  it("returns 429 when import requests exceed the configured import throttle", async () => {
    const fixture = await createFixture();
    const service = createWorkspaceService({
      repository: createFileSystemWorkspaceRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({
      rateLimiter: createInMemoryRateLimiter({ now: () => 1000 }),
      rateLimitPolicy: {
        import: { keyPrefix: "import", limit: 1, windowMs: 60000 },
        mutation: { keyPrefix: "mutation", limit: 10, windowMs: 60000 },
        read: { keyPrefix: "read", limit: 10, windowMs: 60000 },
      },
      service,
    });

    const request = () =>
      new Request(`http://localhost/api/workspaces/${fixture.workspace.id}/imports/csv`, {
        body: JSON.stringify({
          payload: {
            batchId: "import-rate-limit",
            importedAt: "2026-04-03T12:00:00.000Z",
            rows: [
              {
                amount: 25,
                cashAccountId: "acct-checking",
                counterpartAccountId: "acct-expense-groceries",
                description: "Groceries",
                occurredOn: "2026-04-03",
              },
            ],
            sourceLabel: "CSV",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

    const first = await handler(request());
    const second = await handler(request());
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(secondBody.errors).toContain("Rate limit exceeded. Retry later.");
    expect(secondBody.error.code).toBe("security.rate_limited");

    await fixture.cleanup();
  });
});
