import { readFile, writeFile } from "node:fs/promises";
import { createNoopLogger, type Logger } from "@tally/logging";
import { migrateBookDocument } from "./migrate";
import type { FinanceBookDocument } from "./types";

export interface StorageOptions {
  logger?: Logger;
}

export async function loadBookFromFile(
  path: string,
  options: StorageOptions = {},
): Promise<FinanceBookDocument> {
  const logger = (options.logger ?? createNoopLogger()).child({
    operation: "loadBookFromFile",
    path,
  });
  logger.info("book storage load started");

  try {
    const contents = await readFile(path, "utf8");
    const document = migrateBookDocument(JSON.parse(contents) as unknown);

    logger.info("book storage load completed", {
      transactionCount: document.transactions.length,
      bookId: document.id,
    });

    return document;
  } catch (error) {
    logger.error("book storage load failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function saveBookToFile(
  path: string,
  document: FinanceBookDocument,
  options: StorageOptions = {},
): Promise<void> {
  const logger = (options.logger ?? createNoopLogger()).child({
    operation: "saveBookToFile",
    path,
    bookId: document.id,
  });
  logger.info("book storage save started", {
    transactionCount: document.transactions.length,
  });

  try {
    await writeFile(path, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    logger.info("book storage save completed");
  } catch (error) {
    logger.error("book storage save failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
