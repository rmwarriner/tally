import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConfigValidationError } from "./errors";

export type ApiRuntimeMode = "development" | "production" | "test";
export type ApiAuthSource = "env" | "file" | "none";
export type ApiAuthStrategy = "identities" | "none" | "token";
export type ApiPersistenceBackend = "json";

export interface ApiRuntimeConfig {
  authIdentities: Array<{
    actor: string;
    role: "admin" | "member";
    token: string;
  }>;
  authSource: ApiAuthSource;
  authStrategy: ApiAuthStrategy;
  bodyLimitBytes: number;
  dataDirectory: string;
  host: string;
  persistenceBackend: ApiPersistenceBackend;
  port: number;
  runtimeMode: ApiRuntimeMode;
  rateLimit: {
    importLimit: number;
    mutationLimit: number;
    readLimit: number;
    windowMs: number;
  };
  seedDemoWorkspace: boolean;
  shutdownTimeoutMs: number;
}

function parsePersistenceBackend(value: string | undefined): ApiPersistenceBackend {
  const candidate = value ?? "json";

  if (candidate === "json") {
    return candidate;
  }

  throw new ConfigValidationError([
    "GNUCASH_NG_API_PERSISTENCE_BACKEND must be json.",
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

function parseAuthConfig(env: NodeJS.ProcessEnv): Pick<ApiRuntimeConfig, "authIdentities" | "authSource" | "authStrategy"> {
  const configuredSources = [
    env.GNUCASH_NG_API_AUTH_TOKEN ? "GNUCASH_NG_API_AUTH_TOKEN" : null,
    env.GNUCASH_NG_API_AUTH_IDENTITIES ? "GNUCASH_NG_API_AUTH_IDENTITIES" : null,
    env.GNUCASH_NG_API_AUTH_TOKEN_FILE ? "GNUCASH_NG_API_AUTH_TOKEN_FILE" : null,
    env.GNUCASH_NG_API_AUTH_IDENTITIES_FILE ? "GNUCASH_NG_API_AUTH_IDENTITIES_FILE" : null,
  ].filter((value): value is string => value !== null);

  if (configuredSources.length > 1) {
    throw new ConfigValidationError([
      "Configure authentication with either GNUCASH_NG_API_AUTH_TOKEN, GNUCASH_NG_API_AUTH_IDENTITIES, GNUCASH_NG_API_AUTH_TOKEN_FILE, or GNUCASH_NG_API_AUTH_IDENTITIES_FILE, but not more than one.",
    ]);
  }

  if (env.GNUCASH_NG_API_AUTH_IDENTITIES) {
    return {
      authIdentities: parseAuthIdentitiesJson(env.GNUCASH_NG_API_AUTH_IDENTITIES),
      authSource: "env",
      authStrategy: "identities",
    };
  }

  if (env.GNUCASH_NG_API_AUTH_IDENTITIES_FILE) {
    return {
      authIdentities: parseAuthIdentitiesJson(
        readSecretFile(env.GNUCASH_NG_API_AUTH_IDENTITIES_FILE, "GNUCASH_NG_API_AUTH_IDENTITIES_FILE"),
      ),
      authSource: "file",
      authStrategy: "identities",
    };
  }

  if (env.GNUCASH_NG_API_AUTH_TOKEN) {
    return {
      authIdentities: [{ actor: "api-user", role: "admin" as const, token: env.GNUCASH_NG_API_AUTH_TOKEN }],
      authSource: "env",
      authStrategy: "token",
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
    };
  }

  return {
    authIdentities: [],
    authSource: "none",
    authStrategy: "none",
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
  const port = parsePositiveInteger(env.GNUCASH_NG_API_PORT, 4000, "GNUCASH_NG_API_PORT");
  const host = env.GNUCASH_NG_API_HOST ?? "127.0.0.1";
  const persistenceBackend = parsePersistenceBackend(env.GNUCASH_NG_API_PERSISTENCE_BACKEND);
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

  if (!isLoopbackHost(host) && authConfig.authIdentities.length === 0) {
    throw new ConfigValidationError([
      "Non-loopback API binding requires GNUCASH_NG_API_AUTH_TOKEN, GNUCASH_NG_API_AUTH_IDENTITIES, GNUCASH_NG_API_AUTH_TOKEN_FILE, or GNUCASH_NG_API_AUTH_IDENTITIES_FILE.",
    ]);
  }

  if (runtimeMode === "production" && authConfig.authIdentities.length === 0) {
    throw new ConfigValidationError([
      "Production runtime requires GNUCASH_NG_API_AUTH_TOKEN, GNUCASH_NG_API_AUTH_IDENTITIES, GNUCASH_NG_API_AUTH_TOKEN_FILE, or GNUCASH_NG_API_AUTH_IDENTITIES_FILE.",
    ]);
  }

  if (runtimeMode === "production" && seedDemoWorkspace) {
    throw new ConfigValidationError([
      "Production runtime cannot enable GNUCASH_NG_API_SEED_DEMO_WORKSPACE.",
    ]);
  }

  return {
    authIdentities: authConfig.authIdentities,
    authSource: authConfig.authSource,
    authStrategy: authConfig.authStrategy,
    bodyLimitBytes,
    dataDirectory: resolve(cwd, env.GNUCASH_NG_DATA_DIR ?? "data"),
    host,
    persistenceBackend,
    port,
    runtimeMode,
    rateLimit: {
      importLimit,
      mutationLimit,
      readLimit,
      windowMs: rateLimitWindowMs,
    },
    seedDemoWorkspace,
    shutdownTimeoutMs,
  };
}
