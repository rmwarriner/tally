import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createDemoWorkspace } from "@tally/workspace";
import { saveWorkspaceToFile } from "@tally/workspace/src/node";
import type { WorkspacePersistenceBackend } from "./persistence";
import { createFileSystemWorkspaceRepository, createWorkspaceRepository } from "./repository";

describe("workspace repository abstraction", () => {
  it("delegates repository operations through the configured persistence backend", async () => {
    const workspace = createDemoWorkspace();
    const calls: string[] = [];
    const backend: WorkspacePersistenceBackend = {
      kind: "json",
      async createBackup(workspaceId) {
        calls.push(`createBackup:${workspaceId}`);
        return {
          createdAt: "2026-04-05T00:00:00.000Z",
          fileName: "backup-1.json",
          id: "backup-1",
          sizeBytes: 100,
          workspaceId,
        };
      },
      async listBackups(workspaceId) {
        calls.push(`listBackups:${workspaceId}`);
        return [];
      },
      async listWorkspaceIds() {
        calls.push("listWorkspaceIds");
        return [workspace.id];
      },
      async load(workspaceId) {
        calls.push(`load:${workspaceId}`);
        return workspace;
      },
      async restoreBackup(workspaceId, backupId) {
        calls.push(`restoreBackup:${workspaceId}:${backupId}`);
        return workspace;
      },
      async save(document) {
        calls.push(`save:${document.id}`);
      },
    };

    const repository = createWorkspaceRepository({ backend });

    expect(await repository.load(workspace.id)).toBe(workspace);
    await repository.save(workspace);
    expect(await repository.listBackups(workspace.id)).toEqual([]);
    await repository.createBackup(workspace.id);
    expect(await repository.restoreBackup(workspace.id, "backup-1")).toBe(workspace);
    expect(calls).toEqual([
      `load:${workspace.id}`,
      `save:${workspace.id}`,
      `listBackups:${workspace.id}`,
      `createBackup:${workspace.id}`,
      `restoreBackup:${workspace.id}:backup-1`,
    ]);
  });
});

describe("workspace repository security", () => {
  it("rejects unsafe workspace identifiers", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-repo-"));
    const repository = createFileSystemWorkspaceRepository({ rootDirectory: directory });

    await expect(repository.load("../secrets")).rejects.toMatchObject({
      code: "repository.invalid_identifier",
      status: 400,
    });

    await rm(directory, { recursive: true, force: true });
  });

  it("loads safe workspace identifiers from the configured root", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-repo-"));
    const workspace = createDemoWorkspace();
    await saveWorkspaceToFile(join(directory, `${workspace.id}.json`), workspace);
    const repository = createFileSystemWorkspaceRepository({ rootDirectory: directory });

    const loaded = await repository.load(workspace.id);

    expect(loaded.id).toBe(workspace.id);

    await rm(directory, { recursive: true, force: true });
  });

  it("returns a typed not found error for missing workspaces", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-repo-"));
    const repository = createFileSystemWorkspaceRepository({ rootDirectory: directory });

    await expect(repository.load("missing-workspace")).rejects.toMatchObject({
      code: "workspace.not_found",
      status: 404,
    });

    await rm(directory, { recursive: true, force: true });
  });

  it("creates, lists, and restores backups", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-repo-"));
    const workspace = createDemoWorkspace();
    await saveWorkspaceToFile(join(directory, `${workspace.id}.json`), workspace);
    const repository = createFileSystemWorkspaceRepository({ rootDirectory: directory });

    const backup = await repository.createBackup(workspace.id);
    const backups = await repository.listBackups(workspace.id);

    expect(backup.id).toContain("backup-");
    expect(backups).toHaveLength(1);
    expect(backups[0]?.id).toBe(backup.id);

    workspace.name = "Changed Name";
    await repository.save(workspace);

    const restored = await repository.restoreBackup(workspace.id, backup.id);

    expect(restored.name).toBe("Household Finance");

    await rm(directory, { recursive: true, force: true });
  });

  it("rejects invalid and missing backup identifiers", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-repo-"));
    const workspace = createDemoWorkspace();
    await saveWorkspaceToFile(join(directory, `${workspace.id}.json`), workspace);
    const repository = createFileSystemWorkspaceRepository({ rootDirectory: directory });

    await expect(repository.restoreBackup(workspace.id, "../bad-backup")).rejects.toMatchObject({
      code: "repository.invalid_identifier",
      status: 400,
    });

    await expect(repository.restoreBackup(workspace.id, "backup-missing")).rejects.toMatchObject({
      code: "workspace.not_found",
      status: 404,
    });

    await rm(directory, { recursive: true, force: true });
  });

  it("rejects restoring a backup whose workspace id does not match", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-repo-"));
    const workspace = createDemoWorkspace();
    await saveWorkspaceToFile(join(directory, `${workspace.id}.json`), workspace);
    const repository = createFileSystemWorkspaceRepository({ rootDirectory: directory });

    const otherWorkspace = {
      ...workspace,
      id: "other-workspace",
      name: "Other Workspace",
    };
    await mkdir(join(directory, "_backups", workspace.id), { recursive: true });
    await saveWorkspaceToFile(
      join(directory, "_backups", workspace.id, "backup-manual.json"),
      otherWorkspace,
    );

    await expect(repository.restoreBackup(workspace.id, "backup-manual")).rejects.toMatchObject({
      code: "repository.invalid_identifier",
      status: 400,
    });

    await rm(directory, { recursive: true, force: true });
  });
});
