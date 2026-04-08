import { createNoopLogger, type Logger } from "@tally/logging";
import { migrateBookDocument, type FinanceBookDocument } from "@tally/book";
import { Pool, type QueryResult } from "pg";
import { ApiError } from "./errors";
import type { BookBackup, BookPersistenceBackend } from "./persistence";

interface BookRow {
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

function validateBookIdentifier(bookId: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(bookId)) {
    throw new ApiError({
      code: "repository.invalid_identifier",
      message: "Book identifier is invalid.",
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

export function createPostgresBookPersistenceBackend(params: {
  logger?: Logger;
  pool?: PostgresQueryable;
  postgresUrl: string;
}): BookPersistenceBackend {
  const logger = (params.logger ?? createNoopLogger()).child({
    component: "postgresBookPersistenceBackend",
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

  function parseBookDocument(raw: string): FinanceBookDocument {
    return migrateBookDocument(JSON.parse(raw) as unknown);
  }

  function toBackupEnvelope(row: BackupRow): BookBackup {
    return {
      createdAt: row.created_at,
      fileName: `${row.id}.json`,
      id: row.id,
      sizeBytes: row.size_bytes,
      bookId: row.workspace_id,
    };
  }

  return {
    kind: "postgres",

    async close(): Promise<void> {
      if (pool.end) {
        await pool.end();
      }
    },

    async listBookIds(options: { logger?: Logger } = {}): Promise<string[]> {
      const requestLogger = (options.logger ?? logger).child({
        component: "postgresBookPersistenceBackend",
        operation: "listBookIds",
        persistenceBackend: "postgres",
      });

      try {
        await ensureSchema();
        const result = await pool.query<BookRow>(
          "SELECT id FROM workspaces ORDER BY id ASC",
        );
        const bookIds = result.rows
          .map((row) => row.id)
          .filter((id): id is string => typeof id === "string");

        requestLogger.info("book id list completed", {
          bookCount: bookIds.length,
        });
        return bookIds;
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }

        throw new ApiError({
          cause: error,
          code: "repository.unavailable",
          expose: false,
          message: "Book storage is unavailable.",
          status: 500,
        });
      }
    },

    async load(bookId: string, options: { logger?: Logger } = {}): Promise<FinanceBookDocument> {
      validateBookIdentifier(bookId);
      const requestLogger = (options.logger ?? logger).child({
        component: "postgresBookPersistenceBackend",
        operation: "loadBook",
        persistenceBackend: "postgres",
        bookId,
      });

      try {
        await ensureSchema();
        const result = await pool.query<BookRow>(
          "SELECT document_json FROM workspaces WHERE id = $1",
          [bookId],
        );
        const row = result.rows[0];

        if (!row) {
          throw new ApiError({
            code: "book.not_found",
            message: `Workspace ${bookId} was not found.`,
            status: 404,
          });
        }

        const document = parseBookDocument(row.document_json);
        requestLogger.info("book storage load completed", {
          transactionCount: document.transactions.length,
          bookId: document.id,
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
          message: "Book storage is unavailable.",
          status: 500,
        });
      }
    },

    async save(document: FinanceBookDocument, options: { logger?: Logger } = {}): Promise<void> {
      validateBookIdentifier(document.id);
      const requestLogger = (options.logger ?? logger).child({
        component: "postgresBookPersistenceBackend",
        operation: "saveBook",
        persistenceBackend: "postgres",
        bookId: document.id,
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

        requestLogger.info("book storage save completed", {
          transactionCount: document.transactions.length,
          bookId: document.id,
        });
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }

        throw new ApiError({
          cause: error,
          code: "repository.unavailable",
          expose: false,
          message: "Book storage is unavailable.",
          status: 500,
        });
      }
    },

    async listBackups(bookId: string, options: { logger?: Logger } = {}): Promise<BookBackup[]> {
      validateBookIdentifier(bookId);
      const requestLogger = (options.logger ?? logger).child({
        component: "postgresBookPersistenceBackend",
        operation: "listBackups",
        persistenceBackend: "postgres",
        bookId,
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
          [bookId],
        );

        requestLogger.info("book backup list completed", {
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
          message: "Book storage is unavailable.",
          status: 500,
        });
      }
    },

    async createBackup(bookId: string, options: { logger?: Logger } = {}): Promise<BookBackup> {
      validateBookIdentifier(bookId);
      const requestLogger = (options.logger ?? logger).child({
        component: "postgresBookPersistenceBackend",
        operation: "createBackup",
        persistenceBackend: "postgres",
        bookId,
      });

      const book = await this.load(bookId, { logger: requestLogger });
      const createdAt = new Date().toISOString();
      const backupId = `backup-${createdAt.replace(/:/g, "_")}`;
      const serialized = `${JSON.stringify(book)}\n`;
      const sizeBytes = Buffer.byteLength(serialized, "utf8");

      try {
        await ensureSchema();
        await pool.query(
          `
            INSERT INTO workspace_backups (id, workspace_id, created_at, document_json, size_bytes)
            VALUES ($1, $2, $3, $4, $5)
          `,
          [backupId, bookId, createdAt, serialized, sizeBytes],
        );

        return {
          createdAt,
          fileName: `${backupId}.json`,
          id: backupId,
          sizeBytes,
          bookId,
        };
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }

        throw new ApiError({
          cause: error,
          code: "repository.unavailable",
          expose: false,
          message: "Book storage is unavailable.",
          status: 500,
        });
      }
    },

    async restoreBackup(
      bookId: string,
      backupId: string,
      options: { logger?: Logger } = {},
    ): Promise<FinanceBookDocument> {
      validateBookIdentifier(bookId);
      validateBackupIdentifier(backupId);
      const requestLogger = (options.logger ?? logger).child({
        backupId,
        component: "postgresBookPersistenceBackend",
        operation: "restoreBackup",
        persistenceBackend: "postgres",
        bookId,
      });

      try {
        await ensureSchema();
        const result = await pool.query<BackupRow>(
          `
            SELECT id, workspace_id, created_at, size_bytes, document_json
            FROM workspace_backups
            WHERE workspace_id = $1 AND id = $2
          `,
          [bookId, backupId],
        );
        const row = result.rows[0];

        if (!row) {
          throw new ApiError({
            code: "book.not_found",
            message: `Backup ${backupId} was not found for book ${bookId}.`,
            status: 404,
          });
        }

        const document = parseBookDocument(row.document_json);

        if (document.id !== bookId) {
          throw new ApiError({
            code: "repository.invalid_identifier",
            message: "Backup book identifier does not match the requested book.",
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
          message: "Book storage is unavailable.",
          status: 500,
        });
      }
    },
  };
}
