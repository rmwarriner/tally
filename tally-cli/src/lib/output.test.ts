import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatMoney,
  printKeyValue,
  printRows,
  resolveOutputFormat,
} from "./output";

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

describe("printRows", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints pretty JSON rows for json format", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    printRows([{ id: "txn-1", cleared: true }], ["id", "cleared"], "json");
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0]?.[0]).toContain("\"id\": \"txn-1\"");
  });

  it("prints csv rows and escapes special characters", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    printRows(
      [
        {
          amount: "1,234.56",
          memo: "He said \"hi\"",
        },
      ],
      ["memo", "amount"],
      "csv",
    );
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = String(logSpy.mock.calls[0]?.[0] ?? "");
    expect(output).toContain("memo,amount");
    expect(output).toContain("\"He said \"\"hi\"\"\",\"1,234.56\"");
  });

  it("prints csv header only when no rows", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    printRows([], ["id", "status"], "csv");
    expect(logSpy).toHaveBeenCalledWith("id,status");
  });

  it("prints table rows for table format", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    printRows(
      [
        {
          enabled: false,
          id: "txn-2",
          note: null,
        },
      ],
      ["id", "enabled", "note"],
      "table",
    );
    const output = String(logSpy.mock.calls[0]?.[0] ?? "");
    expect(output).toContain("txn-2");
    expect(output).toContain("false");
  });

  it("prints no-results message for empty table rows", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    printRows([], ["id"], "table");
    expect(logSpy).toHaveBeenCalledWith("(no results)");
  });
});

describe("printKeyValue", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders key/value rows and normalizes booleans/nulls", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    printKeyValue(
      {
        empty: null,
        featureEnabled: true,
        retries: 3,
      },
      "json",
    );
    const output = String(logSpy.mock.calls[0]?.[0] ?? "");
    expect(output).toContain("\"key\": \"featureEnabled\"");
    expect(output).toContain("\"value\": \"true\"");
    expect(output).toContain("\"key\": \"empty\"");
  });
});
