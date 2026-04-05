import type { Logger } from "@gnucash-ng/logging";
import type { FinanceWorkspaceDocument } from "@gnucash-ng/workspace";
import type { ApiPersistenceBackend, ApiRuntimeConfig } from "./config";
import { ApiError } from "./errors";
import { createFileSystemWorkspacePersistenceBackend } from "./persistence-json";
import { createPostgresWorkspacePersistenceBackend } from "./persistence-postgres";
import { createSqliteWorkspacePersistenceBackend } from "./persistence-sqlite";
import {
  validateWorkspaceDocumentForPersistence,
  type WorkspaceValidationReport,
} from "./persistence-validation";

export type WorkspacePersistenceBackendKind = "json" | "postgres" | "sqlite";

export interface WorkspaceBackup {
  createdAt: string;
  fileName: string;
  id: string;
  sizeBytes: number;
  workspaceId: string;
}

export interface WorkspacePersistenceBackend {
  close?(): Promise<void>;
  kind: WorkspacePersistenceBackendKind;
  createBackup(workspaceId: string, options?: { logger?: Logger }): Promise<WorkspaceBackup>;
  listWorkspaceIds(options?: { logger?: Logger }): Promise<string[]>;
  listBackups(workspaceId: string, options?: { logger?: Logger }): Promise<WorkspaceBackup[]>;
  load(workspaceId: string, options?: { logger?: Logger }): Promise<FinanceWorkspaceDocument>;
  restoreBackup(
    workspaceId: string,
    backupId: string,
    options?: { logger?: Logger },
  ): Promise<FinanceWorkspaceDocument>;
  save(document: FinanceWorkspaceDocument, options?: { logger?: Logger }): Promise<void>;
}

export interface WorkspacePersistenceOptions {
  dataDirectory: string;
  persistenceBackend: ApiPersistenceBackend;
  postgresUrl: string;
  sqlitePath: string;
}

export interface PersistenceCopyResult {
  dryRun: boolean;
  rolledBack: boolean;
  sourceValidation?: WorkspaceValidationReport;
  targetBackupId?: string;
  targetWorkspaceId: string;
  targetWorkspaceValidation?: WorkspaceValidationReport;
  targetWorkspaceWasPresent: boolean;
  workspaceId: string;
}

export type PersistenceCopyManyOnError = "continue" | "halt";

export interface PersistenceCopyFailure {
  code?: string;
  message: string;
  status?: number;
  workspaceId: string;
}

export interface PersistenceCopyManyResult {
  dryRun: boolean;
  failureCount: number;
  failures: PersistenceCopyFailure[];
  halted: boolean;
  onError: PersistenceCopyManyOnError;
  results: PersistenceCopyResult[];
  successCount: number;
  workspaceIds: string[];
}

export interface PersistenceExportResult {
  document: FinanceWorkspaceDocument;
  dryRun: boolean;
  validation?: WorkspaceValidationReport;
}

export interface PersistenceImportResult {
  dryRun: boolean;
  rolledBack: boolean;
  targetBackupId?: string;
  targetWorkspaceValidation?: WorkspaceValidationReport;
  targetWorkspaceWasPresent: boolean;
  workspaceId: string;
  validation?: WorkspaceValidationReport;
}

export interface PersistenceWriteOptions {
  backupTarget?: boolean;
  dryRun?: boolean;
  logger?: Logger;
  rollbackOnFailure?: boolean;
  validate?: boolean;
}

async function loadWorkspaceIfExists(params: {
  backend: WorkspacePersistenceBackend;
  logger?: Logger;
  workspaceId: string;
}): Promise<FinanceWorkspaceDocument | undefined> {
  try {
    return await params.backend.load(params.workspaceId, { logger: params.logger });
  } catch (error) {
    if (error instanceof ApiError && error.code === "workspace.not_found") {
      return undefined;
    }

    throw error;
  }
}

export function createWorkspacePersistenceBackendFromOptions(params: {
  logger?: Logger;
  options: WorkspacePersistenceOptions;
}): WorkspacePersistenceBackend {
  if (params.options.persistenceBackend === "postgres") {
    return createPostgresWorkspacePersistenceBackend({
      logger: params.logger,
      postgresUrl: params.options.postgresUrl,
    });
  }

  if (params.options.persistenceBackend === "sqlite") {
    return createSqliteWorkspacePersistenceBackend({
      databasePath: params.options.sqlitePath,
      logger: params.logger,
    });
  }

  return createFileSystemWorkspacePersistenceBackend({
    logger: params.logger,
    rootDirectory: params.options.dataDirectory,
  });
}

export function createWorkspacePersistenceBackend(params: {
  config: ApiRuntimeConfig;
  logger?: Logger;
}): WorkspacePersistenceBackend {
  return createWorkspacePersistenceBackendFromOptions({
    logger: params.logger,
    options: {
      dataDirectory: params.config.dataDirectory,
      persistenceBackend: params.config.persistenceBackend,
      postgresUrl: params.config.postgresUrl,
      sqlitePath: params.config.sqlitePath,
    },
  });
}

export async function exportWorkspaceDocument(params: {
  backend: WorkspacePersistenceBackend;
  dryRun?: boolean;
  logger?: Logger;
  validate?: boolean;
  workspaceId: string;
}): Promise<PersistenceExportResult> {
  const document = await params.backend.load(params.workspaceId, { logger: params.logger });

  return {
    document,
    dryRun: params.dryRun ?? false,
    validation:
      params.validate === false ? undefined : validateWorkspaceDocumentForPersistence(document),
  };
}

export async function importWorkspaceDocument(params: {
  backend: WorkspacePersistenceBackend;
  document: FinanceWorkspaceDocument;
} & PersistenceWriteOptions): Promise<PersistenceImportResult> {
  const validation =
    params.validate === false ? undefined : validateWorkspaceDocumentForPersistence(params.document);
  const targetWorkspaceId = params.document.id;
  const targetWorkspace = await loadWorkspaceIfExists({
    backend: params.backend,
    logger: params.logger,
    workspaceId: targetWorkspaceId,
  });
  const targetWorkspaceWasPresent = targetWorkspace !== undefined;

  if (params.dryRun) {
    return {
      dryRun: true,
      rolledBack: false,
      targetWorkspaceWasPresent,
      validation,
      workspaceId: targetWorkspaceId,
    };
  }

  let targetBackupId: string | undefined;

  if (params.backupTarget && targetWorkspaceWasPresent) {
    const backup = await params.backend.createBackup(targetWorkspaceId, { logger: params.logger });
    targetBackupId = backup.id;
  }

  try {
    await params.backend.save(params.document, { logger: params.logger });
    const persistedDocument = await params.backend.load(targetWorkspaceId, { logger: params.logger });
    const targetWorkspaceValidation =
      params.validate === false ? undefined : validateWorkspaceDocumentForPersistence(persistedDocument);

    if (targetWorkspaceValidation && !targetWorkspaceValidation.ok) {
      throw new Error(`Persisted workspace ${targetWorkspaceId} failed validation after write.`);
    }

    return {
      dryRun: false,
      rolledBack: false,
      targetBackupId,
      targetWorkspaceValidation,
      targetWorkspaceWasPresent,
      validation,
      workspaceId: targetWorkspaceId,
    };
  } catch (error) {
    if (targetBackupId && params.rollbackOnFailure) {
      await params.backend.restoreBackup(targetWorkspaceId, targetBackupId, { logger: params.logger });
    }

    throw error;
  }
}

export async function copyWorkspaceBetweenBackends(params: {
  source: WorkspacePersistenceBackend;
  sourceWorkspaceId: string;
  target: WorkspacePersistenceBackend;
  targetWorkspaceId?: string;
} & PersistenceWriteOptions): Promise<PersistenceCopyResult> {
  const document = await params.source.load(params.sourceWorkspaceId, { logger: params.logger });
  const sourceValidation =
    params.validate === false ? undefined : validateWorkspaceDocumentForPersistence(document);
  const targetWorkspaceId = params.targetWorkspaceId ?? document.id;
  const targetDocument =
    targetWorkspaceId === document.id
      ? document
      : {
          ...document,
          id: targetWorkspaceId,
        };
  const imported = await importWorkspaceDocument({
    backend: params.target,
    backupTarget: params.backupTarget,
    document: targetDocument,
    dryRun: params.dryRun,
    logger: params.logger,
    rollbackOnFailure: params.rollbackOnFailure,
    validate: params.validate,
  });

  return {
    dryRun: imported.dryRun,
    rolledBack: imported.rolledBack,
    sourceValidation,
    targetBackupId: imported.targetBackupId,
    targetWorkspaceId,
    targetWorkspaceValidation: imported.targetWorkspaceValidation,
    targetWorkspaceWasPresent: imported.targetWorkspaceWasPresent,
    workspaceId: document.id,
  };
}

export async function copyAllWorkspacesBetweenBackends(params: {
  onError?: PersistenceCopyManyOnError;
  source: WorkspacePersistenceBackend;
  target: WorkspacePersistenceBackend;
  workspaceIds?: string[];
} & PersistenceWriteOptions): Promise<PersistenceCopyManyResult> {
  const workspaceIds = params.workspaceIds ?? (await params.source.listWorkspaceIds({ logger: params.logger }));
  const failures: PersistenceCopyFailure[] = [];
  const onError = params.onError ?? "halt";
  const results: PersistenceCopyResult[] = [];
  let halted = false;

  for (const workspaceId of workspaceIds) {
    try {
      results.push(
        await copyWorkspaceBetweenBackends({
          backupTarget: params.backupTarget,
          dryRun: params.dryRun,
          logger: params.logger,
          rollbackOnFailure: params.rollbackOnFailure,
          source: params.source,
          sourceWorkspaceId: workspaceId,
          target: params.target,
          validate: params.validate,
        }),
      );
    } catch (error) {
      failures.push({
        code:
          typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
            ? error.code
            : undefined,
        message: error instanceof Error ? error.message : String(error),
        status:
          typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
            ? error.status
            : undefined,
        workspaceId,
      });

      if (onError === "halt") {
        halted = true;
        break;
      }
    }
  }

  return {
    dryRun: params.dryRun ?? false,
    failureCount: failures.length,
    failures,
    halted,
    onError,
    results,
    successCount: results.length,
    workspaceIds,
  };
}

export { createFileSystemWorkspacePersistenceBackend } from "./persistence-json";
export { createPostgresWorkspacePersistenceBackend } from "./persistence-postgres";
export { createSqliteWorkspacePersistenceBackend } from "./persistence-sqlite";
