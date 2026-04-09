import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiRuntimeConfig } from "./config";
import {
  buildIdempotencyRequestHash,
  createIdempotencyStore,
  createJsonIdempotencyStore,
  createSqliteIdempotencyStore,
} from "./idempotency-store";

function createConfig(overrides: Partial<ApiRuntimeConfig> = {}): ApiRuntimeConfig {
  return {
    authIdentities: [],
    authSource: "none",
    authStrategy: "none",
    bodyLimitBytes: 1048576,
    corsAllowedOrigins: [],
    dataDirectory: "/tmp/tally-runtime",
    host: "127.0.0.1",
    persistenceBackend: "json",
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

describe("idempotency store", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanupPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
  });

  it("tracks started/in-progress/hash-conflict/replay states", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-idempotency-"));
    cleanupPaths.push(directory);
    const store = createJsonIdempotencyStore({
      filePath: join(directory, "idempotency.json"),
    });

    const scopeKey = "Primary:/api/books/:bookId/transactions:workspace:key-1";
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    await expect(
      store.begin({
        expiresAt,
        requestHash: "hash-a",
        scopeKey,
      }),
    ).resolves.toEqual({ kind: "started" });

    await expect(
      store.begin({
        expiresAt,
        requestHash: "hash-a",
        scopeKey,
      }),
    ).resolves.toEqual({ kind: "in_progress" });

    await expect(
      store.begin({
        expiresAt,
        requestHash: "hash-b",
        scopeKey,
      }),
    ).resolves.toEqual({ kind: "hash_conflict" });

    await store.complete({
      response: {
        body: { ok: true },
        headers: { "x-request-id": "req-1" },
        status: 201,
      },
      scopeKey,
    });

    await expect(
      store.begin({
        expiresAt,
        requestHash: "hash-a",
        scopeKey,
      }),
    ).resolves.toEqual({
      kind: "replay",
      response: {
        body: { ok: true },
        headers: { "x-request-id": "req-1" },
        status: 201,
      },
    });
  });

  it("purges expired records and allows fresh starts for the same scope", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-idempotency-"));
    cleanupPaths.push(directory);
    const store = createJsonIdempotencyStore({
      filePath: join(directory, "idempotency.json"),
    });

    const scopeKey = "Primary:/api/books/:bookId/transactions:workspace:expired";

    await expect(
      store.begin({
        expiresAt: new Date(Date.now() - 10_000).toISOString(),
        requestHash: "hash-a",
        scopeKey,
      }),
    ).resolves.toEqual({ kind: "started" });

    await expect(
      store.begin({
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        requestHash: "hash-b",
        scopeKey,
      }),
    ).resolves.toEqual({ kind: "started" });
  });

  it("supports sqlite idempotency flow including replay", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-idempotency-sqlite-"));
    cleanupPaths.push(directory);
    const store = createSqliteIdempotencyStore({
      databasePath: join(directory, "idempotency.sqlite"),
    });

    const scopeKey = "Primary:/api/books/:bookId/transactions:workspace:key-sqlite";
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    await expect(
      store.begin({
        expiresAt,
        requestHash: "hash-a",
        scopeKey,
      }),
    ).resolves.toEqual({ kind: "started" });

    await expect(
      store.begin({
        expiresAt,
        requestHash: "hash-a",
        scopeKey,
      }),
    ).resolves.toEqual({ kind: "in_progress" });

    await expect(
      store.begin({
        expiresAt,
        requestHash: "hash-b",
        scopeKey,
      }),
    ).resolves.toEqual({ kind: "hash_conflict" });

    await store.complete({
      response: {
        body: { ok: true },
        headers: { "x-request-id": "req-sqlite" },
        status: 201,
      },
      scopeKey,
    });

    await expect(
      store.begin({
        expiresAt,
        requestHash: "hash-a",
        scopeKey,
      }),
    ).resolves.toEqual({
      kind: "replay",
      response: {
        body: { ok: true },
        headers: { "x-request-id": "req-sqlite" },
        status: 201,
      },
    });

    await expect(
      store.complete({
        response: { body: { ignored: true }, headers: {}, status: 200 },
        scopeKey: "missing",
      }),
    ).resolves.toBeUndefined();

    await store.close?.();
  });

  it("builds deterministic request hashes from request identity and body", () => {
    const shared = {
      contentType: "application/json",
      method: "POST",
      path: "/api/books/workspace/transactions",
      requestBodyBytes: new TextEncoder().encode('{"amount":1}'),
    };

    const first = buildIdempotencyRequestHash(shared);
    const second = buildIdempotencyRequestHash(shared);
    const changedBody = buildIdempotencyRequestHash({
      ...shared,
      requestBodyBytes: new TextEncoder().encode('{"amount":2}'),
    });

    expect(first).toBe(second);
    expect(changedBody).not.toBe(first);
  });

  it("creates sqlite and json stores from runtime config", async () => {
    const sqliteDir = await mkdtemp(join(tmpdir(), "tally-idempotency-select-sqlite-"));
    const jsonDir = await mkdtemp(join(tmpdir(), "tally-idempotency-select-json-"));
    cleanupPaths.push(sqliteDir, jsonDir);

    const sqliteStore = createIdempotencyStore({
      config: createConfig({
        persistenceBackend: "sqlite",
        sqlitePath: join(sqliteDir, "store.sqlite"),
      }),
    });
    const jsonStore = createIdempotencyStore({
      config: createConfig({
        dataDirectory: jsonDir,
        persistenceBackend: "json",
      }),
    });

    await expect(
      sqliteStore.begin({
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        requestHash: "hash-a",
        scopeKey: "sqlite-scope",
      }),
    ).resolves.toEqual({ kind: "started" });

    await expect(
      jsonStore.begin({
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        requestHash: "hash-a",
        scopeKey: "json-scope",
      }),
    ).resolves.toEqual({ kind: "started" });

    await sqliteStore.close?.();
  });
});
