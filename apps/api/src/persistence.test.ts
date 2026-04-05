import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoWorkspace } from "@gnucash-ng/workspace";
import { createApiRuntimeConfig } from "./config";
import { createWorkspacePersistenceBackend } from "./persistence";
import { createSqliteWorkspacePersistenceBackend } from "./persistence-sqlite";

describe("workspace persistence backends", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it("selects the sqlite backend from runtime config", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gnucash-ng-sqlite-config-"));
    cleanupPaths.push(directory);
    const config = createApiRuntimeConfig(
      {
        GNUCASH_NG_API_RUNTIME_MODE: "development",
        GNUCASH_NG_API_PERSISTENCE_BACKEND: "sqlite",
      },
      directory,
    );

    const backend = createWorkspacePersistenceBackend({ config });

    expect(backend.kind).toBe("sqlite");
    await backend.close?.();
  });

  it("loads, saves, backs up, restores, and migrates workspaces in sqlite", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gnucash-ng-sqlite-"));
    cleanupPaths.push(directory);
    const backend = createSqliteWorkspacePersistenceBackend({
      databasePath: join(directory, "workspaces.sqlite"),
    });

    const workspace = createDemoWorkspace();
    await backend.save(workspace);

    const loaded = await backend.load(workspace.id);
    expect(loaded.id).toBe(workspace.id);

    const backup = await backend.createBackup(workspace.id);
    const backups = await backend.listBackups(workspace.id);
    expect(backup.id).toContain("backup-");
    expect(backups).toHaveLength(1);
    expect(backups[0]?.id).toBe(backup.id);

    workspace.name = "Changed Name";
    await backend.save(workspace);

    const restored = await backend.restoreBackup(workspace.id, backup.id);
    expect(restored.name).toBe("Household Finance");

    await backend.close?.();
  });

  it("loads legacy workspace documents through sqlite migration", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gnucash-ng-sqlite-legacy-"));
    cleanupPaths.push(directory);
    const backend = createSqliteWorkspacePersistenceBackend({
      databasePath: join(directory, "workspaces.sqlite"),
    });

    const legacyDocument = {
      id: "workspace-household-demo",
      name: "Household Finance",
      baseCommodityCode: "USD",
      accounts: [],
      transactions: [],
    };

    const rawBackend = backend as unknown as {
      save(document: unknown): Promise<void>;
    };
    await rawBackend.save(legacyDocument);

    const loaded = await backend.load("workspace-household-demo");
    expect(loaded.schemaVersion).toBe(1);
    expect(loaded.auditEvents).toEqual([]);

    await backend.close?.();
  });
});
