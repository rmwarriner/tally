import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createLogger, type Logger } from "@gnucash-ng/logging";
import { migrateWorkspaceDocument, type FinanceWorkspaceDocument } from "@gnucash-ng/workspace";
import { ConfigValidationError } from "./errors";
import {
  copyWorkspaceBetweenBackends,
  createWorkspacePersistenceBackendFromOptions,
  exportWorkspaceDocument,
  importWorkspaceDocument,
  type WorkspacePersistenceOptions,
} from "./persistence";

export type PersistenceAdminCommand =
  | {
      command: "copy";
      source: WorkspacePersistenceOptions;
      target: WorkspacePersistenceOptions;
      targetWorkspaceId?: string;
      workspaceId: string;
    }
  | {
      command: "export";
      outputPath: string;
      source: WorkspacePersistenceOptions;
      workspaceId: string;
    }
  | {
      command: "import";
      inputPath: string;
      target: WorkspacePersistenceOptions;
      targetWorkspaceId?: string;
      workspaceId: string;
    };

function parseFlagMap(argv: string[]): Map<string, string> {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current?.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const value = argv[index + 1];

    if (!value || value.startsWith("--")) {
      throw new ConfigValidationError([`Missing value for --${key}.`]);
    }

    values.set(key, value);
    index += 1;
  }

  return values;
}

function readRequired(flags: Map<string, string>, key: string): string {
  const value = flags.get(key);

  if (!value) {
    throw new ConfigValidationError([`--${key} is required.`]);
  }

  return value;
}

function readBackendOptions(flags: Map<string, string>, prefix: "source" | "target" | "backend"): WorkspacePersistenceOptions {
  const backendKey = prefix === "backend" ? "backend" : `${prefix}-backend`;
  const dataDirKey = prefix === "backend" ? "data-dir" : `${prefix}-data-dir`;
  const sqlitePathKey = prefix === "backend" ? "sqlite-path" : `${prefix}-sqlite-path`;
  const postgresUrlKey = prefix === "backend" ? "postgres-url" : `${prefix}-postgres-url`;
  const persistenceBackend = readRequired(flags, backendKey);

  if (persistenceBackend !== "json" && persistenceBackend !== "sqlite" && persistenceBackend !== "postgres") {
    throw new ConfigValidationError([`--${backendKey} must be json, sqlite, or postgres.`]);
  }

  const dataDirectory = resolve(flags.get(dataDirKey) ?? "./data");
  const sqlitePath = resolve(flags.get(sqlitePathKey) ?? `${dataDirectory}/workspaces.sqlite`);
  const postgresUrl = flags.get(postgresUrlKey) ?? "";

  if (persistenceBackend === "postgres" && postgresUrl.length === 0) {
    throw new ConfigValidationError([`--${postgresUrlKey} is required when --${backendKey}=postgres.`]);
  }

  return {
    dataDirectory,
    persistenceBackend,
    postgresUrl,
    sqlitePath,
  };
}

export function parsePersistenceAdminCommand(argv: string[]): PersistenceAdminCommand {
  const [commandName] = argv;
  const flags = parseFlagMap(argv.slice(1));

  if (commandName !== "copy" && commandName !== "export" && commandName !== "import") {
    throw new ConfigValidationError([
      "Persistence admin command must be one of: copy, export, import.",
    ]);
  }

  if (commandName === "copy") {
    return {
      command: "copy",
      source: readBackendOptions(flags, "source"),
      target: readBackendOptions(flags, "target"),
      targetWorkspaceId: flags.get("target-workspace-id"),
      workspaceId: readRequired(flags, "workspace-id"),
    };
  }

  if (commandName === "export") {
    return {
      command: "export",
      outputPath: resolve(readRequired(flags, "output")),
      source: readBackendOptions(flags, "backend"),
      workspaceId: readRequired(flags, "workspace-id"),
    };
  }

  return {
    command: "import",
    inputPath: resolve(readRequired(flags, "input")),
    target: readBackendOptions(flags, "backend"),
    targetWorkspaceId: flags.get("target-workspace-id"),
    workspaceId: readRequired(flags, "workspace-id"),
  };
}

export async function runPersistenceAdminCommand(params: {
  argv: string[];
  logger?: Logger;
}): Promise<void> {
  const command = parsePersistenceAdminCommand(params.argv);
  const logger =
    params.logger ??
    createLogger({
      minLevel: "info",
      service: "gnucash-ng-persistence-admin",
    });

  if (command.command === "copy") {
    const source = createWorkspacePersistenceBackendFromOptions({
      logger,
      options: command.source,
    });
    const target = createWorkspacePersistenceBackendFromOptions({
      logger,
      options: command.target,
    });

    try {
      await copyWorkspaceBetweenBackends({
        logger,
        source,
        sourceWorkspaceId: command.workspaceId,
        target,
        targetWorkspaceId: command.targetWorkspaceId,
      });
      logger.info("persistence workspace copy completed", {
        sourceBackend: command.source.persistenceBackend,
        targetBackend: command.target.persistenceBackend,
        targetWorkspaceId: command.targetWorkspaceId ?? command.workspaceId,
        workspaceId: command.workspaceId,
      });
    } finally {
      await Promise.all([source.close?.(), target.close?.()]);
    }

    return;
  }

  if (command.command === "export") {
    const source = createWorkspacePersistenceBackendFromOptions({
      logger,
      options: command.source,
    });

    try {
      const document = await exportWorkspaceDocument({
        backend: source,
        logger,
        workspaceId: command.workspaceId,
      });
      await mkdir(dirname(command.outputPath), { recursive: true });
      await writeFile(command.outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
      logger.info("persistence workspace export completed", {
        outputPath: command.outputPath,
        sourceBackend: command.source.persistenceBackend,
        workspaceId: command.workspaceId,
      });
    } finally {
      await source.close?.();
    }

    return;
  }

  const target = createWorkspacePersistenceBackendFromOptions({
    logger,
    options: command.target,
  });

  try {
    const raw = await readFile(command.inputPath, "utf8");
    const importedDocument = migrateWorkspaceDocument(JSON.parse(raw) as unknown);
    const document =
      command.targetWorkspaceId && command.targetWorkspaceId !== importedDocument.id
        ? {
            ...importedDocument,
            id: command.targetWorkspaceId,
          }
        : importedDocument;
    await importWorkspaceDocument({
      backend: target,
      document,
      logger,
    });
    logger.info("persistence workspace import completed", {
      inputPath: command.inputPath,
      targetBackend: command.target.persistenceBackend,
      targetWorkspaceId: document.id,
      workspaceId: command.workspaceId,
    });
  } finally {
    await target.close?.();
  }
}

export async function runPersistenceAdminFromCli(params: {
  argv?: string[];
  logger?: Logger;
} = {}): Promise<void> {
  try {
    await runPersistenceAdminCommand({
      argv: params.argv ?? process.argv.slice(2),
      logger: params.logger,
    });
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      console.error(error.message);
      process.exit(1);
    }

    throw error;
  }
}
