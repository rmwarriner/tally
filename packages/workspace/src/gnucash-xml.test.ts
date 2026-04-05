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
});
