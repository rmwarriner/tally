import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createApiRuntimeConfig } from "./config";
import { ConfigValidationError } from "./errors";

describe("api runtime config", () => {
  it("provides stable defaults for local development", () => {
    const config = createApiRuntimeConfig({}, "/tmp/tally", {
      defaultRuntimeMode: "development",
    });

    expect(config).toEqual({
      authIdentities: [],
      authSource: "none",
      authStrategy: "none",
      bodyLimitBytes: 1048576,
      corsAllowedOrigins: [],
      dataDirectory: "/tmp/tally/data",
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
      sqlitePath: "/tmp/tally/data/workspaces.sqlite",
      trustedHeaderAuth: undefined,
    });
  });

  it("accepts explicit host, port, and data directory overrides", () => {
    const config = createApiRuntimeConfig(
      {
        TALLY_API_AUTH_TOKEN: "top-secret",
        TALLY_API_HOST: "0.0.0.0",
        TALLY_API_PORT: "4100",
        TALLY_API_PERSISTENCE_BACKEND: "postgres",
        TALLY_API_POSTGRES_URL: "postgres://ledger:test@localhost:5432/ledger",
        TALLY_API_RUNTIME_MODE: "production",
        TALLY_API_SEED_DEMO_WORKSPACE: "false",
        TALLY_API_SHUTDOWN_TIMEOUT_MS: "15000",
        TALLY_DATA_DIR: "var/workspaces",
        TALLY_API_RATE_LIMIT_IMPORTS: "4",
        TALLY_API_RATE_LIMIT_MUTATIONS: "12",
        TALLY_API_RATE_LIMIT_READS: "75",
        TALLY_API_RATE_LIMIT_WINDOW_MS: "30000",
      },
      "/tmp/tally",
    );

    expect(config).toEqual({
      authIdentities: [{ actor: "api-user", role: "admin", token: "top-secret" }],
      authSource: "env",
      authStrategy: "token",
      bodyLimitBytes: 1048576,
      corsAllowedOrigins: [],
      dataDirectory: "/tmp/tally/var/workspaces",
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
      sqlitePath: "/tmp/tally/var/workspaces/workspaces.sqlite",
      trustedHeaderAuth: undefined,
    });
  });

  it("rejects non-loopback binding without an auth token", () => {
    expect(() =>
      createApiRuntimeConfig(
        {
          TALLY_API_HOST: "0.0.0.0",
        },
        "/tmp/tally",
      ),
    ).toThrow(
      "Non-loopback API binding requires explicit auth configuration (token, identities, or trusted-header auth).",
    );
  });

  it("rejects production runtime without auth configuration", () => {
    expect(() => createApiRuntimeConfig({}, "/tmp/tally")).toThrow(
      "Production runtime requires explicit auth configuration (token, identities, or trusted-header auth).",
    );
  });

  it("rejects demo seeding in production runtime", () => {
    expect(() =>
      createApiRuntimeConfig({
        TALLY_API_AUTH_TOKEN: "top-secret",
        TALLY_API_SEED_DEMO_WORKSPACE: "true",
      }),
    ).toThrow("Production runtime cannot enable TALLY_API_SEED_DEMO_WORKSPACE.");
  });

  it("rejects invalid numeric configuration values", () => {
    expect(
      () =>
        createApiRuntimeConfig({
          TALLY_API_BODY_LIMIT_BYTES: "0",
        }),
    ).toThrow(ConfigValidationError);
  });

  it("rejects invalid boolean and runtime mode configuration values", () => {
    expect(
      () =>
        createApiRuntimeConfig(
          {
            TALLY_API_RUNTIME_MODE: "staging",
            TALLY_API_AUTH_TOKEN: "top-secret",
          },
          "/tmp/tally",
        ),
    ).toThrow("TALLY_API_RUNTIME_MODE must be development, production, or test.");

    expect(
      () =>
        createApiRuntimeConfig(
          {
            TALLY_API_RUNTIME_MODE: "development",
            TALLY_API_SEED_DEMO_WORKSPACE: "maybe",
          },
          "/tmp/tally",
        ),
    ).toThrow("TALLY_API_SEED_DEMO_WORKSPACE must be true or false.");

    expect(
      () =>
        createApiRuntimeConfig(
          {
            TALLY_API_RUNTIME_MODE: "development",
            TALLY_API_PERSISTENCE_BACKEND: "mysql",
          },
          "/tmp/tally",
        ),
    ).toThrow("TALLY_API_PERSISTENCE_BACKEND must be json, sqlite, or postgres.");

    expect(
      () =>
        createApiRuntimeConfig(
          {
            TALLY_API_RUNTIME_MODE: "development",
            TALLY_LOG_FORMAT: "text",
          },
          "/tmp/tally",
        ),
    ).toThrow("TALLY_LOG_FORMAT must be auto, json, or pretty.");
  });

  it("accepts an explicit sqlite path override", () => {
    const config = createApiRuntimeConfig(
      {
        TALLY_API_RUNTIME_MODE: "development",
        TALLY_API_PERSISTENCE_BACKEND: "sqlite",
        TALLY_API_SQLITE_PATH: "../runtime/api.sqlite",
      },
      "/tmp/tally",
    );

    expect(config.sqlitePath).toBe("/tmp/tally/runtime/api.sqlite");
  });

  it("requires a postgres url when the postgres backend is selected", () => {
    expect(
      () =>
        createApiRuntimeConfig(
          {
            TALLY_API_RUNTIME_MODE: "development",
            TALLY_API_PERSISTENCE_BACKEND: "postgres",
          },
          "/tmp/tally",
        ),
    ).toThrow(
      "TALLY_API_POSTGRES_URL is required when TALLY_API_PERSISTENCE_BACKEND=postgres.",
    );
  });

  it("rejects malformed auth identity configuration", () => {
    expect(
      () =>
        createApiRuntimeConfig({
          TALLY_API_AUTH_IDENTITIES: '{"bad":true}',
        }),
    ).toThrow("TALLY_API_AUTH_IDENTITIES must be an array.");
  });

  it("loads auth token configuration from a file", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "tally-config-"));
    const tokenFile = join(tempDirectory, "api-token.txt");
    writeFileSync(tokenFile, "file-secret\n", "utf8");

    const config = createApiRuntimeConfig(
      {
        TALLY_API_AUTH_TOKEN_FILE: tokenFile,
        TALLY_API_RUNTIME_MODE: "production",
      },
      "/tmp/tally",
    );

    expect(config.authIdentities).toEqual([
      { actor: "api-user", role: "admin", token: "file-secret" },
    ]);
    expect(config.authStrategy).toBe("token");
    expect(config.authSource).toBe("file");
  });

  it("loads auth identities configuration from a file", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "tally-config-"));
    const identitiesFile = join(tempDirectory, "auth-identities.json");
    writeFileSync(
      identitiesFile,
      JSON.stringify([{ actor: "robert", role: "admin", token: "from-file" }]),
      "utf8",
    );

    const config = createApiRuntimeConfig(
      {
        TALLY_API_AUTH_IDENTITIES_FILE: identitiesFile,
        TALLY_API_RUNTIME_MODE: "production",
      },
      "/tmp/tally",
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
          TALLY_API_AUTH_TOKEN: "inline",
          TALLY_API_AUTH_TOKEN_FILE: "/tmp/token.txt",
          TALLY_API_RUNTIME_MODE: "production",
        }),
    ).toThrow(
      "Configure authentication with either TALLY_API_AUTH_TOKEN, TALLY_API_AUTH_IDENTITIES, TALLY_API_AUTH_TOKEN_FILE, TALLY_API_AUTH_IDENTITIES_FILE, or trusted-header auth settings, but not more than one.",
    );
  });

  it("supports trusted-header auth configuration with an inline proxy key", () => {
    const config = createApiRuntimeConfig(
      {
        TALLY_API_AUTH_TRUSTED_ACTOR_HEADER: "cf-access-authenticated-user-email",
        TALLY_API_AUTH_TRUSTED_PROXY_KEY: "proxy-secret",
        TALLY_API_AUTH_TRUSTED_PROXY_KEY_HEADER: "x-internal-proxy-key",
        TALLY_API_AUTH_TRUSTED_ROLE_HEADER: "x-gnucash-role",
        TALLY_API_RUNTIME_MODE: "production",
      },
      "/tmp/tally",
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
    const tempDirectory = mkdtempSync(join(tmpdir(), "tally-config-"));
    const keyFile = join(tempDirectory, "proxy-key.txt");
    writeFileSync(keyFile, "proxy-file-secret\n", "utf8");

    const config = createApiRuntimeConfig(
      {
        TALLY_API_AUTH_TRUSTED_ACTOR_HEADER: "x-authenticated-actor",
        TALLY_API_AUTH_TRUSTED_PROXY_KEY_FILE: keyFile,
        TALLY_API_RUNTIME_MODE: "production",
      },
      "/tmp/tally",
    );

    expect(config.authStrategy).toBe("trusted-header");
    expect(config.authSource).toBe("file");
    expect(config.trustedHeaderAuth).toEqual({
      actorHeader: "x-authenticated-actor",
      proxyKey: "proxy-file-secret",
      proxyKeyHeader: "x-tally-auth-proxy-key",
      roleHeader: "x-tally-auth-role",
    });
  });

  it("requires trusted-header actor and proxy key configuration", () => {
    expect(
      () =>
        createApiRuntimeConfig({
          TALLY_API_AUTH_TRUSTED_PROXY_KEY: "proxy-secret",
          TALLY_API_RUNTIME_MODE: "production",
        }),
    ).toThrow("TALLY_API_AUTH_TRUSTED_ACTOR_HEADER is required for trusted-header auth.");

    expect(
      () =>
        createApiRuntimeConfig({
          TALLY_API_AUTH_TRUSTED_ACTOR_HEADER: "x-authenticated-actor",
          TALLY_API_RUNTIME_MODE: "production",
        }),
    ).toThrow(
      "Trusted-header auth requires TALLY_API_AUTH_TRUSTED_PROXY_KEY or TALLY_API_AUTH_TRUSTED_PROXY_KEY_FILE.",
    );
  });

  it("rejects empty auth secret files", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "tally-config-"));
    const tokenFile = join(tempDirectory, "api-token.txt");
    writeFileSync(tokenFile, "\n", "utf8");

    expect(
      () =>
        createApiRuntimeConfig({
          TALLY_API_AUTH_TOKEN_FILE: tokenFile,
          TALLY_API_RUNTIME_MODE: "production",
        }),
    ).toThrow("TALLY_API_AUTH_TOKEN_FILE must not be empty.");
  });

  it("accepts legacy GNUCASH_NG env keys during transition", () => {
    const config = createApiRuntimeConfig(
      {
        GNUCASH_NG_API_AUTH_TOKEN: "legacy-token",
        GNUCASH_NG_API_RUNTIME_MODE: "development",
      },
      "/tmp/tally",
    );

    expect(config.authStrategy).toBe("token");
    expect(config.authSource).toBe("env");
    expect(config.authIdentities).toEqual([
      { actor: "api-user", role: "admin", token: "legacy-token" },
    ]);
  });

  it("parses TALLY_CORS_ORIGIN into a list of allowed origins", () => {
    const single = createApiRuntimeConfig(
      {
        TALLY_API_RUNTIME_MODE: "development",
        TALLY_CORS_ORIGIN: "https://app.example.com",
      },
      "/tmp/tally",
    );

    expect(single.corsAllowedOrigins).toEqual(["https://app.example.com"]);

    const multiple = createApiRuntimeConfig(
      {
        TALLY_API_RUNTIME_MODE: "development",
        TALLY_CORS_ORIGIN: "https://app.example.com, https://admin.example.com",
      },
      "/tmp/tally",
    );

    expect(multiple.corsAllowedOrigins).toEqual([
      "https://app.example.com",
      "https://admin.example.com",
    ]);

    const empty = createApiRuntimeConfig(
      { TALLY_API_RUNTIME_MODE: "development" },
      "/tmp/tally",
    );

    expect(empty.corsAllowedOrigins).toEqual([]);
  });

  it("prefers TALLY_* env keys over legacy GNUCASH_NG_* keys when both are present", () => {
    const config = createApiRuntimeConfig(
      {
        GNUCASH_NG_API_AUTH_TOKEN: "legacy-token",
        TALLY_API_AUTH_TOKEN: "new-token",
        GNUCASH_NG_API_RUNTIME_MODE: "production",
        TALLY_API_RUNTIME_MODE: "development",
      },
      "/tmp/tally",
    );

    expect(config.runtimeMode).toBe("development");
    expect(config.authIdentities).toEqual([
      { actor: "api-user", role: "admin", token: "new-token" },
    ]);
  });
});
