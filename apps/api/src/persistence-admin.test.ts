import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoWorkspace } from "@gnucash-ng/workspace";
import {
  createFileSystemWorkspacePersistenceBackend,
  copyWorkspaceBetweenBackends,
  createSqliteWorkspacePersistenceBackend,
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
        "--workspace-id",
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
        "/tmp/target/workspaces.sqlite",
        "--report-path",
        "/tmp/report.json",
      ]),
    ).toMatchObject({
      backupTarget: true,
      command: "copy",
      dryRun: true,
      reportPath: "/tmp/report.json",
      workspaceId: "workspace-a",
    });

    expect(
      parsePersistenceAdminCommand([
        "export",
        "--workspace-id",
        "workspace-a",
        "--backend",
        "json",
        "--data-dir",
        "/tmp/source",
        "--output",
        "/tmp/export/workspace.json",
        "--dry-run",
      ]),
    ).toMatchObject({
      command: "export",
      dryRun: true,
      workspaceId: "workspace-a",
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
        "/tmp/target/workspaces.sqlite",
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
        "/tmp/target/workspaces.sqlite",
      ]),
    ).toMatchObject({
      command: "retry-failures",
      onError: "halt",
      retryReportPath: "/tmp/report.json",
    });

    expect(
      parsePersistenceAdminCommand([
        "import",
        "--workspace-id",
        "workspace-a",
        "--rollback-on-failure",
        "--backend",
        "sqlite",
        "--sqlite-path",
        "/tmp/target/workspaces.sqlite",
        "--input",
        "/tmp/export/workspace.json",
      ]),
    ).toMatchObject({
      command: "import",
      rollbackOnFailure: true,
      workspaceId: "workspace-a",
    });
  });

  it("copies a workspace between json and sqlite backends", async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), "gnucash-ng-copy-source-"));
    const targetDirectory = await mkdtemp(join(tmpdir(), "gnucash-ng-copy-target-"));
    cleanupPaths.push(sourceDirectory, targetDirectory);

    const source = createFileSystemWorkspacePersistenceBackend({
      rootDirectory: sourceDirectory,
    });
    const target = createSqliteWorkspacePersistenceBackend({
      databasePath: join(targetDirectory, "workspaces.sqlite"),
    });
    const workspace = createDemoWorkspace();

    await source.save(workspace);
    await copyWorkspaceBetweenBackends({
      source,
      sourceWorkspaceId: workspace.id,
      target,
    });

    const loaded = await target.load(workspace.id);
    expect(loaded.id).toBe(workspace.id);

    await Promise.all([source.close?.(), target.close?.()]);
  });

  it("exports from json and imports into sqlite through the admin runner", async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), "gnucash-ng-export-source-"));
    const targetDirectory = await mkdtemp(join(tmpdir(), "gnucash-ng-export-target-"));
    cleanupPaths.push(sourceDirectory, targetDirectory);
    const outputPath = join(targetDirectory, "workspace-export.json");
    const source = createFileSystemWorkspacePersistenceBackend({
      rootDirectory: sourceDirectory,
    });
    const workspace = createDemoWorkspace();
    await source.save(workspace);

    await runPersistenceAdminCommand({
      argv: [
        "export",
        "--workspace-id",
        workspace.id,
        "--backend",
        "json",
        "--data-dir",
        sourceDirectory,
        "--output",
        outputPath,
      ],
    });

    const exported = JSON.parse(await readFile(outputPath, "utf8")) as { id: string };
    expect(exported.id).toBe(workspace.id);

    await runPersistenceAdminCommand({
      argv: [
        "import",
        "--workspace-id",
        workspace.id,
        "--backend",
        "sqlite",
        "--sqlite-path",
        join(targetDirectory, "workspaces.sqlite"),
        "--input",
        outputPath,
      ],
    });

    const target = createSqliteWorkspacePersistenceBackend({
      databasePath: join(targetDirectory, "workspaces.sqlite"),
    });
    const imported = await target.load(workspace.id);
    expect(imported.id).toBe(workspace.id);

    await Promise.all([source.close?.(), target.close?.()]);
  });

  it("supports dry-run copy reports without writing the target workspace", async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), "gnucash-ng-copy-report-source-"));
    const targetDirectory = await mkdtemp(join(tmpdir(), "gnucash-ng-copy-report-target-"));
    cleanupPaths.push(sourceDirectory, targetDirectory);
    const reportPath = join(targetDirectory, "copy-report.json");

    const source = createFileSystemWorkspacePersistenceBackend({
      rootDirectory: sourceDirectory,
    });
    const workspace = createDemoWorkspace();
    await source.save(workspace);

    await runPersistenceAdminCommand({
      argv: [
        "copy",
        "--workspace-id",
        workspace.id,
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
      targetWorkspaceWasPresent: boolean;
    };
    expect(report.command).toBe("copy");
    expect(report.dryRun).toBe(true);
    expect(report.sourceValidation?.ok).toBe(true);
    expect(report.targetWorkspaceWasPresent).toBe(false);
    const target = createSqliteWorkspacePersistenceBackend({
      databasePath: join(targetDirectory, "workspaces.sqlite"),
    });
    await expect(target.load(workspace.id)).rejects.toMatchObject({
      code: "workspace.not_found",
    });
    await target.close?.();

    await source.close?.();
  });

  it("copies all workspaces between backends through the admin runner", async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), "gnucash-ng-copy-all-source-"));
    const targetDirectory = await mkdtemp(join(tmpdir(), "gnucash-ng-copy-all-target-"));
    cleanupPaths.push(sourceDirectory, targetDirectory);
    const reportPath = join(targetDirectory, "copy-all-report.json");

    const source = createFileSystemWorkspacePersistenceBackend({
      rootDirectory: sourceDirectory,
    });
    const firstWorkspace = createDemoWorkspace();
    const secondWorkspace = {
      ...createDemoWorkspace(),
      id: "workspace-household-second",
      name: "Second Household",
    };
    await source.save(firstWorkspace);
    await source.save(secondWorkspace);

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
      results: Array<{ workspaceId: string }>;
      workspaceIds: string[];
    };
    expect(report.command).toBe("copy-all");
    expect(report.workspaceIds).toEqual([firstWorkspace.id, secondWorkspace.id]);
    expect(report.results).toHaveLength(2);

    const target = createSqliteWorkspacePersistenceBackend({
      databasePath: join(targetDirectory, "workspaces.sqlite"),
    });
    expect(await target.listWorkspaceIds()).toEqual([firstWorkspace.id, secondWorkspace.id]);
    await target.close?.();
    await source.close?.();
  });

  it("halts copy-all on the first failure by default and preserves the report", async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), "gnucash-ng-copy-all-fail-source-"));
    const targetDirectory = await mkdtemp(join(tmpdir(), "gnucash-ng-copy-all-fail-target-"));
    cleanupPaths.push(sourceDirectory, targetDirectory);
    const reportPath = join(targetDirectory, "copy-all-fail-report.json");

    const source = createFileSystemWorkspacePersistenceBackend({
      rootDirectory: sourceDirectory,
    });
    const target = createSqliteWorkspacePersistenceBackend({
      databasePath: join(targetDirectory, "workspaces.sqlite"),
    });
    const firstWorkspace = createDemoWorkspace();
    const invalidSecondWorkspace = {
      ...createDemoWorkspace(),
      id: "workspace-household-second",
      name: "Invalid Second",
      transactions: [
        {
          ...createDemoWorkspace().transactions[0]!,
          postings: [
            {
              ...createDemoWorkspace().transactions[0]!.postings[0]!,
              accountId: "missing-account",
            },
            createDemoWorkspace().transactions[0]!.postings[1]!,
          ],
        },
      ],
    };
    const existingSecondWorkspace = {
      ...createDemoWorkspace(),
      id: "workspace-household-second",
      name: "Existing Second",
    };
    const thirdWorkspace = {
      ...createDemoWorkspace(),
      id: "workspace-household-third",
      name: "Third Household",
    };

    await source.save(firstWorkspace);
    await source.save(invalidSecondWorkspace as never);
    await source.save(thirdWorkspace);
    await target.save(existingSecondWorkspace);

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
      failures: Array<{ workspaceId: string }>;
      halted: boolean;
      onError: string;
      successCount: number;
    };
    expect(report.onError).toBe("halt");
    expect(report.halted).toBe(true);
    expect(report.successCount).toBe(1);
    expect(report.failureCount).toBe(1);
    expect(report.failures[0]?.workspaceId).toBe("workspace-household-second");
    expect(await target.listWorkspaceIds()).toEqual([firstWorkspace.id, existingSecondWorkspace.id]);
    expect((await target.load(existingSecondWorkspace.id)).name).toBe("Existing Second");
    await expect(target.load(thirdWorkspace.id)).rejects.toMatchObject({
      code: "workspace.not_found",
    });

    await Promise.all([source.close?.(), target.close?.()]);
  });

  it("can continue copy-all after failures when explicitly requested", async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), "gnucash-ng-copy-all-continue-source-"));
    const targetDirectory = await mkdtemp(join(tmpdir(), "gnucash-ng-copy-all-continue-target-"));
    cleanupPaths.push(sourceDirectory, targetDirectory);
    const reportPath = join(targetDirectory, "copy-all-continue-report.json");

    const source = createFileSystemWorkspacePersistenceBackend({
      rootDirectory: sourceDirectory,
    });
    const target = createSqliteWorkspacePersistenceBackend({
      databasePath: join(targetDirectory, "workspaces.sqlite"),
    });
    const firstWorkspace = createDemoWorkspace();
    const invalidSecondWorkspace = {
      ...createDemoWorkspace(),
      id: "workspace-household-second",
      transactions: [
        {
          ...createDemoWorkspace().transactions[0]!,
          postings: [
            {
              ...createDemoWorkspace().transactions[0]!.postings[0]!,
              accountId: "missing-account",
            },
            createDemoWorkspace().transactions[0]!.postings[1]!,
          ],
        },
      ],
    };
    const existingSecondWorkspace = {
      ...createDemoWorkspace(),
      id: "workspace-household-second",
      name: "Existing Second",
    };
    const thirdWorkspace = {
      ...createDemoWorkspace(),
      id: "workspace-household-third",
      name: "Third Household",
    };

    await source.save(firstWorkspace);
    await source.save(invalidSecondWorkspace as never);
    await source.save(thirdWorkspace);
    await target.save(existingSecondWorkspace);

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
    expect(await target.listWorkspaceIds()).toEqual([
      firstWorkspace.id,
      existingSecondWorkspace.id,
      thirdWorkspace.id,
    ]);
    expect((await target.load(thirdWorkspace.id)).name).toBe("Third Household");

    await Promise.all([source.close?.(), target.close?.()]);
  });

  it("retries only failed workspaces from a prior copy-all report", async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), "gnucash-ng-retry-source-"));
    const targetDirectory = await mkdtemp(join(tmpdir(), "gnucash-ng-retry-target-"));
    cleanupPaths.push(sourceDirectory, targetDirectory);
    const failureReportPath = join(targetDirectory, "copy-all-failure-report.json");
    const retryReportPath = join(targetDirectory, "retry-report.json");

    const source = createFileSystemWorkspacePersistenceBackend({
      rootDirectory: sourceDirectory,
    });
    const sourceFix = createFileSystemWorkspacePersistenceBackend({
      rootDirectory: sourceDirectory,
    });
    const target = createSqliteWorkspacePersistenceBackend({
      databasePath: join(targetDirectory, "workspaces.sqlite"),
    });
    const firstWorkspace = createDemoWorkspace();
    const invalidSecondWorkspace = {
      ...createDemoWorkspace(),
      id: "workspace-household-second",
      transactions: [
        {
          ...createDemoWorkspace().transactions[0]!,
          postings: [
            {
              ...createDemoWorkspace().transactions[0]!.postings[0]!,
              accountId: "missing-account",
            },
            createDemoWorkspace().transactions[0]!.postings[1]!,
          ],
        },
      ],
    };
    const secondWorkspace = {
      ...createDemoWorkspace(),
      id: "workspace-household-second",
      name: "Second Household",
    };
    await source.save(firstWorkspace);
    await source.save(invalidSecondWorkspace as never);

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

    await sourceFix.save(secondWorkspace);

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
      workspaceIds: string[];
    };
    expect(retryReport.command).toBe("retry-failures");
    expect(retryReport.failureCount).toBe(0);
    expect(retryReport.successCount).toBe(1);
    expect(retryReport.workspaceIds).toEqual([secondWorkspace.id]);
    expect((await target.load(secondWorkspace.id)).name).toBe(secondWorkspace.name);

    await Promise.all([source.close?.(), sourceFix.close?.(), target.close?.()]);
  });
});
