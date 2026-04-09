import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger, type LogRecord } from "@tally/logging";
import { createApiRuntime, runApiRuntimeFromCli } from "./runtime";
import type { ApiRuntimeConfig } from "./config";

function createConfig(overrides: Partial<ApiRuntimeConfig> = {}): ApiRuntimeConfig {
  return {
    authIdentities: [],
    authSource: "none",
    authStrategy: "none",
    bodyLimitBytes: 1048576,
    corsAllowedOrigins: [],
    dataDirectory: "/tmp/tally-runtime",
    host: "127.0.0.1",
    persistenceBackend: "sqlite",
    port: 4000,
    postgresUrl: "",
    logFormat: "auto",
    rateLimit: {
      importLimit: 10,
      mutationLimit: 30,
      readLimit: 120,
      windowMs: 60000,
    },
    observability: {
      enabled: false,
      exportTimeoutMs: 10000,
      metricsExportIntervalMs: 60000,
      otlpEndpoint: "",
      otlpEndpointHost: undefined,
      otlpHeaders: {},
      serviceName: "tally-api",
    },
    runtimeMode: "development",
    seedDemoWorkspace: true,
    shutdownTimeoutMs: 10000,
    sqlitePath: "/tmp/tally-runtime-core/workspaces.sqlite",
    ...overrides,
  };
}

describe("api runtime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function createSilentLogger(sink?: (record: LogRecord) => void) {
    return createLogger({
      minLevel: "debug",
      service: "api-runtime-tests",
      sink: sink ?? (() => {}),
    });
  }

  it("seeds demo data before listening in development mode", async () => {
    const events: string[] = [];
    const ensureSeed = vi.fn(async () => {
      events.push("seed");
    });

    const runtime = createApiRuntime({
      config: createConfig(),
      createServer() {
        return {
          close(callback) {
            callback();
          },
          listen(_port, _host, callback) {
            events.push("listen");
            callback();
          },
        };
      },
      ensureSeed,
      logger: createSilentLogger(),
    });

    await runtime.start();

    expect(events).toEqual(["seed", "listen"]);
    expect(ensureSeed).toHaveBeenCalledWith({
      dataDirectory: "/tmp/tally-runtime",
      logger: expect.any(Object),
    });
  });

  it("does not seed demo data when disabled", async () => {
    const ensureSeed = vi.fn(async () => {});

    const runtime = createApiRuntime({
      config: createConfig({
        authIdentities: [{ actor: "api-user", role: "admin", token: "top-secret" }],
        runtimeMode: "production",
        seedDemoWorkspace: false,
      }),
      createServer() {
        return {
          close(callback) {
            callback();
          },
          listen(_port, _host, callback) {
            callback();
          },
        };
      },
      ensureSeed,
      logger: createSilentLogger(),
    });

    await runtime.start();

    expect(ensureSeed).not.toHaveBeenCalled();
  });

  it("initializes and shuts down observability once", async () => {
    const observabilityShutdown = vi.fn(async () => {});
    const createObservability = vi.fn(() => ({
      metrics: {
        recordRequest() {},
        renderPrometheus() {
          return "";
        },
      },
      requestObserver: undefined,
      shutdown: observabilityShutdown,
    }));

    const runtime = createApiRuntime({
      config: createConfig({
        observability: {
          enabled: true,
          exportTimeoutMs: 10000,
          metricsExportIntervalMs: 60000,
          otlpEndpoint: "https://otel.example.com/v1",
          otlpEndpointHost: "otel.example.com",
          otlpHeaders: { authorization: "Bearer hidden" },
          serviceName: "tally-api",
        },
      }),
      createObservability,
      createServer() {
        return {
          close(callback) {
            callback();
          },
          listen(_port, _host, callback) {
            callback();
          },
        };
      },
      ensureSeed: vi.fn(async () => {}),
      logger: createSilentLogger(),
    });

    await runtime.start();
    await runtime.shutdown("SIGTERM");
    await runtime.shutdown("SIGTERM");

    expect(createObservability).toHaveBeenCalledTimes(1);
    expect(observabilityShutdown).toHaveBeenCalledTimes(1);
  });

  it("closes the server during shutdown", async () => {
    const close = vi.fn((callback: (error?: Error | null) => void) => callback());

    const runtime = createApiRuntime({
      config: createConfig(),
      createServer() {
        return {
          close,
          listen(_port, _host, callback) {
            callback();
          },
        };
      },
      ensureSeed: vi.fn(async () => {}),
      logger: createSilentLogger(),
    });

    await runtime.start();
    await runtime.shutdown("SIGTERM");

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("logs sqlite backend configuration when selected", async () => {
    const records: LogRecord[] = [];

    const runtime = createApiRuntime({
      config: createConfig({
        persistenceBackend: "sqlite",
        sqlitePath: "/tmp/tally-runtime/custom.sqlite",
      }),
      createServer() {
        return {
          close(callback) {
            callback();
          },
          listen(_port, _host, callback) {
            callback();
          },
        };
      },
      ensureSeed: vi.fn(async () => {}),
      logger: createSilentLogger((record) => {
        records.push(record);
      }),
    });

    await runtime.start();

    expect(records).toContainEqual(
      expect.objectContaining({
        message: "api runtime configured",
        fields: expect.objectContaining({
          persistenceBackend: "sqlite",
          sqlitePath: "/tmp/tally-runtime/custom.sqlite",
        }),
      }),
    );
  });

  it("logs postgres backend configuration without exposing connection details", async () => {
    const records: LogRecord[] = [];

    const runtime = createApiRuntime({
      config: createConfig({
        persistenceBackend: "postgres",
        postgresUrl: "postgres://ledger:secret@localhost:5432/ledger",
      }),
      createServer() {
        return {
          close(callback) {
            callback();
          },
          listen(_port, _host, callback) {
            callback();
          },
        };
      },
      ensureSeed: vi.fn(async () => {}),
      logger: createSilentLogger((record) => {
        records.push(record);
      }),
    });

    await runtime.start();

    expect(records).toContainEqual(
      expect.objectContaining({
        message: "api runtime configured",
        fields: expect.objectContaining({
          persistenceBackend: "postgres",
          postgresConfigured: true,
        }),
      }),
    );
    expect(JSON.stringify(records)).not.toContain("postgres://ledger:secret");
  });

  it("returns immediately when shutdown is requested before startup", async () => {
    const close = vi.fn((callback: (error?: Error | null) => void) => callback());

    const runtime = createApiRuntime({
      config: createConfig(),
      createServer() {
        return {
          close,
          listen(_port, _host, callback) {
            callback();
          },
        };
      },
      ensureSeed: vi.fn(async () => {}),
      logger: createSilentLogger(),
    });

    await runtime.shutdown("SIGTERM");

    expect(close).not.toHaveBeenCalled();
  });

  it("is idempotent across repeated start and shutdown calls", async () => {
    const ensureSeed = vi.fn(async () => {});
    const close = vi.fn((callback: (error?: Error | null) => void) => callback());
    const listen = vi.fn((_port, _host, callback: () => void) => callback());

    const runtime = createApiRuntime({
      config: createConfig(),
      createServer() {
        return { close, listen };
      },
      ensureSeed,
      logger: createSilentLogger(),
    });

    await runtime.start();
    await runtime.start();
    await runtime.shutdown("SIGTERM");
    await runtime.shutdown("SIGTERM");

    expect(ensureSeed).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("propagates server close failures and shutdown timeouts", async () => {
    const failingRuntime = createApiRuntime({
      config: createConfig(),
      createServer() {
        return {
          close(callback) {
            callback(new Error("close failed"));
          },
          listen(_port, _host, callback) {
            callback();
          },
        };
      },
      ensureSeed: vi.fn(async () => {}),
      logger: createSilentLogger(),
    });

    await failingRuntime.start();
    await expect(failingRuntime.shutdown("SIGTERM")).rejects.toThrow("close failed");

    vi.useFakeTimers();
    const hangingRuntime = createApiRuntime({
      config: createConfig({ shutdownTimeoutMs: 5 }),
      createServer() {
        return {
          close() {},
          listen(_port, _host, callback) {
            callback();
          },
        };
      },
      ensureSeed: vi.fn(async () => {}),
      logger: createSilentLogger(),
    });

    await hangingRuntime.start();
    const shutdownPromise = hangingRuntime.shutdown("SIGTERM");
    const shutdownExpectation = expect(shutdownPromise).rejects.toThrow("API server shutdown timed out.");
    await vi.advanceTimersByTimeAsync(10);
    await shutdownExpectation;
  });

  it("logs a safe startup configuration summary without token material", async () => {
    const records: LogRecord[] = [];

    const runtime = createApiRuntime({
      config: createConfig({
        authIdentities: [
          { actor: "robert", role: "admin", token: "secret-a" },
          { actor: "alex", role: "member", token: "secret-b" },
        ],
        authSource: "file",
        authStrategy: "identities",
        runtimeMode: "production",
        seedDemoWorkspace: false,
      }),
      createServer() {
        return {
          close(callback) {
            callback();
          },
          listen(_port, _host, callback) {
            callback();
          },
        };
      },
      ensureSeed: vi.fn(async () => {}),
      logger: createSilentLogger((record) => {
        records.push(record);
      }),
    });

    await runtime.start();

    expect(records).toContainEqual(
      expect.objectContaining({
        level: "info",
        message: "api runtime configured",
        fields: expect.objectContaining({
          authConfigured: true,
          authIdentityCount: 2,
          authSource: "file",
          authStrategy: "identities",
          persistenceBackend: "sqlite",
          runtimeMode: "production",
        }),
      }),
    );
    expect(JSON.stringify(records)).not.toContain("secret-a");
    expect(JSON.stringify(records)).not.toContain("secret-b");
  });

  it("reports configuration errors from the cli entrypoint", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`exit:${code}`);
    }) as typeof process.exit);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      runApiRuntimeFromCli({
        defaultRuntimeMode: "production",
        env: {},
      }),
    ).rejects.toThrow("exit:1");

    expect(errorSpy).toHaveBeenCalledWith(
      "Invalid API configuration: Production runtime requires explicit auth configuration (token, identities, or trusted-header auth).",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("emits pretty console logs when TALLY_LOG_FORMAT=pretty", async () => {
    const output: string[] = [];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation((value: unknown) => {
      output.push(String(value));
    });

    const runtime = createApiRuntime({
      config: createConfig({ logFormat: "pretty" }),
      createServer() {
        return {
          close(callback) {
            callback();
          },
          listen(_port, _host, callback) {
            callback();
          },
        };
      },
      ensureSeed: vi.fn(async () => {}),
      env: {
        TALLY_LOG_LEVEL: "debug",
      },
    });

    await runtime.start();

    expect(output.some((line) => line.includes("INFO tally-api: api runtime configured"))).toBe(true);
    expect(output.some((line) => line.includes("runtimeMode: development"))).toBe(true);

    consoleSpy.mockRestore();
  });

  it("emits json console logs when TALLY_LOG_FORMAT=json", async () => {
    const output: string[] = [];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation((value: unknown) => {
      output.push(String(value));
    });

    const runtime = createApiRuntime({
      config: createConfig({ logFormat: "json" }),
      createServer() {
        return {
          close(callback) {
            callback();
          },
          listen(_port, _host, callback) {
            callback();
          },
        };
      },
      ensureSeed: vi.fn(async () => {}),
      env: {
        TALLY_LOG_LEVEL: "debug",
      },
    });

    await runtime.start();

    expect(output[0]).toContain('"message":"api runtime configured"');
    expect(output[0]).toContain('"service":"tally-api"');

    consoleSpy.mockRestore();
  });
});
