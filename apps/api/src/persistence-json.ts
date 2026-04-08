import { mkdir, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createNoopLogger, type Logger } from "@tally/logging";
import type { FinanceBookDocument } from "@tally/book";
import { loadBookFromFile, saveBookToFile } from "@tally/book/src/node";
import { ApiError } from "./errors";
import type { BookBackup, BookPersistenceBackend } from "./persistence";

export function createFileSystemBookPersistenceBackend(params: {
  logger?: Logger;
  rootDirectory: string;
}): BookPersistenceBackend {
  const rootDirectory = resolve(params.rootDirectory);
  const logger = (params.logger ?? createNoopLogger()).child({
    component: "fileSystemBookPersistenceBackend",
    persistenceBackend: "json",
    rootDirectory,
  });

  function bookPath(bookId: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(bookId)) {
      throw new ApiError({
        code: "repository.invalid_identifier",
        message: "Book identifier is invalid.",
        status: 400,
      });
    }

    const path = resolve(join(rootDirectory, `${bookId}.json`));

    if (!path.startsWith(`${rootDirectory}/`) && path !== `${rootDirectory}.json`) {
      throw new ApiError({
        code: "repository.invalid_identifier",
        message: "Book identifier is invalid.",
        status: 400,
      });
    }

    return path;
  }

  function backupDirectory(bookId: string): string {
    return resolve(join(rootDirectory, "_backups", bookId));
  }

  function backupPath(bookId: string, backupId: string): string {
    if (!/^[a-zA-Z0-9:._-]+$/.test(backupId)) {
      throw new ApiError({
        code: "repository.invalid_identifier",
        message: "Backup identifier is invalid.",
        status: 400,
      });
    }

    return resolve(join(backupDirectory(bookId), `${backupId}.json`));
  }

  async function describeBackup(bookId: string, fileName: string): Promise<BookBackup> {
    const filePath = resolve(join(backupDirectory(bookId), fileName));
    const fileStats = await stat(filePath);
    const id = fileName.replace(/\.json$/, "");
    const createdAt = id.startsWith("backup-") ? id.slice("backup-".length).replace(/_/g, ":") : id;

    return {
      createdAt,
      fileName,
      id,
      sizeBytes: fileStats.size,
      bookId,
    };
  }

  return {
    kind: "json",

    async listBookIds(options: { logger?: Logger } = {}): Promise<string[]> {
      const requestLogger = (options.logger ?? logger).child({
        component: "fileSystemBookPersistenceBackend",
        operation: "listBookIds",
        persistenceBackend: "json",
        rootDirectory,
      });

      try {
        const entries = await readdir(rootDirectory);
        const bookIds = entries
          .filter((entry) => entry.endsWith(".json"))
          .filter((entry) => !entry.startsWith("_"))
          .map((entry) => entry.replace(/\.json$/, ""))
          .sort((left, right) => left.localeCompare(right));

        requestLogger.info("book id list completed", {
          bookCount: bookIds.length,
        });
        return bookIds;
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
          requestLogger.info("book id list completed", {
            bookCount: 0,
          });
          return [];
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
      const requestLogger = (options.logger ?? logger).child({
        component: "fileSystemBookPersistenceBackend",
        operation: "loadBook",
        persistenceBackend: "json",
        rootDirectory,
        bookId,
      });

      try {
        return await loadBookFromFile(bookPath(bookId), { logger: requestLogger });
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
            code: "book.not_found",
            message: `Workspace ${bookId} was not found.`,
            status: 404,
          });
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
      const requestLogger = (options.logger ?? logger).child({
        component: "fileSystemBookPersistenceBackend",
        operation: "listBackups",
        persistenceBackend: "json",
        rootDirectory,
        bookId,
      });

      try {
        requestLogger.info("book backup list started");
        const directory = backupDirectory(bookId);
        const entries = await readdir(directory);
        const backups = await Promise.all(
          entries
            .filter((entry) => entry.endsWith(".json"))
            .map((entry) => describeBackup(bookId, entry)),
        );

        const sortedBackups = backups.sort((left, right) => right.id.localeCompare(left.id));
        requestLogger.info("book backup list completed", {
          backupCount: sortedBackups.length,
        });
        return sortedBackups;
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
          requestLogger.info("book backup list completed", {
            backupCount: 0,
          });
          return [];
        }

        requestLogger.error("book backup list failed", {
          error: error instanceof Error ? error.message : String(error),
        });
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
      const requestLogger = (options.logger ?? logger).child({
        component: "fileSystemBookPersistenceBackend",
        operation: "createBackup",
        persistenceBackend: "json",
        rootDirectory,
        bookId,
      });

      const book = await this.load(bookId, { logger: requestLogger });
      const createdAt = new Date().toISOString();
      const backupId = `backup-${createdAt.replace(/:/g, "_")}`;
      const directory = backupDirectory(bookId);
      const filePath = backupPath(bookId, backupId);

      try {
        await mkdir(directory, { recursive: true });
        await saveBookToFile(filePath, book, { logger: requestLogger });
        return await describeBackup(bookId, `${backupId}.json`);
      } catch (error) {
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
      const requestLogger = (options.logger ?? logger).child({
        component: "fileSystemBookPersistenceBackend",
        operation: "saveBook",
        persistenceBackend: "json",
        rootDirectory,
        bookId: document.id,
      });

      try {
        await mkdir(rootDirectory, { recursive: true });
        await saveBookToFile(bookPath(document.id), document, { logger: requestLogger });
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
      const requestLogger = (options.logger ?? logger).child({
        backupId,
        component: "fileSystemBookPersistenceBackend",
        operation: "restoreBackup",
        persistenceBackend: "json",
        rootDirectory,
        bookId,
      });

      try {
        const document = await loadBookFromFile(backupPath(bookId, backupId), {
          logger: requestLogger,
        });

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

        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          throw new ApiError({
            cause: error,
            code: "book.not_found",
            message: `Backup ${backupId} was not found for book ${bookId}.`,
            status: 404,
          });
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
