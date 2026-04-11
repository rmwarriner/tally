import { describe, expect, it } from "vitest";
import { canSaveCoaAccountDraft } from "./coa-account-form";

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
