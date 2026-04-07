import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createNoopLogger, type Logger } from "@tally-core/logging";
import { migrateWorkspaceDocument, type FinanceWorkspaceDocument } from "@tally-core/workspace";
import { ApiError } from "./errors";
import type { WorkspaceBackup, WorkspacePersistenceBackend } from "./persistence";

interface WorkspaceRow {
  document_json: string;
}

interface BackupRow {
  created_at: string;
  document_json: string;
  id: string;
  size_bytes: number;
  workspace_id: string;
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

export function createSqliteWorkspacePersistenceBackend(params: {
  databasePath: string;
  logger?: Logger;
}): WorkspacePersistenceBackend {
  const databasePath = resolve(params.databasePath);
  const logger = (params.logger ?? createNoopLogger()).child({
    component: "sqliteWorkspacePersistenceBackend",
    databasePath,
    persistenceBackend: "sqlite",
  });

  let database: DatabaseSync | null = null;

  async function ensureDatabase(): Promise<DatabaseSync> {
    if (database) {
      return database;
    }

    await mkdir(dirname(databasePath), { recursive: true });
    database = new DatabaseSync(databasePath);
    database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        document_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workspace_backups (
        id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        document_json TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        PRIMARY KEY (workspace_id, id)
      );
      CREATE INDEX IF NOT EXISTS workspace_backups_workspace_created_idx
        ON workspace_backups (workspace_id, created_at DESC);
    `);

    return database;
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
    kind: "sqlite",

    async close(): Promise<void> {
      if (database) {
        database.close();
        database = null;
      }
    },

    async listWorkspaceIds(options: { logger?: Logger } = {}): Promise<string[]> {
      const requestLogger = (options.logger ?? logger).child({
        component: "sqliteWorkspacePersistenceBackend",
        databasePath,
        operation: "listWorkspaceIds",
        persistenceBackend: "sqlite",
      });

      try {
        const db = await ensureDatabase();
        const rows = db
          .prepare("SELECT id FROM workspaces ORDER BY id ASC")
          .all() as unknown as Array<{ id: string }>;
        const workspaceIds = rows.map((row) => row.id);

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
        component: "sqliteWorkspacePersistenceBackend",
        databasePath,
        operation: "loadWorkspace",
        persistenceBackend: "sqlite",
        workspaceId,
      });

      try {
        const db = await ensureDatabase();
        const row = db
          .prepare("SELECT document_json FROM workspaces WHERE id = ?")
          .get(workspaceId) as WorkspaceRow | undefined;

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
        component: "sqliteWorkspacePersistenceBackend",
        databasePath,
        operation: "saveWorkspace",
        persistenceBackend: "sqlite",
        workspaceId: document.id,
      });

      try {
        const db = await ensureDatabase();
        const serialized = `${JSON.stringify(document)}\n`;
        db.prepare(`
          INSERT INTO workspaces (id, document_json, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            document_json = excluded.document_json,
            updated_at = excluded.updated_at
        `).run(document.id, serialized, new Date().toISOString());

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
        component: "sqliteWorkspacePersistenceBackend",
        databasePath,
        operation: "listBackups",
        persistenceBackend: "sqlite",
        workspaceId,
      });

      try {
        const db = await ensureDatabase();
        const rows = db
          .prepare(`
            SELECT id, workspace_id, created_at, size_bytes, document_json
            FROM workspace_backups
            WHERE workspace_id = ?
            ORDER BY id DESC
          `)
          .all(workspaceId) as unknown as BackupRow[];

        requestLogger.info("workspace backup list completed", {
          backupCount: rows.length,
        });
        return rows.map(toBackupEnvelope);
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
        component: "sqliteWorkspacePersistenceBackend",
        databasePath,
        operation: "createBackup",
        persistenceBackend: "sqlite",
        workspaceId,
      });

      const workspace = await this.load(workspaceId, { logger: requestLogger });
      const createdAt = new Date().toISOString();
      const backupId = `backup-${createdAt.replace(/:/g, "_")}`;
      const serialized = `${JSON.stringify(workspace)}\n`;

      try {
        const db = await ensureDatabase();
        db.prepare(`
          INSERT INTO workspace_backups (id, workspace_id, created_at, document_json, size_bytes)
          VALUES (?, ?, ?, ?, ?)
        `).run(backupId, workspaceId, createdAt, serialized, Buffer.byteLength(serialized, "utf8"));

        return {
          createdAt,
          fileName: `${backupId}.json`,
          id: backupId,
          sizeBytes: Buffer.byteLength(serialized, "utf8"),
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
        component: "sqliteWorkspacePersistenceBackend",
        databasePath,
        operation: "restoreBackup",
        persistenceBackend: "sqlite",
        workspaceId,
      });

      try {
        const db = await ensureDatabase();
        const row = db
          .prepare(`
            SELECT id, workspace_id, created_at, size_bytes, document_json
            FROM workspace_backups
            WHERE workspace_id = ? AND id = ?
          `)
          .get(workspaceId, backupId) as BackupRow | undefined;

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
