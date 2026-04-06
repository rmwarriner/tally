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

  it("writes pretty console output when requested", () => {
    const output: string[] = [];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation((value: unknown) => {
      output.push(String(value));
    });

    const sink = createConsoleSink({ format: "pretty" });
    sink({
      fields: { operation: "load", workspaceId: "workspace-1" },
      level: "info",
      message: "workspace loaded",
      service: "test-service",
      timestamp: "2026-04-06T14:00:00.000Z",
    });

    expect(output[0]).toContain("2026-04-06T14:00:00.000Z INFO test-service: workspace loaded");
    expect(output[0]).toContain("operation: load");
    expect(output[0]).toContain("workspaceId: workspace-1");

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
