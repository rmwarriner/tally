import { readFile, writeFile } from "node:fs/promises";
import { createNoopLogger, type Logger } from "@gnucash-ng/logging";
import { migrateWorkspaceDocument } from "./migrate";
import type { FinanceWorkspaceDocument } from "./types";

export interface StorageOptions {
  logger?: Logger;
}

export async function loadWorkspaceFromFile(
  path: string,
  options: StorageOptions = {},
): Promise<FinanceWorkspaceDocument> {
  const logger = (options.logger ?? createNoopLogger()).child({
    operation: "loadWorkspaceFromFile",
    path,
  });
  logger.info("workspace storage load started");

  try {
    const contents = await readFile(path, "utf8");
    const document = migrateWorkspaceDocument(JSON.parse(contents) as unknown);

    logger.info("workspace storage load completed", {
      transactionCount: document.transactions.length,
      workspaceId: document.id,
    });

    return document;
  } catch (error) {
    logger.error("workspace storage load failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function saveWorkspaceToFile(
  path: string,
  document: FinanceWorkspaceDocument,
  options: StorageOptions = {},
): Promise<void> {
  const logger = (options.logger ?? createNoopLogger()).child({
    operation: "saveWorkspaceToFile",
    path,
    workspaceId: document.id,
  });
  logger.info("workspace storage save started", {
    transactionCount: document.transactions.length,
  });

  try {
    await writeFile(path, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    logger.info("workspace storage save completed");
  } catch (error) {
    logger.error("workspace storage save failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
