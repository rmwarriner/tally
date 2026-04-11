import { describe, expect, it } from "vitest";
import {
  createEntityId,
  createTransactionId,
  formatAccountOptionLabel,
  formatAmount,
  formatCurrency,
  formatPeriodLabel,
  formatSignedCurrency,
  formatTransactionStatus,
  parseCsvRows,
  parsePeriodExpression,
} from "./app-format";

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

describe("formatCurrency", () => {
  it("formats positive, zero, and negative values as USD", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
    expect(formatCurrency(0)).toBe("$0.00");
    expect(formatCurrency(-50)).toBe("-$50.00");
  });
});

describe("formatSignedCurrency", () => {
  it("keeps positive and zero unsigned and prepends minus for negatives", () => {
    expect(formatSignedCurrency(50)).toBe("$50.00");
    expect(formatSignedCurrency(-50)).toBe("-$50.00");
    expect(formatSignedCurrency(0)).toBe("$0.00");
  });
});

describe("formatTransactionStatus", () => {
  it("maps each status to its label", () => {
    expect(formatTransactionStatus("cleared")).toBe("Cleared");
    expect(formatTransactionStatus("reconciled")).toBe("Reconciled");
    expect(formatTransactionStatus("open")).toBe("Open");
  });
});

describe("formatAccountOptionLabel", () => {
  it("includes code when present", () => {
    expect(formatAccountOptionLabel({ name: "Checking", code: "1000" } as never)).toBe(
      "Checking (1000)",
    );
  });

  it("returns just name when code is empty or missing", () => {
    expect(formatAccountOptionLabel({ name: "Savings", code: "" } as never)).toBe("Savings");
    expect(formatAccountOptionLabel({ name: "Cash" } as never)).toBe("Cash");
  });
});

describe("parseCsvRows", () => {
  it("parses a single valid csv row", () => {
    expect(parseCsvRows("2026-04-01,Coffee,-4.25,acc-expense,acc-cash")).toEqual([
      {
        occurredOn: "2026-04-01",
        description: "Coffee",
        amount: -4.25,
        counterpartAccountId: "acc-expense",
        cashAccountId: "acc-cash",
      },
    ]);
  });

  it("parses multiple rows", () => {
    expect(
      parseCsvRows(
        [
          "2026-04-01,Coffee,-4.25,acc-expense,acc-cash",
          "2026-04-02,Paycheck,1250,acc-income,acc-checking",
        ].join("\n"),
      ),
    ).toEqual([
      {
        occurredOn: "2026-04-01",
        description: "Coffee",
        amount: -4.25,
        counterpartAccountId: "acc-expense",
        cashAccountId: "acc-cash",
      },
      {
        occurredOn: "2026-04-02",
        description: "Paycheck",
        amount: 1250,
        counterpartAccountId: "acc-income",
        cashAccountId: "acc-checking",
      },
    ]);
  });

  it("trims whitespace around rows and values", () => {
    expect(parseCsvRows("  2026-04-03, Lunch , -12.5 , acc-food , acc-checking  ")).toEqual([
      {
        occurredOn: "2026-04-03",
        description: "Lunch",
        amount: -12.5,
        counterpartAccountId: "acc-food",
        cashAccountId: "acc-checking",
      },
    ]);
  });
});

describe("id helpers", () => {
  it("createTransactionId uses txn-web- prefix", () => {
    expect(createTransactionId()).toMatch(/^txn-web-/);
  });

  it("createEntityId uses provided prefix", () => {
    expect(createEntityId("acct")).toMatch(/^acct-/);
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
