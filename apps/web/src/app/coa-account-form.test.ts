import { describe, expect, it } from "vitest";
import { canSaveCoaAccountDraft, createCoaAccountDraft } from "./coa-account-form";

describe("coa account form validation", () => {
  it("disables save when code is empty", () => {
    expect(
      canSaveCoaAccountDraft({
        code: "",
        name: "Checking",
        type: "asset",
      }),
    ).toBe(false);
  });

  it("disables save when name is empty", () => {
    expect(
      canSaveCoaAccountDraft({
        code: "1000",
        name: "   ",
        type: "asset",
      }),
    ).toBe(false);
  });

  it("enables save when code and name are present", () => {
    expect(
      canSaveCoaAccountDraft({
        code: "1000",
        name: "Checking",
        type: "asset",
      }),
    ).toBe(true);
  });
});

describe("createCoaAccountDraft", () => {
  it("creates a root account draft with default asset type", () => {
    const draft = createCoaAccountDraft({ parentAccountId: null });
    expect(draft).toEqual({ code: "", name: "", type: "asset", parentAccountId: undefined });
  });

  it("creates a sub-account draft with parent type and id", () => {
    const draft = createCoaAccountDraft({ parentAccountId: "acct-1", parentAccountType: "expense" });
    expect(draft.type).toBe("expense");
    expect(draft.parentAccountId).toBe("acct-1");
  });
});
