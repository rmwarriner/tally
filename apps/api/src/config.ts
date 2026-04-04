import { resolve } from "node:path";
import { ConfigValidationError } from "./errors";

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
  rateLimit: {
    importLimit: number;
    mutationLimit: number;
    readLimit: number;
    windowMs: number;
  };
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

export function createApiRuntimeConfig(env: NodeJS.ProcessEnv, cwd = process.cwd()): ApiRuntimeConfig {
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
  const authIdentities = parseAuthIdentities(env);

  if (!isLoopbackHost(host) && authIdentities.length === 0) {
    throw new ConfigValidationError([
      "Non-loopback API binding requires GNUCASH_NG_API_AUTH_TOKEN or GNUCASH_NG_API_AUTH_IDENTITIES.",
    ]);
  }

  return {
    authIdentities,
    bodyLimitBytes,
    dataDirectory: resolve(cwd, env.GNUCASH_NG_DATA_DIR ?? "data"),
    host,
    port,
    rateLimit: {
      importLimit,
      mutationLimit,
      readLimit,
      windowMs: rateLimitWindowMs,
    },
  };
}
