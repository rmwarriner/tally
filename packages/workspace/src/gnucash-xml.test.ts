import { describe, expect, it } from "vitest";
import { createDemoWorkspace } from "./factory";
import { buildGnuCashXmlExport, parseGnuCashXml } from "./gnucash-xml";

describe("gnucash xml adapter", () => {
  it("exports and parses a workspace snapshot", () => {
    const workspace = createDemoWorkspace();
    const exported = buildGnuCashXmlExport({ workspace });
    const parsed = parseGnuCashXml(exported.contents);

    expect(exported.fileName).toBe(`${workspace.id}.gnucash.xml`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.document).toBeDefined();
    expect(parsed.document?.id).toBe(workspace.id);
    expect(parsed.document?.transactions).toHaveLength(workspace.transactions.length);
    expect(parsed.document?.scheduledTransactions).toHaveLength(workspace.scheduledTransactions.length);
  });

  it("round-trips optional attributes and nested lists", () => {
    const workspace = createDemoWorkspace();
    workspace.householdMembers = [];
    workspace.accounts = [
      {
        code: "1000",
        id: "acct-checking",
        isEnvelopeFundingSource: true,
        name: "Checking & Bills",
        taxCategory: "cash",
        type: "asset",
      },
    ];
    workspace.transactions = [
      {
        deletion: {
          deletedAt: "2026-04-03T00:00:00.000Z",
          deletedBy: "Primary",
        },
        description: "Paycheck <April>",
        id: "txn-1",
        occurredOn: "2026-04-01",
        payee: "Employer & Co",
        postings: [
          {
            accountId: "acct-checking",
            amount: { commodityCode: "USD", quantity: 2500 },
            cleared: true,
            memo: "Direct deposit",
            reconciledAt: "2026-04-02",
          },
        ],
        scheduleId: "sched-1",
        source: {
          externalReference: "ofx-1",
          fingerprint: "fp-1",
          importedAt: "2026-04-02T00:00:00.000Z",
          provider: "ofx",
        },
        tags: ["income", "salary"],
      },
    ];
    workspace.scheduledTransactions = [
      {
        autoPost: true,
        frequency: "monthly",
        id: "sched-1",
        name: "Rent",
        nextDueOn: "2026-05-01",
        templateTransaction: {
          description: "Rent",
          payee: "Landlord",
          postings: [
            {
              accountId: "acct-checking",
              amount: { commodityCode: "USD", quantity: -1500 },
              cleared: false,
              memo: "Housing",
            },
          ],
          tags: ["housing"],
        },
      },
    ];
    workspace.baselineBudgetLines = [
      {
        accountId: "acct-checking",
        budgetPeriod: "monthly",
        notes: "Core spending",
        period: "2026-04",
        plannedAmount: { commodityCode: "USD", quantity: 1500 },
      },
    ];
    workspace.envelopes = [
      {
        availableAmount: { commodityCode: "USD", quantity: 200 },
        expenseAccountId: "acct-checking",
        fundingAccountId: "acct-checking",
        id: "env-1",
        name: "Groceries",
        rolloverEnabled: true,
        targetAmount: { commodityCode: "USD", quantity: 500 },
      },
    ];
    workspace.envelopeAllocations = [
      {
        amount: { commodityCode: "USD", quantity: 100 },
        envelopeId: "env-1",
        id: "alloc-1",
        note: "Initial funding",
        occurredOn: "2026-04-01",
        type: "fund",
      },
    ];
    workspace.importBatches = [
      {
        fingerprint: "fp-batch",
        id: "batch-1",
        importedAt: "2026-04-02T00:00:00.000Z",
        provider: "qfx",
        sourceLabel: "Bank download",
        transactionIds: ["txn-1"],
      },
    ];
    workspace.reconciliationSessions = [
      {
        accountId: "acct-checking",
        clearedTransactionIds: ["txn-1"],
        completedAt: "2026-04-30T00:00:00.000Z",
        difference: { commodityCode: "USD", quantity: 0 },
        id: "rec-1",
        statementBalance: { commodityCode: "USD", quantity: 2500 },
        statementDate: "2026-04-30",
      },
    ];
    workspace.closePeriods = [
      {
        closedAt: "2026-05-01T00:00:00.000Z",
        closedBy: "robert",
        from: "2026-04-01",
        id: "close-2026-04",
        notes: "April close",
        to: "2026-04-30",
      },
    ];
    workspace.auditEvents = [
      {
        actor: "robert",
        entityIds: ["txn-1"],
        eventType: "transaction.created",
        id: "audit-1",
        occurredAt: "2026-04-01T00:00:00.000Z",
        summary: { amount: 2500, source: "import" },
        workspaceId: workspace.id,
      },
    ];

    const exported = buildGnuCashXmlExport({ workspace });
    const parsed = parseGnuCashXml(exported.contents);

    expect(parsed.errors).toEqual([]);
    expect(parsed.document?.householdMembers).toEqual([]);
    expect(parsed.document?.accounts[0]).toEqual(
      expect.objectContaining({
        isEnvelopeFundingSource: true,
        taxCategory: "cash",
      }),
    );
    expect(parsed.document?.transactions[0]).toEqual(
      expect.objectContaining({
        deletion: {
          deletedAt: "2026-04-03T00:00:00.000Z",
          deletedBy: "Primary",
        },
        payee: "Employer & Co",
        scheduleId: "sched-1",
        source: expect.objectContaining({
          externalReference: "ofx-1",
          provider: "ofx",
        }),
        tags: ["income", "salary"],
      }),
    );
    expect(parsed.document?.envelopes[0]?.targetAmount).toEqual({
      commodityCode: "USD",
      quantity: 500,
    });
    expect(parsed.document?.closePeriods).toEqual(workspace.closePeriods);
    expect(parsed.document?.auditEvents[0]?.summary).toEqual({ amount: 2500, source: "import" });
  });

  it("reports invalid workspace headers", () => {
    expect(parseGnuCashXml("<gnc-v2 />").errors).toEqual([
      "workspace: ws:workspace root element is required.",
    ]);

    expect(
      parseGnuCashXml(
        '<ws:workspace schemaVersion="2" id="" name="" baseCommodityCode=""></ws:workspace>',
      ).errors,
    ).toEqual([
      "workspace: schemaVersion must be 1.",
      "workspace: id is required.",
      "workspace: name is required.",
      "workspace: baseCommodityCode is required.",
    ]);
  });
});
