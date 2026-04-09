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
  corsAllowedOrigins: string[];
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
  observability: {
    enabled: boolean;
    exportTimeoutMs: number;
    metricsExportIntervalMs: number;
    otlpEndpoint: string;
    otlpEndpointHost?: string;
    otlpHeaders: Record<string, string>;
    serviceName: string;
  };
  seedDemoWorkspace: boolean;
  shutdownTimeoutMs: number;
  sqlitePath: string;
}

function readCanonicalEnv(
  env: NodeJS.ProcessEnv,
  canonicalKey: string,
  legacyKey: string,
): string | undefined {
  return env[canonicalKey] ?? env[legacyKey];
}

function parseLogFormat(value: string | undefined): ApiLogFormat {
  const candidate = value ?? "auto";

  if (candidate === "auto" || candidate === "json" || candidate === "pretty") {
    return candidate;
  }

  throw new ConfigValidationError([
    "TALLY_LOG_FORMAT must be auto, json, or pretty.",
  ]);
}

function parsePersistenceBackend(value: string | undefined): ApiPersistenceBackend {
  const candidate = value ?? "sqlite";

  if (candidate === "json" || candidate === "postgres" || candidate === "sqlite") {
    return candidate;
  }

  throw new ConfigValidationError([
    "TALLY_API_PERSISTENCE_BACKEND must be json, sqlite, or postgres.",
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
    "TALLY_API_RUNTIME_MODE must be development, production, or test.",
  ]);
}

function parseUrlHost(value: string, fieldName: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new ConfigValidationError([`${fieldName} must use http or https.`]);
    }
    if (!parsed.host) {
      throw new ConfigValidationError([`${fieldName} must include a host.`]);
    }
    return parsed.host;
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      throw error;
    }
    throw new ConfigValidationError([`${fieldName} must be a valid URL.`]);
  }
}

function parseStringMapJson(raw: string, fieldName: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigValidationError([`${fieldName} must be valid JSON.`]);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ConfigValidationError([`${fieldName} must be a JSON object.`]);
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") {
      throw new ConfigValidationError([`${fieldName}.${key} must be a string.`]);
    }
    result[key] = value;
  }

  return result;
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
    throw new ConfigValidationError(["TALLY_API_AUTH_IDENTITIES must be valid JSON."]);
  }

  if (!Array.isArray(parsed)) {
    throw new ConfigValidationError(["TALLY_API_AUTH_IDENTITIES must be an array."]);
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
  const trustedActorHeader = readCanonicalEnv(
    env,
    "TALLY_API_AUTH_TRUSTED_ACTOR_HEADER",
    "GNUCASH_NG_API_AUTH_TRUSTED_ACTOR_HEADER",
  );
  const trustedProxyKey = readCanonicalEnv(
    env,
    "TALLY_API_AUTH_TRUSTED_PROXY_KEY",
    "GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY",
  );
  const trustedProxyKeyFile = readCanonicalEnv(
    env,
    "TALLY_API_AUTH_TRUSTED_PROXY_KEY_FILE",
    "GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY_FILE",
  );
  const trustedProxyKeyHeader = readCanonicalEnv(
    env,
    "TALLY_API_AUTH_TRUSTED_PROXY_KEY_HEADER",
    "GNUCASH_NG_API_AUTH_TRUSTED_PROXY_KEY_HEADER",
  );
  const trustedRoleHeader = readCanonicalEnv(
    env,
    "TALLY_API_AUTH_TRUSTED_ROLE_HEADER",
    "GNUCASH_NG_API_AUTH_TRUSTED_ROLE_HEADER",
  );
  const authToken = readCanonicalEnv(env, "TALLY_API_AUTH_TOKEN", "GNUCASH_NG_API_AUTH_TOKEN");
  const authIdentities = readCanonicalEnv(
    env,
    "TALLY_API_AUTH_IDENTITIES",
    "GNUCASH_NG_API_AUTH_IDENTITIES",
  );
  const authTokenFile = readCanonicalEnv(
    env,
    "TALLY_API_AUTH_TOKEN_FILE",
    "GNUCASH_NG_API_AUTH_TOKEN_FILE",
  );
  const authIdentitiesFile = readCanonicalEnv(
    env,
    "TALLY_API_AUTH_IDENTITIES_FILE",
    "GNUCASH_NG_API_AUTH_IDENTITIES_FILE",
  );

  const trustedHeaderRequested =
    trustedActorHeader !== undefined ||
    trustedProxyKey !== undefined ||
    trustedProxyKeyFile !== undefined ||
    trustedProxyKeyHeader !== undefined ||
    trustedRoleHeader !== undefined;

  const configuredSources = [
    authToken ? "TALLY_API_AUTH_TOKEN" : null,
    authIdentities ? "TALLY_API_AUTH_IDENTITIES" : null,
    authTokenFile ? "TALLY_API_AUTH_TOKEN_FILE" : null,
    authIdentitiesFile ? "TALLY_API_AUTH_IDENTITIES_FILE" : null,
    trustedHeaderRequested ? "trusted-header" : null,
  ].filter((value): value is string => value !== null);

  if (configuredSources.length > 1) {
    throw new ConfigValidationError([
      "Configure authentication with either TALLY_API_AUTH_TOKEN, TALLY_API_AUTH_IDENTITIES, TALLY_API_AUTH_TOKEN_FILE, TALLY_API_AUTH_IDENTITIES_FILE, or trusted-header auth settings, but not more than one.",
    ]);
  }

  if (trustedHeaderRequested) {
    const actorHeader = trustedActorHeader?.trim();

    if (!actorHeader) {
      throw new ConfigValidationError([
        "TALLY_API_AUTH_TRUSTED_ACTOR_HEADER is required for trusted-header auth.",
      ]);
    }

    const hasInlineProxyKey = Boolean(trustedProxyKey);
    const hasProxyKeyFile = Boolean(trustedProxyKeyFile);

    if (hasInlineProxyKey && hasProxyKeyFile) {
      throw new ConfigValidationError([
        "Configure trusted-header proxy key with either TALLY_API_AUTH_TRUSTED_PROXY_KEY or TALLY_API_AUTH_TRUSTED_PROXY_KEY_FILE, but not both.",
      ]);
    }

    if (!hasInlineProxyKey && !hasProxyKeyFile) {
      throw new ConfigValidationError([
        "Trusted-header auth requires TALLY_API_AUTH_TRUSTED_PROXY_KEY or TALLY_API_AUTH_TRUSTED_PROXY_KEY_FILE.",
      ]);
    }

    const proxyKeyHeader = trustedProxyKeyHeader?.trim() ?? "x-tally-auth-proxy-key";
    const roleHeader = trustedRoleHeader?.trim() ?? "x-tally-auth-role";

    if (proxyKeyHeader.length === 0 || roleHeader.length === 0) {
      throw new ConfigValidationError([
        "Trusted-header auth header names must not be empty.",
      ]);
    }

    const proxyKey = hasInlineProxyKey
      ? trustedProxyKey ?? ""
      : readSecretFile(
          trustedProxyKeyFile ?? "",
          "TALLY_API_AUTH_TRUSTED_PROXY_KEY_FILE",
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

  if (authIdentities) {
    return {
      authIdentities: parseAuthIdentitiesJson(authIdentities),
      authSource: "env",
      authStrategy: "identities",
      trustedHeaderAuth: undefined,
    };
  }

  if (authIdentitiesFile) {
    return {
      authIdentities: parseAuthIdentitiesJson(
        readSecretFile(authIdentitiesFile, "TALLY_API_AUTH_IDENTITIES_FILE"),
      ),
      authSource: "file",
      authStrategy: "identities",
      trustedHeaderAuth: undefined,
    };
  }

  if (authToken) {
    return {
      authIdentities: [{ actor: "api-user", role: "admin" as const, token: authToken }],
      authSource: "env",
      authStrategy: "token",
      trustedHeaderAuth: undefined,
    };
  }

  if (authTokenFile) {
    return {
      authIdentities: [
        {
          actor: "api-user",
          role: "admin" as const,
          token: readSecretFile(authTokenFile, "TALLY_API_AUTH_TOKEN_FILE"),
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
  const runtimeModeValue = readCanonicalEnv(
    env,
    "TALLY_API_RUNTIME_MODE",
    "GNUCASH_NG_API_RUNTIME_MODE",
  );
  const logFormatValue = readCanonicalEnv(env, "TALLY_LOG_FORMAT", "GNUCASH_NG_LOG_FORMAT");
  const portValue = readCanonicalEnv(env, "TALLY_API_PORT", "GNUCASH_NG_API_PORT");
  const hostValue = readCanonicalEnv(env, "TALLY_API_HOST", "GNUCASH_NG_API_HOST");
  const persistenceBackendValue = readCanonicalEnv(
    env,
    "TALLY_API_PERSISTENCE_BACKEND",
    "GNUCASH_NG_API_PERSISTENCE_BACKEND",
  );
  const dataDirectoryValue = readCanonicalEnv(env, "TALLY_DATA_DIR", "GNUCASH_NG_DATA_DIR");
  const bodyLimitBytesValue = readCanonicalEnv(
    env,
    "TALLY_API_BODY_LIMIT_BYTES",
    "GNUCASH_NG_API_BODY_LIMIT_BYTES",
  );
  const rateLimitWindowMsValue = readCanonicalEnv(
    env,
    "TALLY_API_RATE_LIMIT_WINDOW_MS",
    "GNUCASH_NG_API_RATE_LIMIT_WINDOW_MS",
  );
  const readLimitValue = readCanonicalEnv(
    env,
    "TALLY_API_RATE_LIMIT_READS",
    "GNUCASH_NG_API_RATE_LIMIT_READS",
  );
  const mutationLimitValue = readCanonicalEnv(
    env,
    "TALLY_API_RATE_LIMIT_MUTATIONS",
    "GNUCASH_NG_API_RATE_LIMIT_MUTATIONS",
  );
  const importLimitValue = readCanonicalEnv(
    env,
    "TALLY_API_RATE_LIMIT_IMPORTS",
    "GNUCASH_NG_API_RATE_LIMIT_IMPORTS",
  );
  const shutdownTimeoutMsValue = readCanonicalEnv(
    env,
    "TALLY_API_SHUTDOWN_TIMEOUT_MS",
    "GNUCASH_NG_API_SHUTDOWN_TIMEOUT_MS",
  );
  const seedDemoWorkspaceValue = readCanonicalEnv(
    env,
    "TALLY_API_SEED_DEMO_WORKSPACE",
    "GNUCASH_NG_API_SEED_DEMO_WORKSPACE",
  );
  const postgresUrlValue = readCanonicalEnv(
    env,
    "TALLY_API_POSTGRES_URL",
    "GNUCASH_NG_API_POSTGRES_URL",
  );
  const sqlitePathValue = readCanonicalEnv(
    env,
    "TALLY_API_SQLITE_PATH",
    "GNUCASH_NG_API_SQLITE_PATH",
  );
  const observabilityEnabledValue = readCanonicalEnv(
    env,
    "TALLY_API_OBSERVABILITY_ENABLED",
    "GNUCASH_NG_API_OBSERVABILITY_ENABLED",
  );
  const observabilityEndpointValue = readCanonicalEnv(
    env,
    "TALLY_API_OBSERVABILITY_OTLP_ENDPOINT",
    "GNUCASH_NG_API_OBSERVABILITY_OTLP_ENDPOINT",
  );
  const observabilityHeadersValue = readCanonicalEnv(
    env,
    "TALLY_API_OBSERVABILITY_OTLP_HEADERS",
    "GNUCASH_NG_API_OBSERVABILITY_OTLP_HEADERS",
  );
  const observabilityExportTimeoutValue = readCanonicalEnv(
    env,
    "TALLY_API_OBSERVABILITY_EXPORT_TIMEOUT_MS",
    "GNUCASH_NG_API_OBSERVABILITY_EXPORT_TIMEOUT_MS",
  );
  const observabilityMetricsIntervalValue = readCanonicalEnv(
    env,
    "TALLY_API_OBSERVABILITY_METRICS_EXPORT_INTERVAL_MS",
    "GNUCASH_NG_API_OBSERVABILITY_METRICS_EXPORT_INTERVAL_MS",
  );
  const observabilityServiceNameValue = readCanonicalEnv(
    env,
    "TALLY_API_OBSERVABILITY_SERVICE_NAME",
    "GNUCASH_NG_API_OBSERVABILITY_SERVICE_NAME",
  );
  const corsOriginValue = env["TALLY_CORS_ORIGIN"];

  const runtimeMode = parseRuntimeMode(
    runtimeModeValue,
    options.defaultRuntimeMode ?? "production",
  );
  const logFormat = parseLogFormat(logFormatValue);
  const port = parsePositiveInteger(portValue, 4000, "TALLY_API_PORT");
  const host = hostValue ?? "127.0.0.1";
  const persistenceBackend = parsePersistenceBackend(persistenceBackendValue);
  const dataDirectory = resolve(cwd, dataDirectoryValue ?? "data");
  const bodyLimitBytes = parsePositiveInteger(
    bodyLimitBytesValue,
    1048576,
    "TALLY_API_BODY_LIMIT_BYTES",
  );
  const rateLimitWindowMs = parsePositiveInteger(
    rateLimitWindowMsValue,
    60000,
    "TALLY_API_RATE_LIMIT_WINDOW_MS",
  );
  const readLimit = parsePositiveInteger(
    readLimitValue,
    120,
    "TALLY_API_RATE_LIMIT_READS",
  );
  const mutationLimit = parsePositiveInteger(
    mutationLimitValue,
    30,
    "TALLY_API_RATE_LIMIT_MUTATIONS",
  );
  const importLimit = parsePositiveInteger(
    importLimitValue,
    10,
    "TALLY_API_RATE_LIMIT_IMPORTS",
  );
  const shutdownTimeoutMs = parsePositiveInteger(
    shutdownTimeoutMsValue,
    10000,
    "TALLY_API_SHUTDOWN_TIMEOUT_MS",
  );
  const observabilityEnabled = parseBoolean(
    observabilityEnabledValue,
    false,
    "TALLY_API_OBSERVABILITY_ENABLED",
  );
  const observabilityServiceName = observabilityServiceNameValue?.trim() || "tally-api";
  if (observabilityServiceName.length === 0) {
    throw new ConfigValidationError(["TALLY_API_OBSERVABILITY_SERVICE_NAME must not be empty."]);
  }
  const observabilityExportTimeoutMs = parsePositiveInteger(
    observabilityExportTimeoutValue,
    10000,
    "TALLY_API_OBSERVABILITY_EXPORT_TIMEOUT_MS",
  );
  const observabilityMetricsExportIntervalMs = parsePositiveInteger(
    observabilityMetricsIntervalValue,
    60000,
    "TALLY_API_OBSERVABILITY_METRICS_EXPORT_INTERVAL_MS",
  );
  const observabilityHeaders =
    observabilityHeadersValue && observabilityHeadersValue.trim().length > 0
      ? parseStringMapJson(observabilityHeadersValue, "TALLY_API_OBSERVABILITY_OTLP_HEADERS")
      : {};
  const observabilityEndpoint = observabilityEndpointValue?.trim() ?? "";
  const observabilityEndpointHost =
    observabilityEndpoint.length > 0
      ? parseUrlHost(observabilityEndpoint, "TALLY_API_OBSERVABILITY_OTLP_ENDPOINT")
      : undefined;
  if (observabilityEnabled && observabilityEndpoint.length === 0) {
    throw new ConfigValidationError([
      "TALLY_API_OBSERVABILITY_OTLP_ENDPOINT is required when TALLY_API_OBSERVABILITY_ENABLED=true.",
    ]);
  }
  const authConfig = parseAuthConfig(env);
  const seedDemoWorkspace = parseBoolean(
    seedDemoWorkspaceValue,
    runtimeMode === "development",
    "TALLY_API_SEED_DEMO_WORKSPACE",
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
      "Production runtime cannot enable TALLY_API_SEED_DEMO_WORKSPACE.",
    ]);
  }

  const postgresUrl = postgresUrlValue ?? "";

  if (persistenceBackend === "postgres" && postgresUrl.length === 0) {
    throw new ConfigValidationError([
      "TALLY_API_POSTGRES_URL is required when TALLY_API_PERSISTENCE_BACKEND=postgres.",
    ]);
  }

  const corsAllowedOrigins = corsOriginValue
    ? corsOriginValue.split(",").map((o) => o.trim()).filter((o) => o.length > 0)
    : [];

  return {
    authIdentities: authConfig.authIdentities,
    authSource: authConfig.authSource,
    authStrategy: authConfig.authStrategy,
    bodyLimitBytes,
    corsAllowedOrigins,
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
    observability: {
      enabled: observabilityEnabled,
      exportTimeoutMs: observabilityExportTimeoutMs,
      metricsExportIntervalMs: observabilityMetricsExportIntervalMs,
      otlpEndpoint: observabilityEndpoint,
      otlpEndpointHost: observabilityEndpointHost,
      otlpHeaders: observabilityHeaders,
      serviceName: observabilityServiceName,
    },
    trustedHeaderAuth: authConfig.trustedHeaderAuth,
    seedDemoWorkspace,
    shutdownTimeoutMs,
    sqlitePath: resolve(dataDirectory, sqlitePathValue ?? "workspaces.sqlite"),
  };
}
