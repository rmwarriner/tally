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
});
