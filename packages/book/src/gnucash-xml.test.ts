import { describe, expect, it } from "vitest";
import { createDemoBook } from "./factory";
import { buildGnuCashXmlExport, parseGnuCashXml } from "./gnucash-xml";

describe("gnucash xml adapter", () => {
  it("exports and parses a book snapshot", () => {
    const book = createDemoBook();
    const exported = buildGnuCashXmlExport({ book });
    const parsed = parseGnuCashXml(exported.contents);

    expect(exported.fileName).toBe(`${book.id}.gnucash.xml`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.document).toBeDefined();
    expect(parsed.document?.id).toBe(book.id);
    expect(parsed.document?.transactions).toHaveLength(book.transactions.length);
    expect(parsed.document?.scheduledTransactions).toHaveLength(book.scheduledTransactions.length);
    expect(parsed.document?.householdMemberRoles).toEqual(book.householdMemberRoles);
  });

  it("round-trips optional attributes and nested lists", () => {
    const book = createDemoBook();
    book.householdMembers = [];
    book.accounts = [
      {
        code: "1000",
        id: "acct-checking",
        isEnvelopeFundingSource: true,
        name: "Checking & Bills",
        taxCategory: "cash",
        type: "asset",
      },
    ];
    book.transactions = [
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
    book.scheduledTransactions = [
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
    book.baselineBudgetLines = [
      {
        accountId: "acct-checking",
        budgetPeriod: "monthly",
        notes: "Core spending",
        period: "2026-04",
        plannedAmount: { commodityCode: "USD", quantity: 1500 },
      },
    ];
    book.envelopes = [
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
    book.envelopeAllocations = [
      {
        amount: { commodityCode: "USD", quantity: 100 },
        envelopeId: "env-1",
        id: "alloc-1",
        note: "Initial funding",
        occurredOn: "2026-04-01",
        type: "fund",
      },
    ];
    book.importBatches = [
      {
        fingerprint: "fp-batch",
        id: "batch-1",
        importedAt: "2026-04-02T00:00:00.000Z",
        provider: "qfx",
        sourceLabel: "Bank download",
        transactionIds: ["txn-1"],
      },
    ];
    book.reconciliationSessions = [
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
    book.closePeriods = [
      {
        closedAt: "2026-05-01T00:00:00.000Z",
        closedBy: "robert",
        from: "2026-04-01",
        id: "close-2026-04",
        notes: "April close",
        to: "2026-04-30",
      },
    ];
    book.auditEvents = [
      {
        actor: "robert",
        entityIds: ["txn-1"],
        eventType: "transaction.created",
        id: "audit-1",
        occurredAt: "2026-04-01T00:00:00.000Z",
        summary: { amount: 2500, source: "import" },
        bookId: book.id,
      },
    ];

    const exported = buildGnuCashXmlExport({ book });
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
    expect(parsed.document?.closePeriods).toEqual(book.closePeriods);
    expect(parsed.document?.auditEvents[0]?.summary).toEqual({ amount: 2500, source: "import" });
  });

  it("uses fallback values for optional attributes when parsing", () => {
    // Parse XML that omits optional attributes to exercise parser fallback branches.
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<gnc-v2 xmlns:ws="https://tally.dev/ns/workspace">
  <ws:workspace schemaVersion="1" id="ws-1" name="Test" baseCommodityCode="USD">
    <ws:householdMembers></ws:householdMembers>
    <ws:householdMemberRoles />
    <ws:commodities></ws:commodities>
    <ws:accounts>
      <ws:account id="acct-1" code="1000" name="Checking" type="asset" />
    </ws:accounts>
    <ws:transactions>
      <ws:transaction id="txn-1" occurredOn="2026-04-01" description="No source">
        <ws:postings>
          <ws:posting accountId="acct-1" commodityCode="USD" quantity="100" />
        </ws:postings>
      </ws:transaction>
    </ws:transactions>
    <ws:scheduledTransactions>
      <ws:scheduledTransaction id="sched-1" name="Rent" nextDueOn="2026-05-01" autoPost="false">
        <ws:templateTransaction description="Rent">
          <ws:postings>
            <ws:posting accountId="acct-1" commodityCode="USD" quantity="-1500" />
          </ws:postings>
        </ws:templateTransaction>
      </ws:scheduledTransaction>
    </ws:scheduledTransactions>
    <ws:baselineBudgetLines>
      <ws:baselineBudgetLine accountId="acct-1" period="2026-04" commodityCode="USD" quantity="1000" />
    </ws:baselineBudgetLines>
    <ws:envelopes>
      <ws:envelope id="env-1" name="Groceries" expenseAccountId="acct-1" fundingAccountId="acct-1" availableCommodityCode="USD" availableQuantity="0" rolloverEnabled="false" />
    </ws:envelopes>
    <ws:envelopeAllocations>
      <ws:envelopeAllocation id="alloc-1" envelopeId="env-1" occurredOn="2026-04-01" commodityCode="USD" quantity="100" />
    </ws:envelopeAllocations>
    <ws:importBatches>
      <ws:importBatch id="batch-1" importedAt="2026-04-01T00:00:00Z" sourceLabel="Test" fingerprint="fp1"><ws:transactionIds></ws:transactionIds></ws:importBatch>
    </ws:importBatches>
    <ws:reconciliationSessions></ws:reconciliationSessions>
    <ws:closePeriods>
      <ws:closePeriod id="cp-1" from="2026-03-01" to="2026-03-31" />
    </ws:closePeriods>
    <ws:auditEvents>
      <ws:auditEvent id="audit-1" bookId="ws-1" actor="Alice" occurredAt="2026-04-01T00:00:00Z" entityIds="[]" summary="{}" />
      <ws:auditEvent />
    </ws:auditEvents>
  </ws:workspace>
</gnc-v2>`;

    const parsed = parseGnuCashXml(xml);
    expect(parsed.errors).toEqual([]);

    // transaction without source element → source is undefined
    expect(parsed.document?.transactions[0]?.source).toBeUndefined();

    // scheduledTransaction without frequency → falls back to "monthly"
    expect(parsed.document?.scheduledTransactions[0]?.frequency).toBe("monthly");

    // baselineBudgetLine without budgetPeriod → falls back to "monthly"
    expect(parsed.document?.baselineBudgetLines[0]?.budgetPeriod).toBe("monthly");

    // envelope without targetAmount → undefined
    expect(parsed.document?.envelopes[0]?.targetAmount).toBeUndefined();

    // envelopeAllocation without type → "fund"
    expect(parsed.document?.envelopeAllocations[0]?.type).toBe("fund");

    // importBatch without provider → "csv"
    expect(parsed.document?.importBatches[0]?.provider).toBe("csv");

    // auditEvent without eventType → "transaction.created"
    expect(parsed.document?.auditEvents[0]?.eventType).toBe("transaction.created");
  });

  it("exports source without externalReference and envelope without targetAmount", () => {
    const book = createDemoBook();
    book.transactions = [
      {
        description: "Imported",
        id: "txn-no-ref",
        occurredOn: "2026-04-01",
        postings: [],
        source: {
          fingerprint: "fp-x",
          importedAt: "2026-04-01T00:00:00.000Z",
          provider: "csv",
          // no externalReference
        },
        tags: [],
      },
    ];
    book.envelopes = [
      {
        availableAmount: { commodityCode: "USD", quantity: 0 },
        expenseAccountId: "acct-1",
        fundingAccountId: "acct-1",
        id: "env-no-target",
        name: "Misc",
        rolloverEnabled: false,
        // no targetAmount
      },
    ];
    book.householdMemberRoles = {};
    book.scheduledTransactions = [];
    book.baselineBudgetLines = [];
    book.envelopeAllocations = [];
    book.importBatches = [];
    book.reconciliationSessions = [];
    book.closePeriods = [];
    book.auditEvents = [];

    const exported = buildGnuCashXmlExport({ book });
    const parsed = parseGnuCashXml(exported.contents);

    expect(parsed.errors).toEqual([]);
    expect(parsed.document?.transactions[0]?.source?.externalReference).toBeUndefined();
    expect(parsed.document?.envelopes[0]?.targetAmount).toBeUndefined();
  });

  it("skips household member roles with invalid role values", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<gnc-v2 xmlns:ws="https://tally.dev/ns/workspace">
  <ws:workspace schemaVersion="1" id="ws-1" name="Test" baseCommodityCode="USD">
    <ws:householdMembers></ws:householdMembers>
    <ws:householdMemberRoles>
      <ws:memberRole actor="Alice" role="superadmin" />
      <ws:memberRole actor="" role="admin" />
      <ws:memberRole actor="Bob" role="admin" />
    </ws:householdMemberRoles>
    <ws:commodities></ws:commodities>
    <ws:accounts></ws:accounts>
    <ws:transactions></ws:transactions>
    <ws:scheduledTransactions></ws:scheduledTransactions>
    <ws:baselineBudgetLines></ws:baselineBudgetLines>
    <ws:envelopes></ws:envelopes>
    <ws:envelopeAllocations></ws:envelopeAllocations>
    <ws:importBatches></ws:importBatches>
    <ws:reconciliationSessions></ws:reconciliationSessions>
    <ws:closePeriods></ws:closePeriods>
    <ws:auditEvents></ws:auditEvents>
  </ws:workspace>
</gnc-v2>`;
    const parsed = parseGnuCashXml(xml);
    expect(parsed.errors).toEqual([]);
    // "superadmin" and "" are invalid — only Bob/admin survives
    expect(parsed.document?.householdMemberRoles).toEqual({ Bob: "admin" });
  });

  it("reports invalid book headers", () => {
    expect(parseGnuCashXml("<gnc-v2 />").errors).toEqual([
      "workspace: ws:workspace root element is required.",
    ]);

    expect(
      parseGnuCashXml(
        '<ws:workspace schemaVersion="2" id="" name="" baseCommodityCode=""></ws:workspace>',
      ).errors,
    ).toEqual([
      "book: schemaVersion must be 1.",
      "book: id is required.",
      "book: name is required.",
      "book: baseCommodityCode is required.",
    ]);
  });

  it("parses reconciliation, close period, and audit fallbacks when attributes are omitted", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<gnc-v2 xmlns:ws="https://tally.dev/ns/workspace">
  <ws:workspace schemaVersion="1" id="ws-1" name="Test" baseCommodityCode="USD">
    <ws:householdMembers></ws:householdMembers>
    <ws:householdMemberRoles></ws:householdMemberRoles>
    <ws:commodities></ws:commodities>
    <ws:accounts></ws:accounts>
    <ws:transactions></ws:transactions>
    <ws:scheduledTransactions></ws:scheduledTransactions>
    <ws:baselineBudgetLines></ws:baselineBudgetLines>
    <ws:envelopes></ws:envelopes>
    <ws:envelopeAllocations></ws:envelopeAllocations>
    <ws:importBatches></ws:importBatches>
    <ws:reconciliationSessions>
      <ws:reconciliationSession>
        <ws:clearedTransactionIds><item>txn-1</item></ws:clearedTransactionIds>
      </ws:reconciliationSession>
    </ws:reconciliationSessions>
    <ws:closePeriods>
      <ws:closePeriod notes="optional-note" />
    </ws:closePeriods>
    <ws:auditEvents>
      <ws:auditEvent />
    </ws:auditEvents>
  </ws:workspace>
</gnc-v2>`;

    const parsed = parseGnuCashXml(xml);
    expect(parsed.errors).toEqual([]);
    expect(parsed.document?.reconciliationSessions[0]).toMatchObject({
      accountId: "",
      difference: { commodityCode: "USD", quantity: 0 },
      statementBalance: { commodityCode: "USD", quantity: 0 },
      statementDate: "",
    });
    expect(parsed.document?.closePeriods[0]).toMatchObject({
      closedAt: "",
      closedBy: "",
      from: "",
      id: "",
      notes: "optional-note",
      to: "",
    });
    expect(parsed.document?.auditEvents[0]).toMatchObject({
      actor: "",
      bookId: "ws-1",
      entityIds: [],
      eventType: "transaction.created",
      id: "",
      occurredAt: "",
      summary: {},
    });
  });
});
