import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createDemoBook } from "@tally/book";
import { saveBookToFile } from "@tally/book/src/node";
import type { BookPersistenceBackend } from "./persistence";
import { createFileSystemBookRepository, createBookRepository } from "./repository";

describe("book repository abstraction", () => {
  it("delegates repository operations through the configured persistence backend", async () => {
    const book = createDemoBook();
    const calls: string[] = [];
    const backend: BookPersistenceBackend = {
      kind: "json",
      async createBackup(bookId) {
        calls.push(`createBackup:${bookId}`);
        return {
          createdAt: "2026-04-05T00:00:00.000Z",
          fileName: "backup-1.json",
          id: "backup-1",
          sizeBytes: 100,
          bookId,
        };
      },
      async listBackups(bookId) {
        calls.push(`listBackups:${bookId}`);
        return [];
      },
      async listBookIds() {
        calls.push("listBookIds");
        return [book.id];
      },
      async load(bookId) {
        calls.push(`load:${bookId}`);
        return book;
      },
      async restoreBackup(bookId, backupId) {
        calls.push(`restoreBackup:${bookId}:${backupId}`);
        return book;
      },
      async save(document) {
        calls.push(`save:${document.id}`);
      },
    };

    const repository = createBookRepository({ backend });

    expect(await repository.load(book.id)).toBe(book);
    await repository.save(book);
    expect(await repository.listBackups(book.id)).toEqual([]);
    await repository.createBackup(book.id);
    expect(await repository.restoreBackup(book.id, "backup-1")).toBe(book);
    expect(calls).toEqual([
      `load:${book.id}`,
      `save:${book.id}`,
      `listBackups:${book.id}`,
      `createBackup:${book.id}`,
      `restoreBackup:${book.id}:backup-1`,
    ]);
  });
});

describe("book repository security", () => {
  it("rejects unsafe book identifiers", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-repo-"));
    const repository = createFileSystemBookRepository({ rootDirectory: directory });

    await expect(repository.load("../secrets")).rejects.toMatchObject({
      code: "repository.invalid_identifier",
      status: 400,
    });

    await rm(directory, { recursive: true, force: true });
  });

  it("loads safe book identifiers from the configured root", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-repo-"));
    const book = createDemoBook();
    await saveBookToFile(join(directory, `${book.id}.json`), book);
    const repository = createFileSystemBookRepository({ rootDirectory: directory });

    const loaded = await repository.load(book.id);

    expect(loaded.id).toBe(book.id);

    await rm(directory, { recursive: true, force: true });
  });

  it("returns a typed not found error for missing books", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-repo-"));
    const repository = createFileSystemBookRepository({ rootDirectory: directory });

    await expect(repository.load("missing-book")).rejects.toMatchObject({
      code: "book.not_found",
      status: 404,
    });

    await rm(directory, { recursive: true, force: true });
  });

  it("creates, lists, and restores backups", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-repo-"));
    const book = createDemoBook();
    await saveBookToFile(join(directory, `${book.id}.json`), book);
    const repository = createFileSystemBookRepository({ rootDirectory: directory });

    const backup = await repository.createBackup(book.id);
    const backups = await repository.listBackups(book.id);

    expect(backup.id).toContain("backup-");
    expect(backups).toHaveLength(1);
    expect(backups[0]?.id).toBe(backup.id);

    book.name = "Changed Name";
    await repository.save(book);

    const restored = await repository.restoreBackup(book.id, backup.id);

    expect(restored.name).toBe("Household Finance");

    await rm(directory, { recursive: true, force: true });
  });

  it("rejects invalid and missing backup identifiers", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-repo-"));
    const book = createDemoBook();
    await saveBookToFile(join(directory, `${book.id}.json`), book);
    const repository = createFileSystemBookRepository({ rootDirectory: directory });

    await expect(repository.restoreBackup(book.id, "../bad-backup")).rejects.toMatchObject({
      code: "repository.invalid_identifier",
      status: 400,
    });

    await expect(repository.restoreBackup(book.id, "backup-missing")).rejects.toMatchObject({
      code: "book.not_found",
      status: 404,
    });

    await rm(directory, { recursive: true, force: true });
  });

  it("rejects restoring a backup whose book id does not match", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-repo-"));
    const book = createDemoBook();
    await saveBookToFile(join(directory, `${book.id}.json`), book);
    const repository = createFileSystemBookRepository({ rootDirectory: directory });

    const otherWorkspace = {
      ...book,
      id: "other-book",
      name: "Other Workspace",
    };
    await mkdir(join(directory, "_backups", book.id), { recursive: true });
    await saveBookToFile(
      join(directory, "_backups", book.id, "backup-manual.json"),
      otherWorkspace,
    );

    await expect(repository.restoreBackup(book.id, "backup-manual")).rejects.toMatchObject({
      code: "repository.invalid_identifier",
      status: 400,
    });

    await rm(directory, { recursive: true, force: true });
  });
});
