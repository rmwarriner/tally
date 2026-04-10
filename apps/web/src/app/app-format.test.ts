import { describe, expect, it } from "vitest";
import { formatPeriodLabel, parsePeriodExpression } from "./app-format";

describe("app format helpers", () => {
  it("formats period labels from iso date", () => {
    expect(formatPeriodLabel("2026-04-01")).toBe("April 2026");
  });

  it("parses month-year expressions", () => {
    expect(parsePeriodExpression("2026-04")).toEqual({
      from: "2026-04-01",
      to: "2026-04-30",
    });
    expect(parsePeriodExpression("April 2026")).toEqual({
      from: "2026-04-01",
      to: "2026-04-30",
    });
    expect(parsePeriodExpression("apr 2026")).toEqual({
      from: "2026-04-01",
      to: "2026-04-30",
    });
  });

  it("parses leap-year months and full-year expressions", () => {
    expect(parsePeriodExpression("2024-02")).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
    expect(parsePeriodExpression("2026")).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });

  it("returns null for invalid expressions", () => {
    expect(parsePeriodExpression("")).toBeNull();
    expect(parsePeriodExpression("2026-13")).toBeNull();
    expect(parsePeriodExpression("foo 2026")).toBeNull();
  });
});
