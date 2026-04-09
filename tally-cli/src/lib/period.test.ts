import { describe, expect, it } from "vitest";
import { parseHumanDate, resolveDateRange, resolvePeriodExpression } from "./period";

// Fixed reference date: 2026-04-09 (Thursday)
const NOW = new Date(2026, 3, 9, 12, 0, 0, 0); // month is 0-indexed

describe("resolvePeriodExpression", () => {
  it("this-month: from first of month to today", () => {
    expect(resolvePeriodExpression("this-month", NOW)).toEqual({
      from: "2026-04-01",
      to: "2026-04-09",
    });
  });

  it("last-month: full previous calendar month", () => {
    expect(resolvePeriodExpression("last-month", NOW)).toEqual({
      from: "2026-03-01",
      to: "2026-03-31",
    });
  });

  it("this-quarter: from Q2 start to today (April is Q2)", () => {
    expect(resolvePeriodExpression("this-quarter", NOW)).toEqual({
      from: "2026-04-01",
      to: "2026-04-09",
    });
  });

  it("last-quarter: full Q1 of current year", () => {
    expect(resolvePeriodExpression("last-quarter", NOW)).toEqual({
      from: "2026-01-01",
      to: "2026-03-31",
    });
  });

  it("ytd: Jan 1 of current year to today", () => {
    expect(resolvePeriodExpression("ytd", NOW)).toEqual({
      from: "2026-01-01",
      to: "2026-04-09",
    });
  });

  it("last-year: full previous calendar year", () => {
    expect(resolvePeriodExpression("last-year", NOW)).toEqual({
      from: "2025-01-01",
      to: "2025-12-31",
    });
  });

  it("Q1: Jan 1 to Mar 31 of current year", () => {
    expect(resolvePeriodExpression("Q1", NOW)).toEqual({
      from: "2026-01-01",
      to: "2026-03-31",
    });
  });

  it("Q4: Oct 1 to Dec 31 of current year", () => {
    expect(resolvePeriodExpression("Q4", NOW)).toEqual({
      from: "2026-10-01",
      to: "2026-12-31",
    });
  });

  it("YYYY: full calendar year", () => {
    expect(resolvePeriodExpression("2025", NOW)).toEqual({
      from: "2025-01-01",
      to: "2025-12-31",
    });
  });

  it("YYYY-MM: full calendar month", () => {
    expect(resolvePeriodExpression("2026-03", NOW)).toEqual({
      from: "2026-03-01",
      to: "2026-03-31",
    });
  });

  it("YYYY-MM for February of a leap year", () => {
    expect(resolvePeriodExpression("2024-02", NOW)).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
  });

  it("throws on unsupported period string", () => {
    expect(() => resolvePeriodExpression("next-month", NOW)).toThrow();
  });

  it("throws on invalid month in YYYY-MM", () => {
    expect(() => resolvePeriodExpression("2026-13", NOW)).toThrow();
  });
});

describe("parseHumanDate", () => {
  it("passes through ISO date unchanged", () => {
    expect(parseHumanDate("2026-01-15", NOW)).toBe("2026-01-15");
  });

  it("today → current date", () => {
    expect(parseHumanDate("today", NOW)).toBe("2026-04-09");
  });

  it("yesterday → one day before today", () => {
    expect(parseHumanDate("yesterday", NOW)).toBe("2026-04-08");
  });

  it("3 days ago", () => {
    expect(parseHumanDate("3 days ago", NOW)).toBe("2026-04-06");
  });

  it("last monday (NOW is Thursday → prev Monday)", () => {
    expect(parseHumanDate("last monday", NOW)).toBe("2026-04-06");
  });

  it("throws on unparseable input", () => {
    expect(() => parseHumanDate("not a date", NOW)).toThrow();
  });
});

describe("resolveDateRange", () => {
  it("returns undefined when no period, begin, or end", () => {
    expect(resolveDateRange({}, NOW)).toBeUndefined();
  });

  it("uses explicit -b/-e flags", () => {
    expect(
      resolveDateRange({ begin: "2026-01-01", end: "2026-03-31" }, NOW),
    ).toEqual({ from: "2026-01-01", to: "2026-03-31" });
  });

  it("uses period expression", () => {
    expect(resolveDateRange({ period: "last-month" }, NOW)).toEqual({
      from: "2026-03-01",
      to: "2026-03-31",
    });
  });

  it("-b flag overrides period begin", () => {
    const result = resolveDateRange({ period: "last-month", begin: "2026-03-15" }, NOW);
    expect(result?.from).toBe("2026-03-15");
    expect(result?.to).toBe("2026-03-31");
  });

  it("throws when begin > end", () => {
    expect(() =>
      resolveDateRange({ begin: "2026-04-01", end: "2026-03-01" }, NOW),
    ).toThrow();
  });

  it("throws when only begin provided", () => {
    expect(() => resolveDateRange({ begin: "2026-01-01" }, NOW)).toThrow();
  });
});
