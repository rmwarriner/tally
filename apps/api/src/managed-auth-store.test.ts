import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiRuntimeConfig } from "./config";
import { ApiError } from "./errors";
import {
  createJsonManagedAuthStore,
  createManagedAuthStore,
  createSqliteManagedAuthStore,
} from "./managed-auth-store";

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

describe("managed auth store", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanupPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
  });

  it("issues, verifies, exchanges, and revokes token/session credentials in json", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-managed-auth-"));
    cleanupPaths.push(directory);
    const store = createJsonManagedAuthStore({
      filePath: join(directory, "managed-auth.json"),
    });

    const issued = await store.issueToken({
      actor: "Primary",
      createdBy: "Admin",
      role: "member",
    });
    expect(issued.secret).toMatch(/^tok_/);
    expect(issued.token.actor).toBe("Primary");

    const listed = await store.listTokens();
    expect(listed.some((token) => token.id === issued.token.id)).toBe(true);

    await expect(store.verifyBearer(issued.secret)).resolves.toEqual({
      actor: "Primary",
      kind: "managed-token",
      role: "member",
      tokenId: issued.token.id,
    });

    const exchanged = await store.exchangeSession({ tokenId: issued.token.id });
    expect(exchanged.secret).toMatch(/^ses_/);

    await expect(store.verifyBearer(exchanged.secret)).resolves.toEqual({
      actor: "Primary",
      kind: "session",
      role: "member",
      sessionId: exchanged.session.id,
      tokenId: issued.token.id,
    });

    await expect(store.revokeSession("missing")).resolves.toBeUndefined();

    await store.revokeSession(exchanged.session.id);
    await expect(store.verifyBearer(exchanged.secret)).resolves.toBeUndefined();

    await store.revokeToken(issued.token.id);
    await expect(store.verifyBearer(issued.secret)).resolves.toBeUndefined();
    await expect(store.exchangeSession({ tokenId: issued.token.id })).rejects.toMatchObject<ApiError>({
      code: "auth.required",
      status: 401,
    });
    await expect(store.revokeToken("missing")).resolves.toBeUndefined();
  });

  it("supports sqlite token/session lifecycle and token-revocation cascading", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-managed-auth-sqlite-"));
    cleanupPaths.push(directory);
    const store = createSqliteManagedAuthStore({
      databasePath: join(directory, "managed-auth.sqlite"),
    });

    const issued = await store.issueToken({
      actor: "Primary",
      createdBy: "Admin",
      role: "admin",
    });

    await expect(store.verifyBearer(issued.secret)).resolves.toEqual({
      actor: "Primary",
      kind: "managed-token",
      role: "admin",
      tokenId: issued.token.id,
    });

    const exchanged = await store.exchangeSession({ tokenId: issued.token.id });

    await expect(store.verifyBearer(exchanged.secret)).resolves.toEqual({
      actor: "Primary",
      kind: "session",
      role: "admin",
      sessionId: exchanged.session.id,
      tokenId: issued.token.id,
    });

    await expect(store.revokeSession("missing")).resolves.toBeUndefined();
    await expect(store.revokeToken("missing")).resolves.toBeUndefined();

    await store.revokeToken(issued.token.id);
    await expect(store.verifyBearer(issued.secret)).resolves.toBeUndefined();
    await expect(store.verifyBearer(exchanged.secret)).resolves.toBeUndefined();

    const listed = await store.listTokens();
    expect(listed[0]?.id).toBe(issued.token.id);
    expect(listed[0]?.revokedAt).toBeTruthy();

    await store.close?.();
  });

  it("creates sqlite and json managed-auth stores from runtime config", async () => {
    const sqliteDir = await mkdtemp(join(tmpdir(), "tally-managed-auth-select-sqlite-"));
    const jsonDir = await mkdtemp(join(tmpdir(), "tally-managed-auth-select-json-"));
    cleanupPaths.push(sqliteDir, jsonDir);

    const sqliteStore = createManagedAuthStore({
      config: createConfig({
        persistenceBackend: "sqlite",
        sqlitePath: join(sqliteDir, "store.sqlite"),
      }),
    });
    const jsonStore = createManagedAuthStore({
      config: createConfig({
        dataDirectory: jsonDir,
        persistenceBackend: "json",
      }),
    });

    const sqliteIssued = await sqliteStore.issueToken({
      actor: "Sqlite",
      createdBy: "Admin",
      role: "member",
    });
    const jsonIssued = await jsonStore.issueToken({
      actor: "Json",
      createdBy: "Admin",
      role: "member",
    });

    await expect(sqliteStore.verifyBearer(sqliteIssued.secret)).resolves.toEqual({
      actor: "Sqlite",
      kind: "managed-token",
      role: "member",
      tokenId: sqliteIssued.token.id,
    });
    await expect(jsonStore.verifyBearer(jsonIssued.secret)).resolves.toEqual({
      actor: "Json",
      kind: "managed-token",
      role: "member",
      tokenId: jsonIssued.token.id,
    });

    await sqliteStore.close?.();
  });
});
