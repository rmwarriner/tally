import type { Logger } from "@gnucash-ng/logging";
import type { FinanceWorkspaceDocument } from "@gnucash-ng/workspace";
import type { ApiPersistenceBackend, ApiRuntimeConfig } from "./config";
import { createFileSystemWorkspacePersistenceBackend } from "./persistence-json";
import { createPostgresWorkspacePersistenceBackend } from "./persistence-postgres";
import { createSqliteWorkspacePersistenceBackend } from "./persistence-sqlite";

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
  targetWorkspaceId: string;
  workspaceId: string;
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
  logger?: Logger;
  workspaceId: string;
}): Promise<FinanceWorkspaceDocument> {
  return params.backend.load(params.workspaceId, { logger: params.logger });
}

export async function importWorkspaceDocument(params: {
  backend: WorkspacePersistenceBackend;
  document: FinanceWorkspaceDocument;
  logger?: Logger;
}): Promise<FinanceWorkspaceDocument> {
  await params.backend.save(params.document, { logger: params.logger });
  return params.document;
}

export async function copyWorkspaceBetweenBackends(params: {
  logger?: Logger;
  source: WorkspacePersistenceBackend;
  sourceWorkspaceId: string;
  target: WorkspacePersistenceBackend;
  targetWorkspaceId?: string;
}): Promise<PersistenceCopyResult> {
  const document = await params.source.load(params.sourceWorkspaceId, { logger: params.logger });
  const targetWorkspaceId = params.targetWorkspaceId ?? document.id;
  const targetDocument =
    targetWorkspaceId === document.id
      ? document
      : {
          ...document,
          id: targetWorkspaceId,
        };
  await params.target.save(targetDocument, { logger: params.logger });

  return {
    targetWorkspaceId,
    workspaceId: document.id,
  };
}

export { createFileSystemWorkspacePersistenceBackend } from "./persistence-json";
export { createPostgresWorkspacePersistenceBackend } from "./persistence-postgres";
export { createSqliteWorkspacePersistenceBackend } from "./persistence-sqlite";
