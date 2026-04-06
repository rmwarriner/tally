import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConfigValidationError } from "./errors";

export type ApiRuntimeMode = "development" | "production" | "test";
export type ApiAuthSource = "env" | "file" | "none";
export type ApiAuthStrategy = "identities" | "none" | "token" | "trusted-header";
export type ApiPersistenceBackend = "json" | "postgres" | "sqlite";
export type ApiLogFormat = "auto" | "json" | "pretty";

export interface ApiRuntimeConfig {
  authIdentities: Array<{
    actor: string;
    role: "admin" | "member";
    token: string;
  }>;
  authSource: ApiAuthSource;
  authStrategy: ApiAuthStrategy;
  trustedHeaderAuth?: {
    actorHeader: string;
    proxyKey: string;
    proxyKeyHeader: string;
    roleHeader: string;
  };
  bodyLimitBytes: number;
  dataDirectory: string;
  host: string;
  persistenceBackend: ApiPersistenceBackend;
  port: number;
  postgresUrl: string;
  runtimeMode: ApiRuntimeMode;
  logFormat: ApiLogFormat;
  rateLimit: {
    importLimit: number;
    mutationLimit: number;
    readLimit: number;
    windowMs: number;
  };
  seedDemoWorkspace: boolean;
  shutdownTimeoutMs: number;
  sqlitePath: string;
}

function parseLogFormat(value: string | undefined): ApiLogFormat {
  const candidate = value ?? "auto";

  if (candidate === "auto" || candidate === "json" || candidate === "pretty") {
    return candidate;
  }

  throw new ConfigValidationError([
    "GNUCASH_NG_LOG_FORMAT must be auto, json, or pretty.",
  ]);
}

function parsePersistenceBackend(value: string | undefined): ApiPersistenceBackend {
  const candidate = value ?? "json";

  if (candidate === "json" || candidate === "postgres" || candidate === "sqlite") {
    return candidate;
  }

  throw new ConfigValidationError([
    "GNUCASH_NG_API_PERSISTENCE_BACKEND must be json, sqlite, or postgres.",
  ]);
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

function parsePositiveInteger(value: string | undefined, fallback: number, fieldName: string): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ConfigValidationError([`${fieldName} must be a positive integer.`]);
  }

  return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean, fieldName: string): boolean {
  if (value === undefined) {
    return fallback;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new ConfigValidationError([`${fieldName} must be true or false.`]);
}

function parseRuntimeMode(value: string | undefined, fallback: ApiRuntimeMode): ApiRuntimeMode {
  const candidate = value ?? fallback;

  if (candidate === "development" || candidate === "production" || candidate === "test") {
    return candidate;
  }

  throw new ConfigValidationError([
    "GNUCASH_NG_API_RUNTIME_MODE must be development, production, or test.",
  ]);
}

function readSecretFile(path: string, fieldName: string): string {
  try {
    const contents = readFileSync(path, "utf8").trim();

    if (contents.length === 0) {
      throw new ConfigValidationError([`${fieldName} must not be empty.`]);
    }

    return contents;
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      throw error;
    }

    throw new ConfigValidationError([`${fieldName} could not be read from ${path}.`]);
  }
}

function parseAuthIdentitiesJson(raw: string): ApiRuntimeConfig["authIdentities"] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ConfigValidationError(["GNUCASH_NG_API_AUTH_IDENTITIES must be valid JSON."]);
  }

  if (!Array.isArray(parsed)) {
    throw new ConfigValidationError(["GNUCASH_NG_API_AUTH_IDENTITIES must be an array."]);
  }

  const identities = parsed.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new ConfigValidationError([`Auth identity ${index} must be an object.`]);
    }

    const candidate = item as Record<string, unknown>;

    if (typeof candidate.actor !== "string" || candidate.actor.length === 0) {
      throw new ConfigValidationError([`Auth identity ${index} actor is required.`]);
    }

    if (candidate.role !== "admin" && candidate.role !== "member") {
      throw new ConfigValidationError([`Auth identity ${index} role must be admin or member.`]);
    }

    if (typeof candidate.token !== "string" || candidate.token.length === 0) {
      throw new ConfigValidationError([`Auth identity ${index} token is required.`]);
    }

    return {
      actor: candidate.actor,
      role: candidate.role as "admin" | "member",
      token: candidate.token,
    };
  });

  return identities;
}

function parseAuthConfig(env: NodeJS.ProcessEnv): Pick<
  ApiRuntimeConfig,
  "authIdentities" | "authSource" | "authStrategy" | "trustedHeaderAuth"
> {
  const trustedHeaderRequested =
    env.GNUCASH_NG_API_AUTH_TRUSTED_ACTOR_HEADER !== undefined ||
    env.GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY !== undefined ||
    env.GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY_FILE !== undefined ||
    env.GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY_HEADER !== undefined ||
    env.GNUCASH_NG_API_AUTH_TRUSTED_ROLE_HEADER !== undefined;

  const configuredSources = [
    env.GNUCASH_NG_API_AUTH_TOKEN ? "GNUCASH_NG_API_AUTH_TOKEN" : null,
    env.GNUCASH_NG_API_AUTH_IDENTITIES ? "GNUCASH_NG_API_AUTH_IDENTITIES" : null,
    env.GNUCASH_NG_API_AUTH_TOKEN_FILE ? "GNUCASH_NG_API_AUTH_TOKEN_FILE" : null,
    env.GNUCASH_NG_API_AUTH_IDENTITIES_FILE ? "GNUCASH_NG_API_AUTH_IDENTITIES_FILE" : null,
    trustedHeaderRequested ? "trusted-header" : null,
  ].filter((value): value is string => value !== null);

  if (configuredSources.length > 1) {
    throw new ConfigValidationError([
      "Configure authentication with either GNUCASH_NG_API_AUTH_TOKEN, GNUCASH_NG_API_AUTH_IDENTITIES, GNUCASH_NG_API_AUTH_TOKEN_FILE, GNUCASH_NG_API_AUTH_IDENTITIES_FILE, or trusted-header auth settings, but not more than one.",
    ]);
  }

  if (trustedHeaderRequested) {
    const actorHeader = env.GNUCASH_NG_API_AUTH_TRUSTED_ACTOR_HEADER?.trim();

    if (!actorHeader) {
      throw new ConfigValidationError([
        "GNUCASH_NG_API_AUTH_TRUSTED_ACTOR_HEADER is required for trusted-header auth.",
      ]);
    }

    const hasInlineProxyKey = Boolean(env.GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY);
    const hasProxyKeyFile = Boolean(env.GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY_FILE);

    if (hasInlineProxyKey && hasProxyKeyFile) {
      throw new ConfigValidationError([
        "Configure trusted-header proxy key with either GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY or GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY_FILE, but not both.",
      ]);
    }

    if (!hasInlineProxyKey && !hasProxyKeyFile) {
      throw new ConfigValidationError([
        "Trusted-header auth requires GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY or GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY_FILE.",
      ]);
    }

    const proxyKeyHeader =
      env.GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY_HEADER?.trim() ?? "x-gnucash-ng-auth-proxy-key";
    const roleHeader = env.GNUCASH_NG_API_AUTH_TRUSTED_ROLE_HEADER?.trim() ?? "x-gnucash-ng-auth-role";

    if (proxyKeyHeader.length === 0 || roleHeader.length === 0) {
      throw new ConfigValidationError([
        "Trusted-header auth header names must not be empty.",
      ]);
    }

    const proxyKey = hasInlineProxyKey
      ? env.GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY ?? ""
      : readSecretFile(
          env.GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY_FILE ?? "",
          "GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY_FILE",
        );

    return {
      authIdentities: [],
      authSource: hasInlineProxyKey ? "env" : "file",
      authStrategy: "trusted-header",
      trustedHeaderAuth: {
        actorHeader,
        proxyKey,
        proxyKeyHeader,
        roleHeader,
      },
    };
  }

  if (env.GNUCASH_NG_API_AUTH_IDENTITIES) {
    return {
      authIdentities: parseAuthIdentitiesJson(env.GNUCASH_NG_API_AUTH_IDENTITIES),
      authSource: "env",
      authStrategy: "identities",
      trustedHeaderAuth: undefined,
    };
  }

  if (env.GNUCASH_NG_API_AUTH_IDENTITIES_FILE) {
    return {
      authIdentities: parseAuthIdentitiesJson(
        readSecretFile(env.GNUCASH_NG_API_AUTH_IDENTITIES_FILE, "GNUCASH_NG_API_AUTH_IDENTITIES_FILE"),
      ),
      authSource: "file",
      authStrategy: "identities",
      trustedHeaderAuth: undefined,
    };
  }

  if (env.GNUCASH_NG_API_AUTH_TOKEN) {
    return {
      authIdentities: [{ actor: "api-user", role: "admin" as const, token: env.GNUCASH_NG_API_AUTH_TOKEN }],
      authSource: "env",
      authStrategy: "token",
      trustedHeaderAuth: undefined,
    };
  }

  if (env.GNUCASH_NG_API_AUTH_TOKEN_FILE) {
    return {
      authIdentities: [
        {
          actor: "api-user",
          role: "admin" as const,
          token: readSecretFile(env.GNUCASH_NG_API_AUTH_TOKEN_FILE, "GNUCASH_NG_API_AUTH_TOKEN_FILE"),
        },
      ],
      authSource: "file",
      authStrategy: "token",
      trustedHeaderAuth: undefined,
    };
  }

  return {
    authIdentities: [],
    authSource: "none",
    authStrategy: "none",
    trustedHeaderAuth: undefined,
  };
}

export function createApiRuntimeConfig(
  env: NodeJS.ProcessEnv,
  cwd = process.cwd(),
  options: {
    defaultRuntimeMode?: ApiRuntimeMode;
  } = {},
): ApiRuntimeConfig {
  const runtimeMode = parseRuntimeMode(
    env.GNUCASH_NG_API_RUNTIME_MODE,
    options.defaultRuntimeMode ?? "production",
  );
  const logFormat = parseLogFormat(env.GNUCASH_NG_LOG_FORMAT);
  const port = parsePositiveInteger(env.GNUCASH_NG_API_PORT, 4000, "GNUCASH_NG_API_PORT");
  const host = env.GNUCASH_NG_API_HOST ?? "127.0.0.1";
  const persistenceBackend = parsePersistenceBackend(env.GNUCASH_NG_API_PERSISTENCE_BACKEND);
  const dataDirectory = resolve(cwd, env.GNUCASH_NG_DATA_DIR ?? "data");
  const bodyLimitBytes = parsePositiveInteger(
    env.GNUCASH_NG_API_BODY_LIMIT_BYTES,
    1048576,
    "GNUCASH_NG_API_BODY_LIMIT_BYTES",
  );
  const rateLimitWindowMs = parsePositiveInteger(
    env.GNUCASH_NG_API_RATE_LIMIT_WINDOW_MS,
    60000,
    "GNUCASH_NG_API_RATE_LIMIT_WINDOW_MS",
  );
  const readLimit = parsePositiveInteger(
    env.GNUCASH_NG_API_RATE_LIMIT_READS,
    120,
    "GNUCASH_NG_API_RATE_LIMIT_READS",
  );
  const mutationLimit = parsePositiveInteger(
    env.GNUCASH_NG_API_RATE_LIMIT_MUTATIONS,
    30,
    "GNUCASH_NG_API_RATE_LIMIT_MUTATIONS",
  );
  const importLimit = parsePositiveInteger(
    env.GNUCASH_NG_API_RATE_LIMIT_IMPORTS,
    10,
    "GNUCASH_NG_API_RATE_LIMIT_IMPORTS",
  );
  const shutdownTimeoutMs = parsePositiveInteger(
    env.GNUCASH_NG_API_SHUTDOWN_TIMEOUT_MS,
    10000,
    "GNUCASH_NG_API_SHUTDOWN_TIMEOUT_MS",
  );
  const authConfig = parseAuthConfig(env);
  const seedDemoWorkspace = parseBoolean(
    env.GNUCASH_NG_API_SEED_DEMO_WORKSPACE,
    runtimeMode === "development",
    "GNUCASH_NG_API_SEED_DEMO_WORKSPACE",
  );

  if (!isLoopbackHost(host) && authConfig.authStrategy === "none") {
    throw new ConfigValidationError([
      "Non-loopback API binding requires explicit auth configuration (token, identities, or trusted-header auth).",
    ]);
  }

  if (runtimeMode === "production" && authConfig.authStrategy === "none") {
    throw new ConfigValidationError([
      "Production runtime requires explicit auth configuration (token, identities, or trusted-header auth).",
    ]);
  }

  if (runtimeMode === "production" && seedDemoWorkspace) {
    throw new ConfigValidationError([
      "Production runtime cannot enable GNUCASH_NG_API_SEED_DEMO_WORKSPACE.",
    ]);
  }

  const postgresUrl = env.GNUCASH_NG_API_POSTGRES_URL ?? "";

  if (persistenceBackend === "postgres" && postgresUrl.length === 0) {
    throw new ConfigValidationError([
      "GNUCASH_NG_API_POSTGRES_URL is required when GNUCASH_NG_API_PERSISTENCE_BACKEND=postgres.",
    ]);
  }

  return {
    authIdentities: authConfig.authIdentities,
    authSource: authConfig.authSource,
    authStrategy: authConfig.authStrategy,
    bodyLimitBytes,
    dataDirectory,
    host,
    persistenceBackend,
    port,
    postgresUrl,
    runtimeMode,
    logFormat,
    rateLimit: {
      importLimit,
      mutationLimit,
      readLimit,
      windowMs: rateLimitWindowMs,
    },
    trustedHeaderAuth: authConfig.trustedHeaderAuth,
    seedDemoWorkspace,
    shutdownTimeoutMs,
    sqlitePath: resolve(dataDirectory, env.GNUCASH_NG_API_SQLITE_PATH ?? "workspaces.sqlite"),
  };
}
