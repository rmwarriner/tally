import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createNoopLogger, type Logger } from "@gnucash-ng/logging";
import type { FinanceWorkspaceDocument } from "@gnucash-ng/workspace";
import { loadWorkspaceFromFile, saveWorkspaceToFile } from "@gnucash-ng/workspace/src/node";
import { ApiError } from "./errors";

export interface WorkspaceRepository {
  load(workspaceId: string): Promise<FinanceWorkspaceDocument>;
  save(document: FinanceWorkspaceDocument): Promise<void>;
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

  return {
    async load(workspaceId: string): Promise<FinanceWorkspaceDocument> {
      try {
        return await loadWorkspaceFromFile(workspacePath(workspaceId), { logger });
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
    async save(document: FinanceWorkspaceDocument): Promise<void> {
      try {
        await mkdir(rootDirectory, { recursive: true });
        await saveWorkspaceToFile(workspacePath(document.id), document, { logger });
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
  };
}
