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
});
