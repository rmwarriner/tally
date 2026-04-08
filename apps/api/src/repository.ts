import { createNoopLogger, type Logger } from "@tally/logging";
import type { FinanceBookDocument } from "@tally/book";
import {
  createFileSystemBookPersistenceBackend,
  type BookBackup,
  type BookPersistenceBackend,
} from "./persistence";

export interface BookRepository {
  createBackup(bookId: string, options?: { logger?: Logger }): Promise<BookBackup>;
  listBookIds(options?: { logger?: Logger }): Promise<string[]>;
  listBackups(bookId: string, options?: { logger?: Logger }): Promise<BookBackup[]>;
  load(bookId: string, options?: { logger?: Logger }): Promise<FinanceBookDocument>;
  restoreBackup(
    bookId: string,
    backupId: string,
    options?: { logger?: Logger },
  ): Promise<FinanceBookDocument>;
  save(
    document: FinanceBookDocument,
    options?: { expectedVersion?: number; logger?: Logger },
  ): Promise<void>;
}

export function createBookRepository(params: {
  backend: BookPersistenceBackend;
  logger?: Logger;
}): BookRepository {
  const logger = (params.logger ?? createNoopLogger()).child({
    component: "bookRepository",
    persistenceBackend: params.backend.kind,
  });

  return {
    async listBookIds(options: { logger?: Logger } = {}): Promise<string[]> {
      return params.backend.listBookIds({
        logger: (options.logger ?? logger).child({
          component: "bookRepository",
          operation: "listBookIds",
          persistenceBackend: params.backend.kind,
        }),
      });
    },
    async load(bookId: string, options: { logger?: Logger } = {}): Promise<FinanceBookDocument> {
      return params.backend.load(bookId, {
        logger: (options.logger ?? logger).child({
          component: "bookRepository",
          operation: "loadBook",
          persistenceBackend: params.backend.kind,
          bookId,
        }),
      });
    },
    async save(
      document: FinanceBookDocument,
      options: { expectedVersion?: number; logger?: Logger } = {},
    ): Promise<void> {
      await params.backend.save(document, {
        expectedVersion: options.expectedVersion,
        logger: (options.logger ?? logger).child({
          component: "bookRepository",
          operation: "saveBook",
          persistenceBackend: params.backend.kind,
          bookId: document.id,
        }),
      });
    },
    async listBackups(bookId: string, options: { logger?: Logger } = {}): Promise<BookBackup[]> {
      return params.backend.listBackups(bookId, {
        logger: (options.logger ?? logger).child({
          component: "bookRepository",
          operation: "listBackups",
          persistenceBackend: params.backend.kind,
          bookId,
        }),
      });
    },
    async createBackup(bookId: string, options: { logger?: Logger } = {}): Promise<BookBackup> {
      return params.backend.createBackup(bookId, {
        logger: (options.logger ?? logger).child({
          component: "bookRepository",
          operation: "createBackup",
          persistenceBackend: params.backend.kind,
          bookId,
        }),
      });
    },
    async restoreBackup(
      bookId: string,
      backupId: string,
      options: { logger?: Logger } = {},
    ): Promise<FinanceBookDocument> {
      return params.backend.restoreBackup(bookId, backupId, {
        logger: (options.logger ?? logger).child({
          backupId,
          component: "bookRepository",
          operation: "restoreBackup",
          persistenceBackend: params.backend.kind,
          bookId,
        }),
      });
    },
  };
}

export function createFileSystemBookRepository(params: {
  logger?: Logger;
  rootDirectory: string;
}): BookRepository {
  return createBookRepository({
    backend: createFileSystemBookPersistenceBackend(params),
    logger: params.logger,
  });
}

export type { BookBackup } from "./persistence";
