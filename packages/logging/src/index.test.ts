import { describe, expect, it, vi } from "vitest";
import { createConsoleSink, createLogger, type LogRecord } from "./index";

describe("logging", () => {
  it("emits structured records with inherited context", () => {
    const records: LogRecord[] = [];
    const logger = createLogger({
      service: "test-service",
      minLevel: "debug",
      sink(record) {
        records.push(record);
      },
    }).child({ workspaceId: "workspace-1" });

    logger.info("workspace loaded", { operation: "load" });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      level: "info",
      message: "workspace loaded",
      service: "test-service",
      fields: {
        workspaceId: "workspace-1",
        operation: "load",
      },
    });
  });

  it("redacts sensitive fields", () => {
    const records: LogRecord[] = [];
    const logger = createLogger({
      service: "test-service",
      sink(record) {
        records.push(record);
      },
    });

    logger.info("import credentials", {
      authorization: "Bearer token",
      nested: { token: "secret-token" },
    });

    expect(records[0]?.fields).toEqual({
      authorization: "[REDACTED]",
      nested: { token: "[REDACTED]" },
    });
  });

  it("writes a startup block for the first pretty record", () => {
    const output: string[] = [];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation((value: unknown) => {
      output.push(String(value));
    });

    const sink = createConsoleSink({ format: "pretty" });
    sink({
      fields: { runtimeMode: "development", persistenceBackend: "sqlite", port: 3000 },
      level: "info",
      message: "api runtime configured",
      service: "tally-api",
      timestamp: "2026-04-09T15:30:44.000Z",
    });

    expect(output[0]).toContain("2026-04-09 15:30:44  tally-api");
    expect(output[0]).toContain("api runtime configured");
    expect(output[0]).toContain("runtimeMode");
    expect(output[0]).toContain("development");
    expect(output[0]).toContain("sqlite");
    // separator lines present
    expect(output[0]).toContain("\u2500\u2500\u2500");

    consoleSpy.mockRestore();
  });

  it("writes compact single-line output for subsequent pretty records", () => {
    const output: string[] = [];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation((value: unknown) => {
      output.push(String(value));
    });

    const sink = createConsoleSink({ format: "pretty" });

    // first record (startup) — discarded for this assertion
    sink({
      fields: {},
      level: "info",
      message: "api runtime configured",
      service: "tally-api",
      timestamp: "2026-04-09T15:30:44.000Z",
    });

    // subsequent record
    sink({
      fields: {
        method: "POST",
        path: "/api/books/abc/transactions",
        requestId: "req-1",
        // static fields that should be suppressed
        runtimeMode: "development",
        persistenceBackend: "sqlite",
        port: 3000,
      },
      level: "info",
      message: "request completed",
      service: "tally-api",
      timestamp: "2026-04-09T15:30:45.000Z",
    });

    const line = output[1] ?? "";
    expect(line).toContain("15:30:45");
    expect(line).toContain("INFO ");
    expect(line).toContain("request completed");
    expect(line).toContain("method=POST");
    expect(line).toContain("requestId=req-1");
    // static fields suppressed
    expect(line).not.toContain("runtimeMode");
    expect(line).not.toContain("persistenceBackend");
    expect(line).not.toContain("port=");
    // compact: no newlines
    expect(line).not.toContain("\n");

    consoleSpy.mockRestore();
  });

  it("compact record with no non-static fields omits trailing whitespace", () => {
    const output: string[] = [];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation((value: unknown) => {
      output.push(String(value));
    });

    const sink = createConsoleSink({ format: "pretty" });
    sink({ fields: {}, level: "info", message: "startup", service: "s", timestamp: "2026-04-09T10:00:00.000Z" });
    sink({ fields: { port: 3000, runtimeMode: "dev" }, level: "info", message: "only static fields", service: "s", timestamp: "2026-04-09T10:00:01.000Z" });

    const line = output[1] ?? "";
    expect(line).toBe("10:00:01 INFO   only static fields");

    consoleSpy.mockRestore();
  });

  it("writes json console output by default", () => {
    const output: string[] = [];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation((value: unknown) => {
      output.push(String(value));
    });

    const sink = createConsoleSink();
    sink({
      fields: { operation: "load" },
      level: "info",
      message: "workspace loaded",
      service: "test-service",
      timestamp: "2026-04-06T14:00:00.000Z",
    });

    expect(JSON.parse(output[0] ?? "{}")).toEqual({
      fields: { operation: "load" },
      level: "info",
      message: "workspace loaded",
      service: "test-service",
      timestamp: "2026-04-06T14:00:00.000Z",
    });

    consoleSpy.mockRestore();
  });
});
