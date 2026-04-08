import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createNoopLogger, type Logger } from "@tally/logging";
import { createDemoBook } from "@tally/book";
import { saveBookToFile } from "@tally/book/src/node";

export async function ensureDemoBookFile(params: {
  dataDirectory: string;
  logger?: Logger;
}): Promise<void> {
  const logger = (params.logger ?? createNoopLogger()).child({
    component: "demoBookSeed",
    dataDirectory: params.dataDirectory,
  });
  const book = createDemoBook();
  const bookPath = join(params.dataDirectory, `${book.id}.json`);

  try {
    await access(bookPath);
    return;
  } catch {
    await mkdir(params.dataDirectory, { recursive: true });
    await saveBookToFile(bookPath, book, { logger });
    logger.info("seeded demo book", {
      bookId: book.id,
      bookPath,
    });
  }
}
