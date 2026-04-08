import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoBook } from "@tally/book";
import {
  createFileSystemBookPersistenceBackend,
  copyBookBetweenBackends,
  createSqliteBookPersistenceBackend,
} from "./persistence";
import {
  parsePersistenceAdminCommand,
  runPersistenceAdminCommand,
} from "./persistence-admin";

describe("persistence admin", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it("parses copy, export, and import commands", () => {
    expect(
      parsePersistenceAdminCommand([
        "copy",
        "--book-id",
        "workspace-a",
        "--dry-run",
        "--backup-target",
        "--source-backend",
        "json",
        "--source-data-dir",
        "/tmp/source",
        "--target-backend",
        "sqlite",
        "--target-sqlite-path",
        "/tmp/target-core/workspaces.sqlite",
        "--report-path",
        "/tmp/report.json",
      ]),
    ).toMatchObject({
      backupTarget: true,
      command: "copy",
      dryRun: true,
      reportPath: "/tmp/report.json",
      bookId: "workspace-a",
    });

    expect(
      parsePersistenceAdminCommand([
        "export",
        "--book-id",
        "workspace-a",
        "--backend",
        "json",
        "--data-dir",
        "/tmp/source",
        "--output",
        "/tmp/export-core/workspace.json",
        "--dry-run",
      ]),
    ).toMatchObject({
      command: "export",
      dryRun: true,
      bookId: "workspace-a",
    });

    expect(
      parsePersistenceAdminCommand([
        "copy-all",
        "--source-backend",
        "json",
        "--source-data-dir",
        "/tmp/source",
        "--target-backend",
        "sqlite",
        "--target-sqlite-path",
        "/tmp/target-core/workspaces.sqlite",
        "--rollback-on-failure",
        "--on-error",
        "continue",
      ]),
    ).toMatchObject({
      command: "copy-all",
      onError: "continue",
      rollbackOnFailure: true,
    });

    expect(
      parsePersistenceAdminCommand([
        "retry-failures",
        "--retry-report",
        "/tmp/report.json",
        "--source-backend",
        "json",
        "--source-data-dir",
        "/tmp/source",
        "--target-backend",
        "sqlite",
        "--target-sqlite-path",
        "/tmp/target-core/workspaces.sqlite",
      ]),
    ).toMatchObject({
      command: "retry-failures",
      onError: "halt",
      retryReportPath: "/tmp/report.json",
    });

    expect(
      parsePersistenceAdminCommand([
        "import",
        "--book-id",
        "workspace-a",
        "--rollback-on-failure",
        "--backend",
        "sqlite",
        "--sqlite-path",
        "/tmp/target-core/workspaces.sqlite",
        "--input",
        "/tmp/export-core/workspace.json",
      ]),
    ).toMatchObject({
      command: "import",
      rollbackOnFailure: true,
      bookId: "workspace-a",
    });
  });

  it("copies a book between json and sqlite backends", async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), "tally-copy-source-"));
    const targetDirectory = await mkdtemp(join(tmpdir(), "tally-copy-target-"));
    cleanupPaths.push(sourceDirectory, targetDirectory);

    const source = createFileSystemBookPersistenceBackend({
      rootDirectory: sourceDirectory,
    });
    const target = createSqliteBookPersistenceBackend({
      databasePath: join(targetDirectory, "workspaces.sqlite"),
    });
    const book = createDemoBook();

    await source.save(book);
    await copyBookBetweenBackends({
      source,
      sourceBookId: book.id,
      target,
    });

    const loaded = await target.load(book.id);
    expect(loaded.id).toBe(book.id);

    await Promise.all([source.close?.(), target.close?.()]);
  });

  it("exports from json and imports into sqlite through the admin runner", async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), "tally-export-source-"));
    const targetDirectory = await mkdtemp(join(tmpdir(), "tally-export-target-"));
    cleanupPaths.push(sourceDirectory, targetDirectory);
    const outputPath = join(targetDirectory, "workspace-export.json");
    const source = createFileSystemBookPersistenceBackend({
      rootDirectory: sourceDirectory,
    });
    const book = createDemoBook();
    await source.save(book);

    await runPersistenceAdminCommand({
      argv: [
        "export",
        "--book-id",
        book.id,
        "--backend",
        "json",
        "--data-dir",
        sourceDirectory,
        "--output",
        outputPath,
      ],
    });

    const exported = JSON.parse(await readFile(outputPath, "utf8")) as { id: string };
    expect(exported.id).toBe(book.id);

    await runPersistenceAdminCommand({
      argv: [
        "import",
        "--book-id",
        book.id,
        "--backend",
        "sqlite",
        "--sqlite-path",
        join(targetDirectory, "workspaces.sqlite"),
        "--input",
        outputPath,
      ],
    });

    const target = createSqliteBookPersistenceBackend({
      databasePath: join(targetDirectory, "workspaces.sqlite"),
    });
    const imported = await target.load(book.id);
    expect(imported.id).toBe(book.id);

    await Promise.all([source.close?.(), target.close?.()]);
  });

  it("supports dry-run copy reports without writing the target book", async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), "tally-copy-report-source-"));
    const targetDirectory = await mkdtemp(join(tmpdir(), "tally-copy-report-target-"));
    cleanupPaths.push(sourceDirectory, targetDirectory);
    const reportPath = join(targetDirectory, "copy-report.json");

    const source = createFileSystemBookPersistenceBackend({
      rootDirectory: sourceDirectory,
    });
    const book = createDemoBook();
    await source.save(book);

    await runPersistenceAdminCommand({
      argv: [
        "copy",
        "--book-id",
        book.id,
        "--dry-run",
        "--report-path",
        reportPath,
        "--source-backend",
        "json",
        "--source-data-dir",
        sourceDirectory,
        "--target-backend",
        "sqlite",
        "--target-sqlite-path",
        join(targetDirectory, "workspaces.sqlite"),
      ],
    });

    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      command: string;
      dryRun: boolean;
      sourceValidation?: { ok: boolean };
      targetBookWasPresent: boolean;
    };
    expect(report.command).toBe("copy");
    expect(report.dryRun).toBe(true);
    expect(report.sourceValidation?.ok).toBe(true);
    expect(report.targetBookWasPresent).toBe(false);
    const target = createSqliteBookPersistenceBackend({
      databasePath: join(targetDirectory, "workspaces.sqlite"),
    });
    await expect(target.load(book.id)).rejects.toMatchObject({
      code: "book.not_found",
    });
    await target.close?.();

    await source.close?.();
  });

  it("copies all books between backends through the admin runner", async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), "tally-copy-all-source-"));
    const targetDirectory = await mkdtemp(join(tmpdir(), "tally-copy-all-target-"));
    cleanupPaths.push(sourceDirectory, targetDirectory);
    const reportPath = join(targetDirectory, "copy-all-report.json");

    const source = createFileSystemBookPersistenceBackend({
      rootDirectory: sourceDirectory,
    });
    const firstBook = createDemoBook();
    const secondBook = {
      ...createDemoBook(),
      id: "workspace-household-second",
      name: "Second Household",
    };
    await source.save(firstBook);
    await source.save(secondBook);

    await runPersistenceAdminCommand({
      argv: [
        "copy-all",
        "--report-path",
        reportPath,
        "--source-backend",
        "json",
        "--source-data-dir",
        sourceDirectory,
        "--target-backend",
        "sqlite",
        "--target-sqlite-path",
        join(targetDirectory, "workspaces.sqlite"),
      ],
    });

    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      command: string;
      results: Array<{ bookId: string }>;
      bookIds: string[];
    };
    expect(report.command).toBe("copy-all");
    expect(report.bookIds).toEqual([firstBook.id, secondBook.id]);
    expect(report.results).toHaveLength(2);

    const target = createSqliteBookPersistenceBackend({
      databasePath: join(targetDirectory, "workspaces.sqlite"),
    });
    expect(await target.listBookIds()).toEqual([firstBook.id, secondBook.id]);
    await target.close?.();
    await source.close?.();
  });

  it("halts copy-all on the first failure by default and preserves the report", async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), "tally-copy-all-fail-source-"));
    const targetDirectory = await mkdtemp(join(tmpdir(), "tally-copy-all-fail-target-"));
    cleanupPaths.push(sourceDirectory, targetDirectory);
    const reportPath = join(targetDirectory, "copy-all-fail-report.json");

    const source = createFileSystemBookPersistenceBackend({
      rootDirectory: sourceDirectory,
    });
    const target = createSqliteBookPersistenceBackend({
      databasePath: join(targetDirectory, "workspaces.sqlite"),
    });
    const firstBook = createDemoBook();
    const invalidSecondBook = {
      ...createDemoBook(),
      id: "workspace-household-second",
      name: "Invalid Second",
      transactions: [
        {
          ...createDemoBook().transactions[0]!,
          postings: [
            {
              ...createDemoBook().transactions[0]!.postings[0]!,
              accountId: "missing-account",
            },
            createDemoBook().transactions[0]!.postings[1]!,
          ],
        },
      ],
    };
    const existingSecondBook = {
      ...createDemoBook(),
      id: "workspace-household-second",
      name: "Existing Second",
    };
    const thirdBook = {
      ...createDemoBook(),
      id: "workspace-household-third",
      name: "Third Household",
    };

    await source.save(firstBook);
    await source.save(invalidSecondBook as never);
    await source.save(thirdBook);
    await target.save(existingSecondBook);

    await expect(
      runPersistenceAdminCommand({
        argv: [
          "copy-all",
          "--report-path",
          reportPath,
          "--backup-target",
          "--rollback-on-failure",
          "--source-backend",
          "json",
          "--source-data-dir",
          sourceDirectory,
          "--target-backend",
          "sqlite",
          "--target-sqlite-path",
          join(targetDirectory, "workspaces.sqlite"),
        ],
      }),
    ).rejects.toThrow("completed with 1 failure");

    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      failureCount: number;
      failures: Array<{ bookId: string }>;
      halted: boolean;
      onError: string;
      successCount: number;
    };
    expect(report.onError).toBe("halt");
    expect(report.halted).toBe(true);
    expect(report.successCount).toBe(1);
    expect(report.failureCount).toBe(1);
    expect(report.failures[0]?.bookId).toBe("workspace-household-second");
    expect(await target.listBookIds()).toEqual([firstBook.id, existingSecondBook.id]);
    expect((await target.load(existingSecondBook.id)).name).toBe("Existing Second");
    await expect(target.load(thirdBook.id)).rejects.toMatchObject({
      code: "book.not_found",
    });

    await Promise.all([source.close?.(), target.close?.()]);
  });

  it("can continue copy-all after failures when explicitly requested", async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), "tally-copy-all-continue-source-"));
    const targetDirectory = await mkdtemp(join(tmpdir(), "tally-copy-all-continue-target-"));
    cleanupPaths.push(sourceDirectory, targetDirectory);
    const reportPath = join(targetDirectory, "copy-all-continue-report.json");

    const source = createFileSystemBookPersistenceBackend({
      rootDirectory: sourceDirectory,
    });
    const target = createSqliteBookPersistenceBackend({
      databasePath: join(targetDirectory, "workspaces.sqlite"),
    });
    const firstBook = createDemoBook();
    const invalidSecondBook = {
      ...createDemoBook(),
      id: "workspace-household-second",
      transactions: [
        {
          ...createDemoBook().transactions[0]!,
          postings: [
            {
              ...createDemoBook().transactions[0]!.postings[0]!,
              accountId: "missing-account",
            },
            createDemoBook().transactions[0]!.postings[1]!,
          ],
        },
      ],
    };
    const existingSecondBook = {
      ...createDemoBook(),
      id: "workspace-household-second",
      name: "Existing Second",
    };
    const thirdBook = {
      ...createDemoBook(),
      id: "workspace-household-third",
      name: "Third Household",
    };

    await source.save(firstBook);
    await source.save(invalidSecondBook as never);
    await source.save(thirdBook);
    await target.save(existingSecondBook);

    await expect(
      runPersistenceAdminCommand({
        argv: [
          "copy-all",
          "--report-path",
          reportPath,
          "--backup-target",
          "--rollback-on-failure",
          "--on-error",
          "continue",
          "--source-backend",
          "json",
          "--source-data-dir",
          sourceDirectory,
          "--target-backend",
          "sqlite",
          "--target-sqlite-path",
          join(targetDirectory, "workspaces.sqlite"),
        ],
      }),
    ).rejects.toThrow("completed with 1 failure");

    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      failureCount: number;
      halted: boolean;
      onError: string;
      successCount: number;
    };
    expect(report.onError).toBe("continue");
    expect(report.halted).toBe(false);
    expect(report.successCount).toBe(2);
    expect(report.failureCount).toBe(1);
    expect(await target.listBookIds()).toEqual([
      firstBook.id,
      existingSecondBook.id,
      thirdBook.id,
    ]);
    expect((await target.load(thirdBook.id)).name).toBe("Third Household");

    await Promise.all([source.close?.(), target.close?.()]);
  });

  it("retries only failed books from a prior copy-all report", async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), "tally-retry-source-"));
    const targetDirectory = await mkdtemp(join(tmpdir(), "tally-retry-target-"));
    cleanupPaths.push(sourceDirectory, targetDirectory);
    const failureReportPath = join(targetDirectory, "copy-all-failure-report.json");
    const retryReportPath = join(targetDirectory, "retry-report.json");

    const source = createFileSystemBookPersistenceBackend({
      rootDirectory: sourceDirectory,
    });
    const sourceFix = createFileSystemBookPersistenceBackend({
      rootDirectory: sourceDirectory,
    });
    const target = createSqliteBookPersistenceBackend({
      databasePath: join(targetDirectory, "workspaces.sqlite"),
    });
    const firstBook = createDemoBook();
    const invalidSecondBook = {
      ...createDemoBook(),
      id: "workspace-household-second",
      transactions: [
        {
          ...createDemoBook().transactions[0]!,
          postings: [
            {
              ...createDemoBook().transactions[0]!.postings[0]!,
              accountId: "missing-account",
            },
            createDemoBook().transactions[0]!.postings[1]!,
          ],
        },
      ],
    };
    const secondBook = {
      ...createDemoBook(),
      id: "workspace-household-second",
      name: "Second Household",
    };
    await source.save(firstBook);
    await source.save(invalidSecondBook as never);

    await expect(
      runPersistenceAdminCommand({
        argv: [
          "copy-all",
          "--report-path",
          failureReportPath,
          "--source-backend",
          "json",
          "--source-data-dir",
          sourceDirectory,
          "--target-backend",
          "sqlite",
          "--target-sqlite-path",
          join(targetDirectory, "workspaces.sqlite"),
        ],
      }),
    ).rejects.toThrow("copy-all completed with 1 failure");

    await sourceFix.save(secondBook);

    await runPersistenceAdminCommand({
      argv: [
        "retry-failures",
        "--retry-report",
        failureReportPath,
        "--report-path",
        retryReportPath,
        "--source-backend",
        "json",
        "--source-data-dir",
        sourceDirectory,
        "--target-backend",
        "sqlite",
        "--target-sqlite-path",
        join(targetDirectory, "workspaces.sqlite"),
      ],
    });

    const retryReport = JSON.parse(await readFile(retryReportPath, "utf8")) as {
      command: string;
      failureCount: number;
      successCount: number;
      bookIds: string[];
    };
    expect(retryReport.command).toBe("retry-failures");
    expect(retryReport.failureCount).toBe(0);
    expect(retryReport.successCount).toBe(1);
    expect(retryReport.bookIds).toEqual([secondBook.id]);
    expect((await target.load(secondBook.id)).name).toBe(secondBook.name);

    await Promise.all([source.close?.(), sourceFix.close?.(), target.close?.()]);
  });
});
