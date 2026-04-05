import { mkdir, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createNoopLogger, type Logger } from "@gnucash-ng/logging";
import type { FinanceWorkspaceDocument } from "@gnucash-ng/workspace";
import { loadWorkspaceFromFile, saveWorkspaceToFile } from "@gnucash-ng/workspace/src/node";
import { ApiError } from "./errors";

export interface WorkspaceBackup {
  createdAt: string;
  fileName: string;
  id: string;
  sizeBytes: number;
  workspaceId: string;
}

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

export function createFileSystemWorkspaceRepository(params: {
  logger?: Logger;
  rootDirectory: string;
}): WorkspaceRepository {
  const rootDirectory = resolve(params.rootDirectory);
  const logger = (params.logger ?? createNoopLogger()).child({
    component: "fileSystemWorkspaceRepository",
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
    async load(workspaceId: string, options: { logger?: Logger } = {}): Promise<FinanceWorkspaceDocument> {
      const requestLogger = (options.logger ?? logger).child({
        component: "fileSystemWorkspaceRepository",
        operation: "loadWorkspace",
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
        component: "fileSystemWorkspaceRepository",
        operation: "listBackups",
        rootDirectory,
        workspaceId,
      });

      try {
        const directory = backupDirectory(workspaceId);
        const entries = await readdir(directory);
        const backups = await Promise.all(
          entries
            .filter((entry) => entry.endsWith(".json"))
            .map((entry) => describeBackup(workspaceId, entry)),
        );

        return backups.sort((left, right) => right.id.localeCompare(left.id));
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
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
    async createBackup(workspaceId: string, options: { logger?: Logger } = {}): Promise<WorkspaceBackup> {
      const requestLogger = (options.logger ?? logger).child({
        component: "fileSystemWorkspaceRepository",
        operation: "createBackup",
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
        component: "fileSystemWorkspaceRepository",
        operation: "saveWorkspace",
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
        component: "fileSystemWorkspaceRepository",
        operation: "restoreBackup",
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
