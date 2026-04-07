import type { Server } from "node:http";
import { createConsoleSink, createLogger, type ConsoleLogFormat, type Logger } from "@tally-core/logging";
import { createApiRuntimeConfig, type ApiRuntimeConfig, type ApiRuntimeMode } from "./config";
import { ConfigValidationError } from "./errors";
import { createHttpHandler, createNodeHttpServer } from "./http";
import { createWorkspacePersistenceBackend } from "./persistence";
import { createInMemoryRateLimiter } from "./rate-limit";
import { createWorkspaceRepository } from "./repository";
import { createWorkspaceService } from "./service";
import { ensureDemoWorkspaceFile } from "./dev-seed";

export interface ApiRuntime {
  config: ApiRuntimeConfig;
  shutdown(signal?: string): Promise<void>;
  start(): Promise<void>;
}

interface RuntimeServer {
  close(callback: (error?: Error | null) => void): void;
  listen(port: number, host: string, callback: () => void): void;
}

function resolveConsoleLogFormat(config: ApiRuntimeConfig): ConsoleLogFormat {
  if (config.logFormat === "json" || config.logFormat === "pretty") {
    return config.logFormat;
  }

  return process.stdout.isTTY === true ? "pretty" : "json";
}

function createRuntimeLogger(config: ApiRuntimeConfig, env: NodeJS.ProcessEnv): Logger {
  const minLevel =
    (env.TALLY_LOG_LEVEL ?? env.GNUCASH_NG_LOG_LEVEL) as
      | "debug"
      | "info"
      | "warn"
      | "error"
      | undefined;

  return createLogger({
    minLevel,
    sink: createConsoleSink({ format: resolveConsoleLogFormat(config) }),
    service: "tally-api",
  }).child({
    dataDirectory: config.dataDirectory,
    host: config.host,
    persistenceBackend: config.persistenceBackend,
    port: config.port,
    postgresConfigured: config.persistenceBackend === "postgres",
    runtimeMode: config.runtimeMode,
    sqlitePath: config.persistenceBackend === "sqlite" ? config.sqlitePath : undefined,
  });
}

function logRuntimeConfiguration(logger: Logger, config: ApiRuntimeConfig): void {
  logger.info("api runtime configured", {
    authConfigured: config.authStrategy !== "none",
    authIdentityCount: config.authIdentities.length,
    authSource: config.authSource,
    authStrategy: config.authStrategy,
    bodyLimitBytes: config.bodyLimitBytes,
    dataDirectory: config.dataDirectory,
    host: config.host,
    persistenceBackend: config.persistenceBackend,
    port: config.port,
    postgresConfigured: config.persistenceBackend === "postgres",
    rateLimitImport: config.rateLimit.importLimit,
    rateLimitMutation: config.rateLimit.mutationLimit,
    rateLimitRead: config.rateLimit.readLimit,
    rateLimitWindowMs: config.rateLimit.windowMs,
    runtimeMode: config.runtimeMode,
    seedDemoWorkspace: config.seedDemoWorkspace,
    shutdownTimeoutMs: config.shutdownTimeoutMs,
    sqlitePath: config.persistenceBackend === "sqlite" ? config.sqlitePath : undefined,
  });
}

export function createApiRuntime(params: {
  config: ApiRuntimeConfig;
  createServer?: (input: {
    handler: ReturnType<typeof createHttpHandler>;
    logger: Logger;
  }) => RuntimeServer;
  ensureSeed?: typeof ensureDemoWorkspaceFile;
  env?: NodeJS.ProcessEnv;
  logger?: Logger;
}): ApiRuntime {
  const logger = params.logger ?? createRuntimeLogger(params.config, params.env ?? process.env);
  const persistenceBackend = createWorkspacePersistenceBackend({
    config: params.config,
    logger,
  });
  const repository = createWorkspaceRepository({
    backend: persistenceBackend,
    logger,
  });
  const service = createWorkspaceService({ logger, repository });
  const handler = createHttpHandler({
    authRequired: params.config.authStrategy !== "none",
    authIdentities: params.config.authIdentities,
    logger,
    maxBodyBytes: params.config.bodyLimitBytes,
    readinessProbe: async ({ logger: probeLogger }) => {
      try {
        await persistenceBackend.listWorkspaceIds({
          logger: probeLogger.child({
            component: "apiReadinessProbe",
            operation: "listWorkspaceIds",
            persistenceBackend: persistenceBackend.kind,
          }),
        });

        return {
          details: {
            persistenceBackend: persistenceBackend.kind,
          },
          ok: true,
        };
      } catch (error) {
        probeLogger.warn("readiness probe failed", {
          error: error instanceof Error ? error.message : String(error),
          persistenceBackend: persistenceBackend.kind,
        });

        return {
          details: {
            persistenceBackend: persistenceBackend.kind,
          },
          ok: false,
        };
      }
    },
    rateLimiter: createInMemoryRateLimiter(),
    rateLimitPolicy: {
      import: {
        keyPrefix: "import",
        limit: params.config.rateLimit.importLimit,
        windowMs: params.config.rateLimit.windowMs,
      },
      mutation: {
        keyPrefix: "mutation",
        limit: params.config.rateLimit.mutationLimit,
        windowMs: params.config.rateLimit.windowMs,
      },
      read: {
        keyPrefix: "read",
        limit: params.config.rateLimit.readLimit,
        windowMs: params.config.rateLimit.windowMs,
      },
    },
    service,
    trustedHeaderAuth: params.config.trustedHeaderAuth,
  });
  const server = (params.createServer ?? createNodeHttpServer)({ handler, logger });
  const ensureSeed = params.ensureSeed ?? ensureDemoWorkspaceFile;
  let started = false;
  let shutdownPromise: Promise<void> | null = null;

  return {
    config: params.config,

    async start(): Promise<void> {
      if (started) {
        return;
      }

      logRuntimeConfiguration(logger, params.config);

      if (params.config.seedDemoWorkspace) {
        await ensureSeed({
          dataDirectory: params.config.dataDirectory,
          logger,
        });
      }

      await new Promise<void>((resolve) => {
        server.listen(params.config.port, params.config.host, () => resolve());
      });

      started = true;
      logger.info("api server listening", {
        demoWorkspaceSeeded: params.config.seedDemoWorkspace,
      });
    },

    async shutdown(signal?: string): Promise<void> {
      if (!started) {
        return;
      }

      if (shutdownPromise) {
        return shutdownPromise;
      }

      logger.info("api server shutdown started", {
        signal: signal ?? "manual",
      });

      shutdownPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("API server shutdown timed out."));
        }, params.config.shutdownTimeoutMs);

        server.close((error) => {
          const finalizeShutdown = async () => {
            clearTimeout(timeout);

            if (error) {
              reject(error);
              return;
            }

            started = false;
            if (persistenceBackend.close) {
              await persistenceBackend.close();
            }
            logger.info("api server shutdown completed", {
              signal: signal ?? "manual",
            });
            resolve();
          };

          void finalizeShutdown().catch(reject);
        });
      });

      return shutdownPromise;
    },
  };
}

export async function runApiRuntime(params: {
  cwd?: string;
  defaultRuntimeMode: ApiRuntimeMode;
  env?: NodeJS.ProcessEnv;
  exit?: (code: number) => never;
  installSignalHandlers?: boolean;
}): Promise<ApiRuntime> {
  const env = params.env ?? process.env;
  const config = createApiRuntimeConfig(env, params.cwd ?? process.cwd(), {
    defaultRuntimeMode: params.defaultRuntimeMode,
  });
  const runtime = createApiRuntime({
    config,
    env,
  });

  await runtime.start();

  if (params.installSignalHandlers !== false) {
    let shuttingDown = false;

    const shutdownForSignal = async (signal: "SIGINT" | "SIGTERM") => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;

      try {
        await runtime.shutdown(signal);
        (params.exit ?? process.exit)(0);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        (params.exit ?? process.exit)(1);
      }
    };

    process.once("SIGINT", () => {
      void shutdownForSignal("SIGINT");
    });
    process.once("SIGTERM", () => {
      void shutdownForSignal("SIGTERM");
    });
  }

  return runtime;
}

export async function runApiRuntimeFromCli(params: {
  cwd?: string;
  defaultRuntimeMode: ApiRuntimeMode;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  try {
    await runApiRuntime(params);
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      console.error(error.message);
      process.exit(1);
    }

    throw error;
  }
}
