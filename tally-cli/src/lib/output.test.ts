import { describe, expect, it } from "vitest";
import { formatMoney, resolveOutputFormat } from "./output";

describe("formatMoney", () => {
  it("formats with 2 decimal places and thousands separator", () => {
    expect(formatMoney(1234.56)).toBe("1,234.56");
  });

  it("formats zero as 0.00", () => {
    expect(formatMoney(0)).toBe("0.00");
  });

  it("formats negative amounts", () => {
    expect(formatMoney(-1234.56)).toBe("-1,234.56");
  });

  it("always shows 2 decimal places for whole numbers", () => {
    expect(formatMoney(100)).toBe("100.00");
  });

  it("rounds to 2 decimal places", () => {
    expect(formatMoney(1.005)).toBe("1.01");
  });

  it("handles float arithmetic hazard (0.1 + 0.2)", () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JS — must display as "0.30"
    const result = formatMoney(0.1 + 0.2);
    expect(result).toBe("0.30");
  });

  it("formats large amounts with commas", () => {
    expect(formatMoney(1000000)).toBe("1,000,000.00");
  });
});

describe("resolveOutputFormat", () => {
  it("returns table when TTY and no format requested", () => {
    expect(resolveOutputFormat(undefined, true)).toBe("table");
  });

  it("returns json when not TTY and no format requested", () => {
    expect(resolveOutputFormat(undefined, false)).toBe("json");
  });

  it("returns explicit format regardless of TTY", () => {
    expect(resolveOutputFormat("json", true)).toBe("json");
    expect(resolveOutputFormat("csv", true)).toBe("csv");
    expect(resolveOutputFormat("table", false)).toBe("table");
  });
});
