import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createApiRuntimeConfig } from "./config";
import { ConfigValidationError } from "./errors";

describe("api runtime config", () => {
  it("provides stable defaults for local development", () => {
    const config = createApiRuntimeConfig({}, "/tmp/gnucash-ng", {
      defaultRuntimeMode: "development",
    });

    expect(config).toEqual({
      authIdentities: [],
      authSource: "none",
      authStrategy: "none",
      bodyLimitBytes: 1048576,
      dataDirectory: "/tmp/gnucash-ng/data",
      host: "127.0.0.1",
      persistenceBackend: "json",
      port: 4000,
      postgresUrl: "",
      logFormat: "auto",
      runtimeMode: "development",
      rateLimit: {
        importLimit: 10,
        mutationLimit: 30,
        readLimit: 120,
        windowMs: 60000,
      },
      seedDemoWorkspace: true,
      shutdownTimeoutMs: 10000,
      sqlitePath: "/tmp/gnucash-ng/data/workspaces.sqlite",
      trustedHeaderAuth: undefined,
    });
  });

  it("accepts explicit host, port, and data directory overrides", () => {
    const config = createApiRuntimeConfig(
      {
        GNUCASH_NG_API_AUTH_TOKEN: "top-secret",
        GNUCASH_NG_API_HOST: "0.0.0.0",
        GNUCASH_NG_API_PORT: "4100",
        GNUCASH_NG_API_PERSISTENCE_BACKEND: "postgres",
        GNUCASH_NG_API_POSTGRES_URL: "postgres://ledger:test@localhost:5432/ledger",
        GNUCASH_NG_API_RUNTIME_MODE: "production",
        GNUCASH_NG_API_SEED_DEMO_WORKSPACE: "false",
        GNUCASH_NG_API_SHUTDOWN_TIMEOUT_MS: "15000",
        GNUCASH_NG_DATA_DIR: "var/workspaces",
        GNUCASH_NG_API_RATE_LIMIT_IMPORTS: "4",
        GNUCASH_NG_API_RATE_LIMIT_MUTATIONS: "12",
        GNUCASH_NG_API_RATE_LIMIT_READS: "75",
        GNUCASH_NG_API_RATE_LIMIT_WINDOW_MS: "30000",
      },
      "/tmp/gnucash-ng",
    );

    expect(config).toEqual({
      authIdentities: [{ actor: "api-user", role: "admin", token: "top-secret" }],
      authSource: "env",
      authStrategy: "token",
      bodyLimitBytes: 1048576,
      dataDirectory: "/tmp/gnucash-ng/var/workspaces",
      host: "0.0.0.0",
      persistenceBackend: "postgres",
      port: 4100,
      postgresUrl: "postgres://ledger:test@localhost:5432/ledger",
      logFormat: "auto",
      runtimeMode: "production",
      rateLimit: {
        importLimit: 4,
        mutationLimit: 12,
        readLimit: 75,
        windowMs: 30000,
      },
      seedDemoWorkspace: false,
      shutdownTimeoutMs: 15000,
      sqlitePath: "/tmp/gnucash-ng/var/workspaces/workspaces.sqlite",
      trustedHeaderAuth: undefined,
    });
  });

  it("rejects non-loopback binding without an auth token", () => {
    expect(() =>
      createApiRuntimeConfig(
        {
          GNUCASH_NG_API_HOST: "0.0.0.0",
        },
        "/tmp/gnucash-ng",
      ),
    ).toThrow(
      "Non-loopback API binding requires explicit auth configuration (token, identities, or trusted-header auth).",
    );
  });

  it("rejects production runtime without auth configuration", () => {
    expect(() => createApiRuntimeConfig({}, "/tmp/gnucash-ng")).toThrow(
      "Production runtime requires explicit auth configuration (token, identities, or trusted-header auth).",
    );
  });

  it("rejects demo seeding in production runtime", () => {
    expect(() =>
      createApiRuntimeConfig({
        GNUCASH_NG_API_AUTH_TOKEN: "top-secret",
        GNUCASH_NG_API_SEED_DEMO_WORKSPACE: "true",
      }),
    ).toThrow("Production runtime cannot enable GNUCASH_NG_API_SEED_DEMO_WORKSPACE.");
  });

  it("rejects invalid numeric configuration values", () => {
    expect(
      () =>
        createApiRuntimeConfig({
          GNUCASH_NG_API_BODY_LIMIT_BYTES: "0",
        }),
    ).toThrow(ConfigValidationError);
  });

  it("rejects invalid boolean and runtime mode configuration values", () => {
    expect(
      () =>
        createApiRuntimeConfig(
          {
            GNUCASH_NG_API_RUNTIME_MODE: "staging",
            GNUCASH_NG_API_AUTH_TOKEN: "top-secret",
          },
          "/tmp/gnucash-ng",
        ),
    ).toThrow("GNUCASH_NG_API_RUNTIME_MODE must be development, production, or test.");

    expect(
      () =>
        createApiRuntimeConfig(
          {
            GNUCASH_NG_API_RUNTIME_MODE: "development",
            GNUCASH_NG_API_SEED_DEMO_WORKSPACE: "maybe",
          },
          "/tmp/gnucash-ng",
        ),
    ).toThrow("GNUCASH_NG_API_SEED_DEMO_WORKSPACE must be true or false.");

    expect(
      () =>
        createApiRuntimeConfig(
          {
            GNUCASH_NG_API_RUNTIME_MODE: "development",
            GNUCASH_NG_API_PERSISTENCE_BACKEND: "mysql",
          },
          "/tmp/gnucash-ng",
        ),
    ).toThrow("GNUCASH_NG_API_PERSISTENCE_BACKEND must be json, sqlite, or postgres.");

    expect(
      () =>
        createApiRuntimeConfig(
          {
            GNUCASH_NG_API_RUNTIME_MODE: "development",
            GNUCASH_NG_LOG_FORMAT: "text",
          },
          "/tmp/gnucash-ng",
        ),
    ).toThrow("GNUCASH_NG_LOG_FORMAT must be auto, json, or pretty.");
  });

  it("accepts an explicit sqlite path override", () => {
    const config = createApiRuntimeConfig(
      {
        GNUCASH_NG_API_RUNTIME_MODE: "development",
        GNUCASH_NG_API_PERSISTENCE_BACKEND: "sqlite",
        GNUCASH_NG_API_SQLITE_PATH: "../runtime/api.sqlite",
      },
      "/tmp/gnucash-ng",
    );

    expect(config.sqlitePath).toBe("/tmp/gnucash-ng/runtime/api.sqlite");
  });

  it("requires a postgres url when the postgres backend is selected", () => {
    expect(
      () =>
        createApiRuntimeConfig(
          {
            GNUCASH_NG_API_RUNTIME_MODE: "development",
            GNUCASH_NG_API_PERSISTENCE_BACKEND: "postgres",
          },
          "/tmp/gnucash-ng",
        ),
    ).toThrow(
      "GNUCASH_NG_API_POSTGRES_URL is required when GNUCASH_NG_API_PERSISTENCE_BACKEND=postgres.",
    );
  });

  it("rejects malformed auth identity configuration", () => {
    expect(
      () =>
        createApiRuntimeConfig({
          GNUCASH_NG_API_AUTH_IDENTITIES: '{"bad":true}',
        }),
    ).toThrow("GNUCASH_NG_API_AUTH_IDENTITIES must be an array.");
  });

  it("loads auth token configuration from a file", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "gnucash-ng-config-"));
    const tokenFile = join(tempDirectory, "api-token.txt");
    writeFileSync(tokenFile, "file-secret\n", "utf8");

    const config = createApiRuntimeConfig(
      {
        GNUCASH_NG_API_AUTH_TOKEN_FILE: tokenFile,
        GNUCASH_NG_API_RUNTIME_MODE: "production",
      },
      "/tmp/gnucash-ng",
    );

    expect(config.authIdentities).toEqual([
      { actor: "api-user", role: "admin", token: "file-secret" },
    ]);
    expect(config.authStrategy).toBe("token");
    expect(config.authSource).toBe("file");
  });

  it("loads auth identities configuration from a file", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "gnucash-ng-config-"));
    const identitiesFile = join(tempDirectory, "auth-identities.json");
    writeFileSync(
      identitiesFile,
      JSON.stringify([{ actor: "robert", role: "admin", token: "from-file" }]),
      "utf8",
    );

    const config = createApiRuntimeConfig(
      {
        GNUCASH_NG_API_AUTH_IDENTITIES_FILE: identitiesFile,
        GNUCASH_NG_API_RUNTIME_MODE: "production",
      },
      "/tmp/gnucash-ng",
    );

    expect(config.authIdentities).toEqual([
      { actor: "robert", role: "admin", token: "from-file" },
    ]);
    expect(config.authStrategy).toBe("identities");
    expect(config.authSource).toBe("file");
  });

  it("rejects mixing inline and file-based auth configuration", () => {
    expect(
      () =>
        createApiRuntimeConfig({
          GNUCASH_NG_API_AUTH_TOKEN: "inline",
          GNUCASH_NG_API_AUTH_TOKEN_FILE: "/tmp/token.txt",
          GNUCASH_NG_API_RUNTIME_MODE: "production",
        }),
    ).toThrow(
      "Configure authentication with either GNUCASH_NG_API_AUTH_TOKEN, GNUCASH_NG_API_AUTH_IDENTITIES, GNUCASH_NG_API_AUTH_TOKEN_FILE, GNUCASH_NG_API_AUTH_IDENTITIES_FILE, or trusted-header auth settings, but not more than one.",
    );
  });

  it("supports trusted-header auth configuration with an inline proxy key", () => {
    const config = createApiRuntimeConfig(
      {
        GNUCASH_NG_API_AUTH_TRUSTED_ACTOR_HEADER: "cf-access-authenticated-user-email",
        GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY: "proxy-secret",
        GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY_HEADER: "x-internal-proxy-key",
        GNUCASH_NG_API_AUTH_TRUSTED_ROLE_HEADER: "x-gnucash-role",
        GNUCASH_NG_API_RUNTIME_MODE: "production",
      },
      "/tmp/gnucash-ng",
    );

    expect(config.authIdentities).toEqual([]);
    expect(config.authStrategy).toBe("trusted-header");
    expect(config.authSource).toBe("env");
    expect(config.trustedHeaderAuth).toEqual({
      actorHeader: "cf-access-authenticated-user-email",
      proxyKey: "proxy-secret",
      proxyKeyHeader: "x-internal-proxy-key",
      roleHeader: "x-gnucash-role",
    });
  });

  it("supports trusted-header auth configuration with a proxy key file", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "gnucash-ng-config-"));
    const keyFile = join(tempDirectory, "proxy-key.txt");
    writeFileSync(keyFile, "proxy-file-secret\n", "utf8");

    const config = createApiRuntimeConfig(
      {
        GNUCASH_NG_API_AUTH_TRUSTED_ACTOR_HEADER: "x-authenticated-actor",
        GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY_FILE: keyFile,
        GNUCASH_NG_API_RUNTIME_MODE: "production",
      },
      "/tmp/gnucash-ng",
    );

    expect(config.authStrategy).toBe("trusted-header");
    expect(config.authSource).toBe("file");
    expect(config.trustedHeaderAuth).toEqual({
      actorHeader: "x-authenticated-actor",
      proxyKey: "proxy-file-secret",
      proxyKeyHeader: "x-gnucash-ng-auth-proxy-key",
      roleHeader: "x-gnucash-ng-auth-role",
    });
  });

  it("requires trusted-header actor and proxy key configuration", () => {
    expect(
      () =>
        createApiRuntimeConfig({
          GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY: "proxy-secret",
          GNUCASH_NG_API_RUNTIME_MODE: "production",
        }),
    ).toThrow("GNUCASH_NG_API_AUTH_TRUSTED_ACTOR_HEADER is required for trusted-header auth.");

    expect(
      () =>
        createApiRuntimeConfig({
          GNUCASH_NG_API_AUTH_TRUSTED_ACTOR_HEADER: "x-authenticated-actor",
          GNUCASH_NG_API_RUNTIME_MODE: "production",
        }),
    ).toThrow(
      "Trusted-header auth requires GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY or GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY_FILE.",
    );
  });

  it("rejects empty auth secret files", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "gnucash-ng-config-"));
    const tokenFile = join(tempDirectory, "api-token.txt");
    writeFileSync(tokenFile, "\n", "utf8");

    expect(
      () =>
        createApiRuntimeConfig({
          GNUCASH_NG_API_AUTH_TOKEN_FILE: tokenFile,
          GNUCASH_NG_API_RUNTIME_MODE: "production",
        }),
    ).toThrow("GNUCASH_NG_API_AUTH_TOKEN_FILE must not be empty.");
  });
});
