import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoBook } from "./factory";
import { loadBookFromFile, saveBookToFile } from "./storage-node";

const temporaryDirectories: string[] = [];

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "tally-storage-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("book file storage", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it("saves and loads migrated book documents", async () => {
    const directory = await createTempDirectory();
    const filePath = join(directory, "book.json");
    const book = createDemoBook();

    await saveBookToFile(filePath, book);
    const loaded = await loadBookFromFile(filePath);

    expect(loaded).toEqual(book);
  });

  it("loads legacy documents through the migration layer", async () => {
    const directory = await createTempDirectory();
    const filePath = join(directory, "legacy.json");
    await writeFile(
      filePath,
      JSON.stringify({
        accounts: [],
        auditEvents: [],
        baseCommodityCode: "USD",
        commodities: [],
        envelopeAllocations: [],
        envelopes: [],
        householdMembers: ["Primary"],
        id: "legacy-book",
        name: "Legacy Workspace",
        reconciliationSessions: [],
        scheduledTransactions: [],
        transactions: [],
      }),
      "utf8",
    );

    const loaded = await loadBookFromFile(filePath);

    expect(loaded.importBatches).toEqual([]);
    expect(loaded.closePeriods).toEqual([]);
    expect(loaded.baselineBudgetLines).toEqual([]);
  });

  it("propagates file save and load failures", async () => {
    const directory = await createTempDirectory();
    const missingParentPath = join(directory, "missing", "book.json");

    await expect(saveBookToFile(missingParentPath, createDemoBook())).rejects.toBeInstanceOf(Error);

    const unreadablePath = join(directory, "broken.json");
    await mkdir(unreadablePath, { recursive: true });

    await expect(loadBookFromFile(unreadablePath)).rejects.toBeInstanceOf(Error);
  });
});
