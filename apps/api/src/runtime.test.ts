import { describe, expect, it, vi } from "vitest";
import { createLogger } from "@gnucash-ng/logging";
import { createApiRuntime } from "./runtime";
import type { ApiRuntimeConfig } from "./config";

function createConfig(overrides: Partial<ApiRuntimeConfig> = {}): ApiRuntimeConfig {
  return {
    authIdentities: [],
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
  function createSilentLogger() {
    return createLogger({
      minLevel: "debug",
      service: "api-runtime-tests",
      sink() {},
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
});
