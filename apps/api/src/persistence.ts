import type { Logger } from "@gnucash-ng/logging";
import type { FinanceWorkspaceDocument } from "@gnucash-ng/workspace";
import type { ApiRuntimeConfig } from "./config";
import { createFileSystemWorkspacePersistenceBackend } from "./persistence-json";
import { createSqliteWorkspacePersistenceBackend } from "./persistence-sqlite";

export type WorkspacePersistenceBackendKind = "json" | "sqlite";

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

export function createWorkspacePersistenceBackend(params: {
  config: ApiRuntimeConfig;
  logger?: Logger;
}): WorkspacePersistenceBackend {
  if (params.config.persistenceBackend === "sqlite") {
    return createSqliteWorkspacePersistenceBackend({
      databasePath: params.config.sqlitePath,
      logger: params.logger,
    });
  }

  return createFileSystemWorkspacePersistenceBackend({
    logger: params.logger,
    rootDirectory: params.config.dataDirectory,
  });
}

export { createFileSystemWorkspacePersistenceBackend } from "./persistence-json";
export { createSqliteWorkspacePersistenceBackend } from "./persistence-sqlite";
