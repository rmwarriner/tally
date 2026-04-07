import { createNoopLogger, type Logger } from "@tally/logging";
import type { FinanceWorkspaceDocument } from "@tally/workspace";
import {
  createFileSystemWorkspacePersistenceBackend,
  type WorkspaceBackup,
  type WorkspacePersistenceBackend,
} from "./persistence";

export interface WorkspaceRepository {
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

export function createWorkspaceRepository(params: {
  backend: WorkspacePersistenceBackend;
  logger?: Logger;
}): WorkspaceRepository {
  const logger = (params.logger ?? createNoopLogger()).child({
    component: "workspaceRepository",
    persistenceBackend: params.backend.kind,
  });

  return {
    async load(workspaceId: string, options: { logger?: Logger } = {}): Promise<FinanceWorkspaceDocument> {
      return params.backend.load(workspaceId, {
        logger: (options.logger ?? logger).child({
          component: "workspaceRepository",
          operation: "loadWorkspace",
          persistenceBackend: params.backend.kind,
          workspaceId,
        }),
      });
    },
    async save(document: FinanceWorkspaceDocument, options: { logger?: Logger } = {}): Promise<void> {
      await params.backend.save(document, {
        logger: (options.logger ?? logger).child({
          component: "workspaceRepository",
          operation: "saveWorkspace",
          persistenceBackend: params.backend.kind,
          workspaceId: document.id,
        }),
      });
    },
    async listBackups(workspaceId: string, options: { logger?: Logger } = {}): Promise<WorkspaceBackup[]> {
      return params.backend.listBackups(workspaceId, {
        logger: (options.logger ?? logger).child({
          component: "workspaceRepository",
          operation: "listBackups",
          persistenceBackend: params.backend.kind,
          workspaceId,
        }),
      });
    },
    async createBackup(workspaceId: string, options: { logger?: Logger } = {}): Promise<WorkspaceBackup> {
      return params.backend.createBackup(workspaceId, {
        logger: (options.logger ?? logger).child({
          component: "workspaceRepository",
          operation: "createBackup",
          persistenceBackend: params.backend.kind,
          workspaceId,
        }),
      });
    },
    async restoreBackup(
      workspaceId: string,
      backupId: string,
      options: { logger?: Logger } = {},
    ): Promise<FinanceWorkspaceDocument> {
      return params.backend.restoreBackup(workspaceId, backupId, {
        logger: (options.logger ?? logger).child({
          backupId,
          component: "workspaceRepository",
          operation: "restoreBackup",
          persistenceBackend: params.backend.kind,
          workspaceId,
        }),
      });
    },
  };
}

export function createFileSystemWorkspaceRepository(params: {
  logger?: Logger;
  rootDirectory: string;
}): WorkspaceRepository {
  return createWorkspaceRepository({
    backend: createFileSystemWorkspacePersistenceBackend(params),
    logger: params.logger,
  });
}

export type { WorkspaceBackup } from "./persistence";
