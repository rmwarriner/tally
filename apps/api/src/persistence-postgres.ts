import { createNoopLogger, type Logger } from "@tally/logging";
import { migrateWorkspaceDocument, type FinanceWorkspaceDocument } from "@tally/workspace";
import { Pool, type QueryResult } from "pg";
import { ApiError } from "./errors";
import type { WorkspaceBackup, WorkspacePersistenceBackend } from "./persistence";

interface WorkspaceRow {
  id?: string;
  document_json: string;
}

interface BackupRow {
  created_at: string;
  document_json: string;
  id: string;
  size_bytes: number;
  workspace_id: string;
}

export interface PostgresQueryable {
  end?(): Promise<void>;
  query<TResult extends object = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<Pick<QueryResult<TResult>, "rowCount" | "rows">>;
}

function validateWorkspaceIdentifier(workspaceId: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(workspaceId)) {
    throw new ApiError({
      code: "repository.invalid_identifier",
      message: "Workspace identifier is invalid.",
      status: 400,
    });
  }
}

function validateBackupIdentifier(backupId: string): void {
  if (!/^[a-zA-Z0-9:._-]+$/.test(backupId)) {
    throw new ApiError({
      code: "repository.invalid_identifier",
      message: "Backup identifier is invalid.",
      status: 400,
    });
  }
}

export function createPostgresWorkspacePersistenceBackend(params: {
  logger?: Logger;
  pool?: PostgresQueryable;
  postgresUrl: string;
}): WorkspacePersistenceBackend {
  const logger = (params.logger ?? createNoopLogger()).child({
    component: "postgresWorkspacePersistenceBackend",
    persistenceBackend: "postgres",
  });
  const pool =
    params.pool ??
    new Pool({
      connectionString: params.postgresUrl,
    });
  let schemaReady = false;

  async function ensureSchema(): Promise<void> {
    if (schemaReady) {
      return;
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        document_json TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workspace_backups (
        id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        document_json TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        PRIMARY KEY (workspace_id, id)
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS workspace_backups_workspace_created_idx
        ON workspace_backups (workspace_id, created_at DESC);
    `);
    schemaReady = true;
  }

  function parseWorkspaceDocument(raw: string): FinanceWorkspaceDocument {
    return migrateWorkspaceDocument(JSON.parse(raw) as unknown);
  }

  function toBackupEnvelope(row: BackupRow): WorkspaceBackup {
    return {
      createdAt: row.created_at,
      fileName: `${row.id}.json`,
      id: row.id,
      sizeBytes: row.size_bytes,
      workspaceId: row.workspace_id,
    };
  }

  return {
    kind: "postgres",

    async close(): Promise<void> {
      if (pool.end) {
        await pool.end();
      }
    },

    async listWorkspaceIds(options: { logger?: Logger } = {}): Promise<string[]> {
      const requestLogger = (options.logger ?? logger).child({
        component: "postgresWorkspacePersistenceBackend",
        operation: "listWorkspaceIds",
        persistenceBackend: "postgres",
      });

      try {
        await ensureSchema();
        const result = await pool.query<WorkspaceRow>(
          "SELECT id FROM workspaces ORDER BY id ASC",
        );
        const workspaceIds = result.rows
          .map((row) => row.id)
          .filter((id): id is string => typeof id === "string");

        requestLogger.info("workspace id list completed", {
          workspaceCount: workspaceIds.length,
        });
        return workspaceIds;
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

    async load(workspaceId: string, options: { logger?: Logger } = {}): Promise<FinanceWorkspaceDocument> {
      validateWorkspaceIdentifier(workspaceId);
      const requestLogger = (options.logger ?? logger).child({
        component: "postgresWorkspacePersistenceBackend",
        operation: "loadWorkspace",
        persistenceBackend: "postgres",
        workspaceId,
      });

      try {
        await ensureSchema();
        const result = await pool.query<WorkspaceRow>(
          "SELECT document_json FROM workspaces WHERE id = $1",
          [workspaceId],
        );
        const row = result.rows[0];

        if (!row) {
          throw new ApiError({
            code: "workspace.not_found",
            message: `Workspace ${workspaceId} was not found.`,
            status: 404,
          });
        }

        const document = parseWorkspaceDocument(row.document_json);
        requestLogger.info("workspace storage load completed", {
          transactionCount: document.transactions.length,
          workspaceId: document.id,
        });
        return document;
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

    async save(document: FinanceWorkspaceDocument, options: { logger?: Logger } = {}): Promise<void> {
      validateWorkspaceIdentifier(document.id);
      const requestLogger = (options.logger ?? logger).child({
        component: "postgresWorkspacePersistenceBackend",
        operation: "saveWorkspace",
        persistenceBackend: "postgres",
        workspaceId: document.id,
      });

      try {
        await ensureSchema();
        const serialized = `${JSON.stringify(document)}\n`;
        await pool.query(
          `
            INSERT INTO workspaces (id, document_json, updated_at)
            VALUES ($1, $2, $3)
            ON CONFLICT (id) DO UPDATE SET
              document_json = EXCLUDED.document_json,
              updated_at = EXCLUDED.updated_at
          `,
          [document.id, serialized, new Date().toISOString()],
        );

        requestLogger.info("workspace storage save completed", {
          transactionCount: document.transactions.length,
          workspaceId: document.id,
        });
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

    async listBackups(workspaceId: string, options: { logger?: Logger } = {}): Promise<WorkspaceBackup[]> {
      validateWorkspaceIdentifier(workspaceId);
      const requestLogger = (options.logger ?? logger).child({
        component: "postgresWorkspacePersistenceBackend",
        operation: "listBackups",
        persistenceBackend: "postgres",
        workspaceId,
      });

      try {
        await ensureSchema();
        const result = await pool.query<BackupRow>(
          `
            SELECT id, workspace_id, created_at, size_bytes, document_json
            FROM workspace_backups
            WHERE workspace_id = $1
            ORDER BY id DESC
          `,
          [workspaceId],
        );

        requestLogger.info("workspace backup list completed", {
          backupCount: result.rows.length,
        });
        return result.rows.map(toBackupEnvelope);
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

    async createBackup(workspaceId: string, options: { logger?: Logger } = {}): Promise<WorkspaceBackup> {
      validateWorkspaceIdentifier(workspaceId);
      const requestLogger = (options.logger ?? logger).child({
        component: "postgresWorkspacePersistenceBackend",
        operation: "createBackup",
        persistenceBackend: "postgres",
        workspaceId,
      });

      const workspace = await this.load(workspaceId, { logger: requestLogger });
      const createdAt = new Date().toISOString();
      const backupId = `backup-${createdAt.replace(/:/g, "_")}`;
      const serialized = `${JSON.stringify(workspace)}\n`;
      const sizeBytes = Buffer.byteLength(serialized, "utf8");

      try {
        await ensureSchema();
        await pool.query(
          `
            INSERT INTO workspace_backups (id, workspace_id, created_at, document_json, size_bytes)
            VALUES ($1, $2, $3, $4, $5)
          `,
          [backupId, workspaceId, createdAt, serialized, sizeBytes],
        );

        return {
          createdAt,
          fileName: `${backupId}.json`,
          id: backupId,
          sizeBytes,
          workspaceId,
        };
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
      validateWorkspaceIdentifier(workspaceId);
      validateBackupIdentifier(backupId);
      const requestLogger = (options.logger ?? logger).child({
        backupId,
        component: "postgresWorkspacePersistenceBackend",
        operation: "restoreBackup",
        persistenceBackend: "postgres",
        workspaceId,
      });

      try {
        await ensureSchema();
        const result = await pool.query<BackupRow>(
          `
            SELECT id, workspace_id, created_at, size_bytes, document_json
            FROM workspace_backups
            WHERE workspace_id = $1 AND id = $2
          `,
          [workspaceId, backupId],
        );
        const row = result.rows[0];

        if (!row) {
          throw new ApiError({
            code: "workspace.not_found",
            message: `Backup ${backupId} was not found for workspace ${workspaceId}.`,
            status: 404,
          });
        }

        const document = parseWorkspaceDocument(row.document_json);

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
