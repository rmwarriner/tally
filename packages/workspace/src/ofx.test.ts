import { describe, expect, it } from "vitest";
import { createDemoWorkspace } from "./factory";
import { buildOfxExport, parseOfxStatement } from "./ofx";

describe("ofx statement adapter", () => {
  it("parses statement entries", () => {
    const parsed = parseOfxStatement(`OFXHEADER:100

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260403000000
<TRNAMT>-45.12
<FITID>abc-1
<NAME>City Utilities
<MEMO>Electric bill
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`);

    expect(parsed.errors).toEqual([]);
    expect(parsed.entries).toEqual([
      {
        amount: -45.12,
        date: "2026-04-03",
        fitId: "abc-1",
        memo: "Electric bill",
        name: "City Utilities",
        transactionType: "DEBIT",
      },
    ]);
  });

  it("exports account transactions to ofx", () => {
    const workspace = createDemoWorkspace();
    const result = buildOfxExport({
      accountId: "acct-checking",
      format: "ofx",
      from: "2026-04-01",
      to: "2026-04-30",
      workspace,
    });

    expect(result.fileName).toContain(".ofx");
    expect(result.transactionCount).toBeGreaterThan(0);
    expect(result.contents).toContain("<OFX>");
    expect(result.contents).toContain("<STMTTRN>");
    expect(result.contents).toContain("<ACCTID>acct-checking");
  });

  it("reports invalid statement rows and missing transaction blocks", () => {
    const malformed = parseOfxStatement(`OFXHEADER:100

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>bad-date
<TRNAMT>not-a-number
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`);

    expect(malformed.entries).toEqual([]);
    expect(malformed.errors).toEqual([
      "entry 1: DTPOSTED must contain YYYYMMDD date text.",
      "entry 1: TRNAMT must be numeric.",
    ]);

    expect(parseOfxStatement("<OFX></OFX>").errors).toEqual([
      "statement: no STMTTRN entries were found.",
    ]);
  });

  it("exports qfx with sanitized fallbacks and escaped content", () => {
    const workspace = createDemoWorkspace();
    workspace.transactions.push({
      description: "  Transfer   to <Savings>  ",
      id: "txn-transfer-1",
      occurredOn: "2026-04-18",
      postings: [
        {
          accountId: "acct-checking",
          amount: { commodityCode: "USD", quantity: -125.5 },
        },
        {
          accountId: "acct-savings",
          amount: { commodityCode: "USD", quantity: 125.5 },
          memo: "  Into   rainy day & reserve ",
        },
      ],
      source: {
        externalReference: "ext <123>",
        fingerprint: "fp-transfer-1",
        importedAt: "2026-04-19T00:00:00.000Z",
        provider: "ofx",
      },
      tags: [],
    });

    const result = buildOfxExport({
      accountId: "acct-savings",
      format: "qfx",
      from: "2026-04-01",
      to: "2026-04-30",
      workspace,
    });

    expect(result.fileName).toContain(".qfx");
    expect(result.contents).toContain("<TRNTYPE>CREDIT");
    expect(result.contents).toContain("<NAME>Transfer to &lt;Savings&gt;");
    expect(result.contents).toContain("<MEMO>Into rainy day &amp; reserve");
    expect(result.contents).toContain("<FITID>ext &lt;123&gt;");
  });

  it("rejects export for an unknown account", () => {
    expect(() =>
      buildOfxExport({
        accountId: "acct-missing",
        format: "ofx",
        from: "2026-04-01",
        to: "2026-04-30",
        workspace: createDemoWorkspace(),
      }),
    ).toThrow("Account acct-missing does not exist.");
  });
});
