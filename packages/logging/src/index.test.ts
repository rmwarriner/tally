import { describe, expect, it } from "vitest";
import { createLogger, type LogRecord } from "./index";

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
});
