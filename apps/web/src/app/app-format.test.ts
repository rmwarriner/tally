import { describe, expect, it } from "vitest";
import { formatAmount, formatPeriodLabel, parsePeriodExpression } from "./app-format";

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

describe("formatAmount", () => {
  const fmt = (n: number) => `$${Math.abs(n).toFixed(2)}`;

  it("both: adds + prefix for positive", () => {
    expect(formatAmount(50, fmt, "both")).toBe("+$50.00");
  });

  it("both: adds - prefix for negative", () => {
    expect(formatAmount(-50, fmt, "both")).toBe("-$50.00");
  });

  it("both: zero has no prefix", () => {
    expect(formatAmount(0, fmt, "both")).toBe("$0.00");
  });

  it("color: no + prefix for positive", () => {
    expect(formatAmount(50, fmt, "color")).toBe("$50.00");
  });

  it("color: - prefix for negative", () => {
    expect(formatAmount(-50, fmt, "color")).toBe("-$50.00");
  });

  it("sign: + prefix for positive", () => {
    expect(formatAmount(50, fmt, "sign")).toBe("+$50.00");
  });

  it("sign: - prefix for negative", () => {
    expect(formatAmount(-50, fmt, "sign")).toBe("-$50.00");
  });

  it("sign: zero has no prefix", () => {
    expect(formatAmount(0, fmt, "sign")).toBe("$0.00");
  });
});
