import { createLogger } from "@gnucash-ng/logging";
import { createApiRuntimeConfig } from "./config";
import { ConfigValidationError } from "./errors";
import { createHttpHandler, createNodeHttpServer } from "./http";
import { createInMemoryRateLimiter } from "./rate-limit";
import { createFileSystemWorkspaceRepository } from "./repository";
import { createWorkspaceService } from "./service";

try {
  const config = createApiRuntimeConfig(process.env);
  const logger = createLogger({
    minLevel: process.env.GNUCASH_NG_LOG_LEVEL as "debug" | "info" | "warn" | "error" | undefined,
    service: "gnucash-ng-api",
  }).child({
    dataDirectory: config.dataDirectory,
    host: config.host,
    port: config.port,
  });

  const repository = createFileSystemWorkspaceRepository({
    logger,
    rootDirectory: config.dataDirectory,
  });
  const service = createWorkspaceService({ logger, repository });
  const handler = createHttpHandler({
    authIdentities: config.authIdentities,
    logger,
    maxBodyBytes: config.bodyLimitBytes,
    rateLimiter: createInMemoryRateLimiter(),
    rateLimitPolicy: {
      import: {
        keyPrefix: "import",
        limit: config.rateLimit.importLimit,
        windowMs: config.rateLimit.windowMs,
      },
      mutation: {
        keyPrefix: "mutation",
        limit: config.rateLimit.mutationLimit,
        windowMs: config.rateLimit.windowMs,
      },
      read: {
        keyPrefix: "read",
        limit: config.rateLimit.readLimit,
        windowMs: config.rateLimit.windowMs,
      },
    },
    service,
  });
  const server = createNodeHttpServer({ handler, logger });

  server.listen(config.port, config.host, () => {
    logger.info("api server listening");
  });
} catch (error) {
  if (error instanceof ConfigValidationError) {
    console.error(error.message);
    process.exit(1);
  }

  throw error;
}
