import { resolve } from "node:path";
import { ConfigValidationError } from "./errors";

export type ApiRuntimeMode = "development" | "production" | "test";

export interface ApiRuntimeConfig {
  authIdentities: Array<{
    actor: string;
    role: "admin" | "member";
    token: string;
  }>;
  bodyLimitBytes: number;
  dataDirectory: string;
  host: string;
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

function parseAuthIdentities(env: NodeJS.ProcessEnv): ApiRuntimeConfig["authIdentities"] {
  if (env.GNUCASH_NG_API_AUTH_IDENTITIES) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(env.GNUCASH_NG_API_AUTH_IDENTITIES);
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

  if (env.GNUCASH_NG_API_AUTH_TOKEN) {
    return [{ actor: "api-user", role: "admin" as const, token: env.GNUCASH_NG_API_AUTH_TOKEN }];
  }

  return [];
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
  const authIdentities = parseAuthIdentities(env);
  const seedDemoWorkspace = parseBoolean(
    env.GNUCASH_NG_API_SEED_DEMO_WORKSPACE,
    runtimeMode === "development",
    "GNUCASH_NG_API_SEED_DEMO_WORKSPACE",
  );

  if (!isLoopbackHost(host) && authIdentities.length === 0) {
    throw new ConfigValidationError([
      "Non-loopback API binding requires GNUCASH_NG_API_AUTH_TOKEN or GNUCASH_NG_API_AUTH_IDENTITIES.",
    ]);
  }

  if (runtimeMode === "production" && authIdentities.length === 0) {
    throw new ConfigValidationError([
      "Production runtime requires GNUCASH_NG_API_AUTH_TOKEN or GNUCASH_NG_API_AUTH_IDENTITIES.",
    ]);
  }

  if (runtimeMode === "production" && seedDemoWorkspace) {
    throw new ConfigValidationError([
      "Production runtime cannot enable GNUCASH_NG_API_SEED_DEMO_WORKSPACE.",
    ]);
  }

  return {
    authIdentities,
    bodyLimitBytes,
    dataDirectory: resolve(cwd, env.GNUCASH_NG_DATA_DIR ?? "data"),
    host,
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
