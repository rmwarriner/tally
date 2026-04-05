import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createLogger, type Logger } from "@gnucash-ng/logging";
import { migrateWorkspaceDocument, type FinanceWorkspaceDocument } from "@gnucash-ng/workspace";
import { ConfigValidationError } from "./errors";
import {
  copyAllWorkspacesBetweenBackends,
  copyWorkspaceBetweenBackends,
  createWorkspacePersistenceBackendFromOptions,
  exportWorkspaceDocument,
  importWorkspaceDocument,
  type PersistenceCopyManyResult,
  type PersistenceCopyResult,
  type PersistenceExportResult,
  type PersistenceImportResult,
  type WorkspacePersistenceOptions,
} from "./persistence";

interface ParsedFlags {
  booleans: Set<string>;
  values: Map<string, string>;
}

export type PersistenceAdminCommand =
  | {
      backupTarget: boolean;
      command: "copy";
      dryRun: boolean;
      reportPath?: string;
      rollbackOnFailure: boolean;
      skipValidation: boolean;
      source: WorkspacePersistenceOptions;
      target: WorkspacePersistenceOptions;
      targetWorkspaceId?: string;
      workspaceId: string;
    }
  | {
      backupTarget: boolean;
      command: "copy-all";
      dryRun: boolean;
      reportPath?: string;
      rollbackOnFailure: boolean;
      skipValidation: boolean;
      source: WorkspacePersistenceOptions;
      target: WorkspacePersistenceOptions;
    }
  | {
      command: "export";
      dryRun: boolean;
      outputPath: string;
      reportPath?: string;
      skipValidation: boolean;
      source: WorkspacePersistenceOptions;
      workspaceId: string;
    }
  | {
      backupTarget: boolean;
      command: "import";
      dryRun: boolean;
      inputPath: string;
      reportPath?: string;
      rollbackOnFailure: boolean;
      skipValidation: boolean;
      target: WorkspacePersistenceOptions;
      targetWorkspaceId?: string;
      workspaceId: string;
    };

function parseFlags(argv: string[]): ParsedFlags {
  const booleans = new Set<string>();
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current?.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const value = argv[index + 1];

    if (!value || value.startsWith("--")) {
      booleans.add(key);
      continue;
    }

    values.set(key, value);
    index += 1;
  }

  return {
    booleans,
    values,
  };
}

function readRequired(flags: ParsedFlags, key: string): string {
  const value = flags.values.get(key);

  if (!value) {
    throw new ConfigValidationError([`--${key} is required.`]);
  }

  return value;
}

function readBackendOptions(flags: ParsedFlags, prefix: "source" | "target" | "backend"): WorkspacePersistenceOptions {
  const backendKey = prefix === "backend" ? "backend" : `${prefix}-backend`;
  const dataDirKey = prefix === "backend" ? "data-dir" : `${prefix}-data-dir`;
  const sqlitePathKey = prefix === "backend" ? "sqlite-path" : `${prefix}-sqlite-path`;
  const postgresUrlKey = prefix === "backend" ? "postgres-url" : `${prefix}-postgres-url`;
  const persistenceBackend = readRequired(flags, backendKey);

  if (persistenceBackend !== "json" && persistenceBackend !== "sqlite" && persistenceBackend !== "postgres") {
    throw new ConfigValidationError([`--${backendKey} must be json, sqlite, or postgres.`]);
  }

  const dataDirectory = resolve(flags.values.get(dataDirKey) ?? "./data");
  const sqlitePath = resolve(flags.values.get(sqlitePathKey) ?? `${dataDirectory}/workspaces.sqlite`);
  const postgresUrl = flags.values.get(postgresUrlKey) ?? "";

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

function readBooleanFlag(flags: ParsedFlags, key: string): boolean {
  return flags.booleans.has(key);
}

async function writeReportFile(reportPath: string | undefined, report: unknown): Promise<void> {
  if (!reportPath) {
    return;
  }

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function buildAdminReport(params: {
  command: PersistenceAdminCommand["command"];
  result: PersistenceCopyManyResult | PersistenceCopyResult | PersistenceExportResult | PersistenceImportResult;
}): Record<string, unknown> {
  return {
    command: params.command,
    generatedAt: new Date().toISOString(),
    ...params.result,
  };
}

export function parsePersistenceAdminCommand(argv: string[]): PersistenceAdminCommand {
  const [commandName] = argv;
  const flags = parseFlags(argv.slice(1));

  if (commandName !== "copy" && commandName !== "copy-all" && commandName !== "export" && commandName !== "import") {
    throw new ConfigValidationError([
      "Persistence admin command must be one of: copy, copy-all, export, import.",
    ]);
  }

  if (commandName === "copy") {
    return {
      backupTarget: readBooleanFlag(flags, "backup-target"),
      command: "copy",
      dryRun: readBooleanFlag(flags, "dry-run"),
      reportPath: flags.values.get("report-path") ? resolve(flags.values.get("report-path") as string) : undefined,
      rollbackOnFailure: readBooleanFlag(flags, "rollback-on-failure"),
      skipValidation: readBooleanFlag(flags, "skip-validation"),
      source: readBackendOptions(flags, "source"),
      target: readBackendOptions(flags, "target"),
      targetWorkspaceId: flags.values.get("target-workspace-id"),
      workspaceId: readRequired(flags, "workspace-id"),
    };
  }

  if (commandName === "copy-all") {
    return {
      backupTarget: readBooleanFlag(flags, "backup-target"),
      command: "copy-all",
      dryRun: readBooleanFlag(flags, "dry-run"),
      reportPath: flags.values.get("report-path") ? resolve(flags.values.get("report-path") as string) : undefined,
      rollbackOnFailure: readBooleanFlag(flags, "rollback-on-failure"),
      skipValidation: readBooleanFlag(flags, "skip-validation"),
      source: readBackendOptions(flags, "source"),
      target: readBackendOptions(flags, "target"),
    };
  }

  if (commandName === "export") {
    return {
      command: "export",
      dryRun: readBooleanFlag(flags, "dry-run"),
      outputPath: resolve(readRequired(flags, "output")),
      reportPath: flags.values.get("report-path") ? resolve(flags.values.get("report-path") as string) : undefined,
      skipValidation: readBooleanFlag(flags, "skip-validation"),
      source: readBackendOptions(flags, "backend"),
      workspaceId: readRequired(flags, "workspace-id"),
    };
  }

  return {
    backupTarget: readBooleanFlag(flags, "backup-target"),
    command: "import",
    dryRun: readBooleanFlag(flags, "dry-run"),
    inputPath: resolve(readRequired(flags, "input")),
    reportPath: flags.values.get("report-path") ? resolve(flags.values.get("report-path") as string) : undefined,
    rollbackOnFailure: readBooleanFlag(flags, "rollback-on-failure"),
    skipValidation: readBooleanFlag(flags, "skip-validation"),
    target: readBackendOptions(flags, "backend"),
    targetWorkspaceId: flags.values.get("target-workspace-id"),
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

  if (command.command === "copy" || command.command === "copy-all") {
    const source = createWorkspacePersistenceBackendFromOptions({
      logger,
      options: command.source,
    });
    const target = createWorkspacePersistenceBackendFromOptions({
      logger,
      options: command.target,
    });

    try {
      if (command.command === "copy-all") {
        const result = await copyAllWorkspacesBetweenBackends({
          backupTarget: command.backupTarget,
          dryRun: command.dryRun,
          logger,
          rollbackOnFailure: command.rollbackOnFailure,
          source,
          target,
          validate: !command.skipValidation,
        });
        await writeReportFile(command.reportPath, buildAdminReport({ command: command.command, result }));
        logger.info("persistence workspace copy-all completed", {
          dryRun: result.dryRun,
          sourceBackend: command.source.persistenceBackend,
          targetBackend: command.target.persistenceBackend,
          workspaceCount: result.workspaceIds.length,
        });
      } else {
        const result = await copyWorkspaceBetweenBackends({
          backupTarget: command.backupTarget,
          dryRun: command.dryRun,
          logger,
          rollbackOnFailure: command.rollbackOnFailure,
          source,
          sourceWorkspaceId: command.workspaceId,
          target,
          targetWorkspaceId: command.targetWorkspaceId,
          validate: !command.skipValidation,
        });
        await writeReportFile(command.reportPath, buildAdminReport({ command: command.command, result }));
        logger.info("persistence workspace copy completed", {
          dryRun: result.dryRun,
          sourceValidationOk: result.sourceValidation?.ok,
          sourceBackend: command.source.persistenceBackend,
          targetBackupId: result.targetBackupId,
          targetBackend: command.target.persistenceBackend,
          targetWorkspaceId: command.targetWorkspaceId ?? command.workspaceId,
          targetValidationOk: result.targetWorkspaceValidation?.ok,
          targetWorkspaceWasPresent: result.targetWorkspaceWasPresent,
          workspaceId: command.workspaceId,
        });
      }
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
      const result = await exportWorkspaceDocument({
        backend: source,
        dryRun: command.dryRun,
        logger,
        validate: !command.skipValidation,
        workspaceId: command.workspaceId,
      });
      await writeReportFile(command.reportPath, buildAdminReport({ command: "export", result }));

      if (!command.dryRun) {
        await mkdir(dirname(command.outputPath), { recursive: true });
        await writeFile(command.outputPath, `${JSON.stringify(result.document, null, 2)}\n`, "utf8");
      }

      logger.info("persistence workspace export completed", {
        dryRun: result.dryRun,
        outputPath: command.outputPath,
        sourceBackend: command.source.persistenceBackend,
        validationOk: result.validation?.ok,
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
    const result = await importWorkspaceDocument({
      backend: target,
      backupTarget: command.backupTarget,
      document,
      dryRun: command.dryRun,
      logger,
      rollbackOnFailure: command.rollbackOnFailure,
      validate: !command.skipValidation,
    });
    await writeReportFile(command.reportPath, buildAdminReport({ command: "import", result }));
    logger.info("persistence workspace import completed", {
      dryRun: result.dryRun,
      inputPath: command.inputPath,
      targetBackupId: result.targetBackupId,
      targetBackend: command.target.persistenceBackend,
      targetWorkspaceId: document.id,
      targetValidationOk: result.targetWorkspaceValidation?.ok,
      targetWorkspaceWasPresent: result.targetWorkspaceWasPresent,
      validationOk: result.validation?.ok,
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
