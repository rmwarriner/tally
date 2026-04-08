import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createNoopLogger, type Logger } from "@tally/logging";
import { migrateBookDocument, type FinanceBookDocument } from "@tally/book";
import { ApiError } from "./errors";
import type { BookBackup, BookPersistenceBackend } from "./persistence";

interface BookRow {
  document_json: string;
  version?: number;
}

interface BackupRow {
  created_at: string;
  document_json: string;
  id: string;
  size_bytes: number;
  workspace_id: string;
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

export function createSqliteBookPersistenceBackend(params: {
  databasePath: string;
  logger?: Logger;
}): BookPersistenceBackend {
  const databasePath = resolve(params.databasePath);
  const logger = (params.logger ?? createNoopLogger()).child({
    component: "sqliteBookPersistenceBackend",
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
        version INTEGER NOT NULL DEFAULT 1,
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
    const columns = database
      .prepare("PRAGMA table_info(workspaces)")
      .all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "version")) {
      database.exec("ALTER TABLE workspaces ADD COLUMN version INTEGER NOT NULL DEFAULT 1;");
    }

    return database;
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
    kind: "sqlite",

    async close(): Promise<void> {
      if (database) {
        database.close();
        database = null;
      }
    },

    async listBookIds(options: { logger?: Logger } = {}): Promise<string[]> {
      const requestLogger = (options.logger ?? logger).child({
        component: "sqliteBookPersistenceBackend",
        databasePath,
        operation: "listBookIds",
        persistenceBackend: "sqlite",
      });

      try {
        const db = await ensureDatabase();
        const rows = db
          .prepare("SELECT id FROM workspaces ORDER BY id ASC")
          .all() as unknown as Array<{ id: string }>;
        const bookIds = rows.map((row) => row.id);

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
        component: "sqliteBookPersistenceBackend",
        databasePath,
        operation: "loadBook",
        persistenceBackend: "sqlite",
        bookId,
      });

      try {
        const db = await ensureDatabase();
        const row = db
          .prepare("SELECT document_json FROM workspaces WHERE id = ?")
          .get(bookId) as BookRow | undefined;

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

    async save(
      document: FinanceBookDocument,
      options: { expectedVersion?: number; logger?: Logger } = {},
    ): Promise<void> {
      validateBookIdentifier(document.id);
      const requestLogger = (options.logger ?? logger).child({
        component: "sqliteBookPersistenceBackend",
        databasePath,
        operation: "saveBook",
        persistenceBackend: "sqlite",
        bookId: document.id,
      });

      try {
        const db = await ensureDatabase();
        const now = new Date().toISOString();
        const existing = db
          .prepare("SELECT version FROM workspaces WHERE id = ?")
          .get(document.id) as { version: number } | undefined;
        const expectedVersion = options.expectedVersion;

        if (expectedVersion !== undefined) {
          if (!existing || existing.version !== expectedVersion) {
            throw new ApiError({
              code: "request.version_conflict",
              details: {
                expectedVersion: existing?.version ?? 0,
                providedVersion: expectedVersion,
              },
              message: "Book version conflict.",
              status: 409,
            });
          }
        }

        const nextVersion = existing ? existing.version + 1 : Math.max(document.version ?? 1, 1);
        const nextDocument = { ...document, version: nextVersion };
        const serialized = `${JSON.stringify(nextDocument)}\n`;

        if (existing) {
          db.prepare(`
            UPDATE workspaces
            SET document_json = ?, version = ?, updated_at = ?
            WHERE id = ?
          `).run(serialized, nextVersion, now, document.id);
        } else {
          db.prepare(`
            INSERT INTO workspaces (id, document_json, version, updated_at)
            VALUES (?, ?, ?, ?)
          `).run(document.id, serialized, nextVersion, now);
        }

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
        component: "sqliteBookPersistenceBackend",
        databasePath,
        operation: "listBackups",
        persistenceBackend: "sqlite",
        bookId,
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
          .all(bookId) as unknown as BackupRow[];

        requestLogger.info("book backup list completed", {
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
          message: "Book storage is unavailable.",
          status: 500,
        });
      }
    },

    async createBackup(bookId: string, options: { logger?: Logger } = {}): Promise<BookBackup> {
      validateBookIdentifier(bookId);
      const requestLogger = (options.logger ?? logger).child({
        component: "sqliteBookPersistenceBackend",
        databasePath,
        operation: "createBackup",
        persistenceBackend: "sqlite",
        bookId,
      });

      const book = await this.load(bookId, { logger: requestLogger });
      const createdAt = new Date().toISOString();
      const backupId = `backup-${createdAt.replace(/:/g, "_")}`;
      const serialized = `${JSON.stringify(book)}\n`;

      try {
        const db = await ensureDatabase();
        db.prepare(`
          INSERT INTO workspace_backups (id, workspace_id, created_at, document_json, size_bytes)
          VALUES (?, ?, ?, ?, ?)
        `).run(backupId, bookId, createdAt, serialized, Buffer.byteLength(serialized, "utf8"));

        return {
          createdAt,
          fileName: `${backupId}.json`,
          id: backupId,
          sizeBytes: Buffer.byteLength(serialized, "utf8"),
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
        component: "sqliteBookPersistenceBackend",
        databasePath,
        operation: "restoreBackup",
        persistenceBackend: "sqlite",
        bookId,
      });

      try {
        const db = await ensureDatabase();
        const row = db
          .prepare(`
            SELECT id, workspace_id, created_at, size_bytes, document_json
            FROM workspace_backups
            WHERE workspace_id = ? AND id = ?
          `)
          .get(bookId, backupId) as BackupRow | undefined;

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
