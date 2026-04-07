import { mkdir, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createNoopLogger, type Logger } from "@tally/logging";
import type { FinanceWorkspaceDocument } from "@tally/workspace";
import { loadWorkspaceFromFile, saveWorkspaceToFile } from "@tally/workspace/src/node";
import { ApiError } from "./errors";
import type { WorkspaceBackup, WorkspacePersistenceBackend } from "./persistence";

export function createFileSystemWorkspacePersistenceBackend(params: {
  logger?: Logger;
  rootDirectory: string;
}): WorkspacePersistenceBackend {
  const rootDirectory = resolve(params.rootDirectory);
  const logger = (params.logger ?? createNoopLogger()).child({
    component: "fileSystemWorkspacePersistenceBackend",
    persistenceBackend: "json",
    rootDirectory,
  });

  function workspacePath(workspaceId: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(workspaceId)) {
      throw new ApiError({
        code: "repository.invalid_identifier",
        message: "Workspace identifier is invalid.",
        status: 400,
      });
    }

    const path = resolve(join(rootDirectory, `${workspaceId}.json`));

    if (!path.startsWith(`${rootDirectory}/`) && path !== `${rootDirectory}.json`) {
      throw new ApiError({
        code: "repository.invalid_identifier",
        message: "Workspace identifier is invalid.",
        status: 400,
      });
    }

    return path;
  }

  function backupDirectory(workspaceId: string): string {
    return resolve(join(rootDirectory, "_backups", workspaceId));
  }

  function backupPath(workspaceId: string, backupId: string): string {
    if (!/^[a-zA-Z0-9:._-]+$/.test(backupId)) {
      throw new ApiError({
        code: "repository.invalid_identifier",
        message: "Backup identifier is invalid.",
        status: 400,
      });
    }

    return resolve(join(backupDirectory(workspaceId), `${backupId}.json`));
  }

  async function describeBackup(workspaceId: string, fileName: string): Promise<WorkspaceBackup> {
    const filePath = resolve(join(backupDirectory(workspaceId), fileName));
    const fileStats = await stat(filePath);
    const id = fileName.replace(/\.json$/, "");
    const createdAt = id.startsWith("backup-") ? id.slice("backup-".length).replace(/_/g, ":") : id;

    return {
      createdAt,
      fileName,
      id,
      sizeBytes: fileStats.size,
      workspaceId,
    };
  }

  return {
    kind: "json",

    async listWorkspaceIds(options: { logger?: Logger } = {}): Promise<string[]> {
      const requestLogger = (options.logger ?? logger).child({
        component: "fileSystemWorkspacePersistenceBackend",
        operation: "listWorkspaceIds",
        persistenceBackend: "json",
        rootDirectory,
      });

      try {
        const entries = await readdir(rootDirectory);
        const workspaceIds = entries
          .filter((entry) => entry.endsWith(".json"))
          .filter((entry) => !entry.startsWith("_"))
          .map((entry) => entry.replace(/\.json$/, ""))
          .sort((left, right) => left.localeCompare(right));

        requestLogger.info("workspace id list completed", {
          workspaceCount: workspaceIds.length,
        });
        return workspaceIds;
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
          requestLogger.info("workspace id list completed", {
            workspaceCount: 0,
          });
          return [];
        }

        throw new ApiError({
          cause: error,
          code: "repository.unavailable",
          expose: false,
          message: "Workspace storage is unavailable.",
          status: 500,
        });
      }
    },

    async load(workspaceId: string, options: { logger?: Logger } = {}): Promise<FinanceWorkspaceDocument> {
      const requestLogger = (options.logger ?? logger).child({
        component: "fileSystemWorkspacePersistenceBackend",
        operation: "loadWorkspace",
        persistenceBackend: "json",
        rootDirectory,
        workspaceId,
      });

      try {
        return await loadWorkspaceFromFile(workspacePath(workspaceId), { logger: requestLogger });
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }

        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          throw new ApiError({
            cause: error,
            code: "workspace.not_found",
            message: `Workspace ${workspaceId} was not found.`,
            status: 404,
          });
        }

        throw new ApiError({
          cause: error,
          code: "repository.unavailable",
          expose: false,
          message: "Workspace storage is unavailable.",
          status: 500,
        });
      }
    },

    async listBackups(workspaceId: string, options: { logger?: Logger } = {}): Promise<WorkspaceBackup[]> {
      const requestLogger = (options.logger ?? logger).child({
        component: "fileSystemWorkspacePersistenceBackend",
        operation: "listBackups",
        persistenceBackend: "json",
        rootDirectory,
        workspaceId,
      });

      try {
        requestLogger.info("workspace backup list started");
        const directory = backupDirectory(workspaceId);
        const entries = await readdir(directory);
        const backups = await Promise.all(
          entries
            .filter((entry) => entry.endsWith(".json"))
            .map((entry) => describeBackup(workspaceId, entry)),
        );

        const sortedBackups = backups.sort((left, right) => right.id.localeCompare(left.id));
        requestLogger.info("workspace backup list completed", {
          backupCount: sortedBackups.length,
        });
        return sortedBackups;
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
          requestLogger.info("workspace backup list completed", {
            backupCount: 0,
          });
          return [];
        }

        requestLogger.error("workspace backup list failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw new ApiError({
          cause: error,
          code: "repository.unavailable",
          expose: false,
          message: "Workspace storage is unavailable.",
          status: 500,
        });
      }
    },

    async createBackup(workspaceId: string, options: { logger?: Logger } = {}): Promise<WorkspaceBackup> {
      const requestLogger = (options.logger ?? logger).child({
        component: "fileSystemWorkspacePersistenceBackend",
        operation: "createBackup",
        persistenceBackend: "json",
        rootDirectory,
        workspaceId,
      });

      const workspace = await this.load(workspaceId, { logger: requestLogger });
      const createdAt = new Date().toISOString();
      const backupId = `backup-${createdAt.replace(/:/g, "_")}`;
      const directory = backupDirectory(workspaceId);
      const filePath = backupPath(workspaceId, backupId);

      try {
        await mkdir(directory, { recursive: true });
        await saveWorkspaceToFile(filePath, workspace, { logger: requestLogger });
        return await describeBackup(workspaceId, `${backupId}.json`);
      } catch (error) {
        throw new ApiError({
          cause: error,
          code: "repository.unavailable",
          expose: false,
          message: "Workspace storage is unavailable.",
          status: 500,
        });
      }
    },

    async save(document: FinanceWorkspaceDocument, options: { logger?: Logger } = {}): Promise<void> {
      const requestLogger = (options.logger ?? logger).child({
        component: "fileSystemWorkspacePersistenceBackend",
        operation: "saveWorkspace",
        persistenceBackend: "json",
        rootDirectory,
        workspaceId: document.id,
      });

      try {
        await mkdir(rootDirectory, { recursive: true });
        await saveWorkspaceToFile(workspacePath(document.id), document, { logger: requestLogger });
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }

        throw new ApiError({
          cause: error,
          code: "repository.unavailable",
          expose: false,
          message: "Workspace storage is unavailable.",
          status: 500,
        });
      }
    },

    async restoreBackup(
      workspaceId: string,
      backupId: string,
      options: { logger?: Logger } = {},
    ): Promise<FinanceWorkspaceDocument> {
      const requestLogger = (options.logger ?? logger).child({
        backupId,
        component: "fileSystemWorkspacePersistenceBackend",
        operation: "restoreBackup",
        persistenceBackend: "json",
        rootDirectory,
        workspaceId,
      });

      try {
        const document = await loadWorkspaceFromFile(backupPath(workspaceId, backupId), {
          logger: requestLogger,
        });

        if (document.id !== workspaceId) {
          throw new ApiError({
            code: "repository.invalid_identifier",
            message: "Backup workspace identifier does not match the requested workspace.",
            status: 400,
          });
        }

        await this.save(document, { logger: requestLogger });
        return document;
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }

        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          throw new ApiError({
            cause: error,
            code: "workspace.not_found",
            message: `Backup ${backupId} was not found for workspace ${workspaceId}.`,
            status: 404,
          });
        }

        throw new ApiError({
          cause: error,
          code: "repository.unavailable",
          expose: false,
          message: "Workspace storage is unavailable.",
          status: 500,
        });
      }
    },
  };
}
