import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger, type LogRecord } from "@gnucash-ng/logging";
import { createApiRuntime, runApiRuntimeFromCli } from "./runtime";
import type { ApiRuntimeConfig } from "./config";

function createConfig(overrides: Partial<ApiRuntimeConfig> = {}): ApiRuntimeConfig {
  return {
    authIdentities: [],
    authSource: "none",
    authStrategy: "none",
    bodyLimitBytes: 1048576,
    dataDirectory: "/tmp/gnucash-ng-runtime",
    host: "127.0.0.1",
    port: 4000,
    rateLimit: {
      importLimit: 10,
      mutationLimit: 30,
      readLimit: 120,
      windowMs: 60000,
    },
    runtimeMode: "development",
    seedDemoWorkspace: true,
    shutdownTimeoutMs: 10000,
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
      dataDirectory: "/tmp/gnucash-ng-runtime",
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
      "Invalid API configuration: Production runtime requires GNUCASH_NG_API_AUTH_TOKEN, GNUCASH_NG_API_AUTH_IDENTITIES, GNUCASH_NG_API_AUTH_TOKEN_FILE, or GNUCASH_NG_API_AUTH_IDENTITIES_FILE.",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
