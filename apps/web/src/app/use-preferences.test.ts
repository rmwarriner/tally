import { describe, expect, it } from "vitest";
import { resolveStoredTheme } from "./use-preferences";

describe("use preferences", () => {
  it("resolves gruvbox as a valid stored theme", () => {
    expect(resolveStoredTheme("gruvbox")).toBe("gruvbox");
  });

  it("falls back to light for unsupported stored themes", () => {
    expect(resolveStoredTheme("unknown-theme")).toBe("light");
  });
});
