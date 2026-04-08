import type { Logger } from "@tally/logging";
import type { FinanceBookDocument } from "@tally/book";
import type { ApiPersistenceBackend, ApiRuntimeConfig } from "./config";
import { ApiError } from "./errors";
import { createFileSystemBookPersistenceBackend } from "./persistence-json";
import { createPostgresBookPersistenceBackend } from "./persistence-postgres";
import { createSqliteBookPersistenceBackend } from "./persistence-sqlite";
import {
  validateBookDocumentForPersistence,
  type BookValidationReport,
} from "./persistence-validation";

export type BookPersistenceBackendKind = "json" | "postgres" | "sqlite";

export interface BookBackup {
  createdAt: string;
  fileName: string;
  id: string;
  sizeBytes: number;
  bookId: string;
}

export interface BookPersistenceBackend {
  close?(): Promise<void>;
  kind: BookPersistenceBackendKind;
  createBackup(bookId: string, options?: { logger?: Logger }): Promise<BookBackup>;
  listBookIds(options?: { logger?: Logger }): Promise<string[]>;
  listBackups(bookId: string, options?: { logger?: Logger }): Promise<BookBackup[]>;
  load(bookId: string, options?: { logger?: Logger }): Promise<FinanceBookDocument>;
  restoreBackup(
    bookId: string,
    backupId: string,
    options?: { logger?: Logger },
  ): Promise<FinanceBookDocument>;
  save(document: FinanceBookDocument, options?: { logger?: Logger }): Promise<void>;
}

export interface BookPersistenceOptions {
  dataDirectory: string;
  persistenceBackend: ApiPersistenceBackend;
  postgresUrl: string;
  sqlitePath: string;
}

export interface PersistenceCopyResult {
  dryRun: boolean;
  rolledBack: boolean;
  sourceValidation?: BookValidationReport;
  targetBackupId?: string;
  targetBookId: string;
  targetBookValidation?: BookValidationReport;
  targetBookWasPresent: boolean;
  bookId: string;
}

export type PersistenceCopyManyOnError = "continue" | "halt";

export interface PersistenceCopyFailure {
  code?: string;
  message: string;
  status?: number;
  bookId: string;
}

export interface PersistenceCopyManyResult {
  dryRun: boolean;
  failureCount: number;
  failures: PersistenceCopyFailure[];
  halted: boolean;
  onError: PersistenceCopyManyOnError;
  results: PersistenceCopyResult[];
  successCount: number;
  bookIds: string[];
}

export interface PersistenceExportResult {
  document: FinanceBookDocument;
  dryRun: boolean;
  validation?: BookValidationReport;
}

export interface PersistenceImportResult {
  dryRun: boolean;
  rolledBack: boolean;
  targetBackupId?: string;
  targetBookValidation?: BookValidationReport;
  targetBookWasPresent: boolean;
  bookId: string;
  validation?: BookValidationReport;
}

export interface PersistenceWriteOptions {
  backupTarget?: boolean;
  dryRun?: boolean;
  logger?: Logger;
  rollbackOnFailure?: boolean;
  validate?: boolean;
}

async function loadBookIfExists(params: {
  backend: BookPersistenceBackend;
  logger?: Logger;
  bookId: string;
}): Promise<FinanceBookDocument | undefined> {
  try {
    return await params.backend.load(params.bookId, { logger: params.logger });
  } catch (error) {
    if (error instanceof ApiError && error.code === "book.not_found") {
      return undefined;
    }

    throw error;
  }
}

export function createBookPersistenceBackendFromOptions(params: {
  logger?: Logger;
  options: BookPersistenceOptions;
}): BookPersistenceBackend {
  if (params.options.persistenceBackend === "postgres") {
    return createPostgresBookPersistenceBackend({
      logger: params.logger,
      postgresUrl: params.options.postgresUrl,
    });
  }

  if (params.options.persistenceBackend === "sqlite") {
    return createSqliteBookPersistenceBackend({
      databasePath: params.options.sqlitePath,
      logger: params.logger,
    });
  }

  return createFileSystemBookPersistenceBackend({
    logger: params.logger,
    rootDirectory: params.options.dataDirectory,
  });
}

export function createBookPersistenceBackend(params: {
  config: ApiRuntimeConfig;
  logger?: Logger;
}): BookPersistenceBackend {
  return createBookPersistenceBackendFromOptions({
    logger: params.logger,
    options: {
      dataDirectory: params.config.dataDirectory,
      persistenceBackend: params.config.persistenceBackend,
      postgresUrl: params.config.postgresUrl,
      sqlitePath: params.config.sqlitePath,
    },
  });
}

export async function exportBookDocument(params: {
  backend: BookPersistenceBackend;
  dryRun?: boolean;
  logger?: Logger;
  validate?: boolean;
  bookId: string;
}): Promise<PersistenceExportResult> {
  const document = await params.backend.load(params.bookId, { logger: params.logger });

  return {
    document,
    dryRun: params.dryRun ?? false,
    validation:
      params.validate === false ? undefined : validateBookDocumentForPersistence(document),
  };
}

export async function importBookDocument(params: {
  backend: BookPersistenceBackend;
  document: FinanceBookDocument;
} & PersistenceWriteOptions): Promise<PersistenceImportResult> {
  const validation =
    params.validate === false ? undefined : validateBookDocumentForPersistence(params.document);
  const targetBookId = params.document.id;
  const existingBook = await loadBookIfExists({
    backend: params.backend,
    logger: params.logger,
    bookId: targetBookId,
  });
  const targetBookWasPresent = existingBook !== undefined;

  if (params.dryRun) {
    return {
      dryRun: true,
      rolledBack: false,
      targetBookWasPresent,
      validation,
      bookId: targetBookId,
    };
  }

  let targetBackupId: string | undefined;

  if (params.backupTarget && targetBookWasPresent) {
    const backup = await params.backend.createBackup(targetBookId, { logger: params.logger });
    targetBackupId = backup.id;
  }

  try {
    await params.backend.save(params.document, { logger: params.logger });
    const persistedDocument = await params.backend.load(targetBookId, { logger: params.logger });
    const targetBookValidation =
      params.validate === false ? undefined : validateBookDocumentForPersistence(persistedDocument);

    if (targetBookValidation && !targetBookValidation.ok) {
      throw new Error(`Persisted book ${targetBookId} failed validation after write.`);
    }

    return {
      dryRun: false,
      rolledBack: false,
      targetBackupId,
      targetBookValidation,
      targetBookWasPresent,
      validation,
      bookId: targetBookId,
    };
  } catch (error) {
    if (targetBackupId && params.rollbackOnFailure) {
      await params.backend.restoreBackup(targetBookId, targetBackupId, { logger: params.logger });
    }

    throw error;
  }
}

export async function copyBookBetweenBackends(params: {
  source: BookPersistenceBackend;
  sourceBookId: string;
  target: BookPersistenceBackend;
  targetBookId?: string;
} & PersistenceWriteOptions): Promise<PersistenceCopyResult> {
  const document = await params.source.load(params.sourceBookId, { logger: params.logger });
  const sourceValidation =
    params.validate === false ? undefined : validateBookDocumentForPersistence(document);
  const targetBookId = params.targetBookId ?? document.id;
  const targetDocument =
    targetBookId === document.id
      ? document
      : {
          ...document,
          id: targetBookId,
        };
  const imported = await importBookDocument({
    backend: params.target,
    backupTarget: params.backupTarget,
    document: targetDocument,
    dryRun: params.dryRun,
    logger: params.logger,
    rollbackOnFailure: params.rollbackOnFailure,
    validate: params.validate,
  });

  return {
    dryRun: imported.dryRun,
    rolledBack: imported.rolledBack,
    sourceValidation,
    targetBackupId: imported.targetBackupId,
    targetBookId,
    targetBookValidation: imported.targetBookValidation,
    targetBookWasPresent: imported.targetBookWasPresent,
    bookId: document.id,
  };
}

export async function copyAllBooksBetweenBackends(params: {
  onError?: PersistenceCopyManyOnError;
  source: BookPersistenceBackend;
  target: BookPersistenceBackend;
  bookIds?: string[];
} & PersistenceWriteOptions): Promise<PersistenceCopyManyResult> {
  const bookIds = params.bookIds ?? (await params.source.listBookIds({ logger: params.logger }));
  const failures: PersistenceCopyFailure[] = [];
  const onError = params.onError ?? "halt";
  const results: PersistenceCopyResult[] = [];
  let halted = false;

  for (const bookId of bookIds) {
    try {
      results.push(
        await copyBookBetweenBackends({
          backupTarget: params.backupTarget,
          dryRun: params.dryRun,
          logger: params.logger,
          rollbackOnFailure: params.rollbackOnFailure,
          source: params.source,
          sourceBookId: bookId,
          target: params.target,
          validate: params.validate,
        }),
      );
    } catch (error) {
      failures.push({
        code:
          typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
            ? error.code
            : undefined,
        message: error instanceof Error ? error.message : String(error),
        status:
          typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
            ? error.status
            : undefined,
        bookId,
      });

      if (onError === "halt") {
        halted = true;
        break;
      }
    }
  }

  return {
    dryRun: params.dryRun ?? false,
    failureCount: failures.length,
    failures,
    halted,
    onError,
    results,
    successCount: results.length,
    bookIds,
  };
}

export { createFileSystemBookPersistenceBackend } from "./persistence-json";
export { createPostgresBookPersistenceBackend } from "./persistence-postgres";
export { createSqliteBookPersistenceBackend } from "./persistence-sqlite";
