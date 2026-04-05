import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoWorkspace } from "@gnucash-ng/workspace";
import { createApiRuntimeConfig } from "./config";
import {
  createWorkspacePersistenceBackend,
  importWorkspaceDocument,
} from "./persistence";
import {
  createPostgresWorkspacePersistenceBackend,
  type PostgresQueryable,
} from "./persistence-postgres";
import { createSqliteWorkspacePersistenceBackend } from "./persistence-sqlite";
import { validateWorkspaceDocumentForPersistence } from "./persistence-validation";

class FakePostgresPool implements PostgresQueryable {
  private readonly backups = new Map<string, Array<{
    created_at: string;
    document_json: string;
    id: string;
    size_bytes: number;
    workspace_id: string;
  }>>();

  private readonly workspaces = new Map<string, string>();
  public ended = false;

  async end(): Promise<void> {
    this.ended = true;
  }

  async query<TResult extends object = Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ): Promise<{ rowCount: number; rows: TResult[] }> {
    const normalized = text.replace(/\s+/g, " ").trim();

    if (
      normalized.startsWith("CREATE TABLE IF NOT EXISTS workspaces") ||
      normalized.startsWith("CREATE TABLE IF NOT EXISTS workspace_backups") ||
      normalized.startsWith("CREATE INDEX IF NOT EXISTS workspace_backups_workspace_created_idx")
    ) {
      return { rowCount: 0, rows: [] };
    }

    if (normalized.startsWith("SELECT document_json FROM workspaces WHERE id = $1")) {
      const workspaceId = String(params[0]);
      const documentJson = this.workspaces.get(workspaceId);
      return {
        rowCount: documentJson ? 1 : 0,
        rows: documentJson ? ([{ document_json: documentJson }] as unknown as TResult[]) : [],
      };
    }

    if (normalized.startsWith("SELECT id FROM workspaces ORDER BY id ASC")) {
      const rows = [...this.workspaces.keys()]
        .sort((left, right) => left.localeCompare(right))
        .map((id) => ({ id }));
      return {
        rowCount: rows.length,
        rows: rows as unknown as TResult[],
      };
    }

    if (normalized.includes("INSERT INTO workspaces (id, document_json, updated_at)")) {
      this.workspaces.set(String(params[0]), String(params[1]));
      return { rowCount: 1, rows: [] };
    }

    if (normalized.includes("INSERT INTO workspace_backups")) {
      const row = {
        id: String(params[0]),
        workspace_id: String(params[1]),
        created_at: String(params[2]),
        document_json: String(params[3]),
        size_bytes: Number(params[4]),
      };
      const current = this.backups.get(row.workspace_id) ?? [];
      current.push(row);
      this.backups.set(row.workspace_id, current);
      return { rowCount: 1, rows: [] };
    }

    if (normalized.includes("FROM workspace_backups WHERE workspace_id = $1 ORDER BY id DESC")) {
      const rows = [...(this.backups.get(String(params[0])) ?? [])].sort((left, right) =>
        right.id.localeCompare(left.id),
      );
      return { rowCount: rows.length, rows: rows as unknown as TResult[] };
    }

    if (normalized.includes("FROM workspace_backups WHERE workspace_id = $1 AND id = $2")) {
      const row = (this.backups.get(String(params[0])) ?? []).find((candidate) => candidate.id === String(params[1]));
      return {
        rowCount: row ? 1 : 0,
        rows: row ? ([row] as unknown as TResult[]) : [],
      };
    }

    throw new Error(`Unsupported fake postgres query: ${normalized}`);
  }
}

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

  it("selects the postgres backend from runtime config", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gnucash-ng-postgres-config-"));
    cleanupPaths.push(directory);
    const config = createApiRuntimeConfig(
      {
        GNUCASH_NG_API_RUNTIME_MODE: "development",
        GNUCASH_NG_API_PERSISTENCE_BACKEND: "postgres",
        GNUCASH_NG_API_POSTGRES_URL: "postgres://ledger:test@localhost:5432/ledger",
      },
      directory,
    );

    const backend = createWorkspacePersistenceBackend({ config });

    expect(backend.kind).toBe("postgres");
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
    expect(await backend.listWorkspaceIds()).toEqual([workspace.id]);

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

  it("loads, saves, backs up, restores, and migrates workspaces in postgres", async () => {
    const pool = new FakePostgresPool();
    const backend = createPostgresWorkspacePersistenceBackend({
      pool,
      postgresUrl: "postgres://ledger:test@localhost:5432/ledger",
    });

    const workspace = createDemoWorkspace();
    await backend.save(workspace);

    const loaded = await backend.load(workspace.id);
    expect(loaded.id).toBe(workspace.id);
    expect(await backend.listWorkspaceIds()).toEqual([workspace.id]);

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
    expect(pool.ended).toBe(true);
  });

  it("reports validation issues for persistence documents", () => {
    const workspace = createDemoWorkspace();
    workspace.transactions = [
      {
        ...workspace.transactions[0]!,
        id: workspace.transactions[0]!.id,
        postings: [
          {
            ...workspace.transactions[0]!.postings[0]!,
            accountId: "missing-account",
          },
          workspace.transactions[0]!.postings[1]!,
        ],
      },
      workspace.transactions[0]!,
    ];

    const report = validateWorkspaceDocumentForPersistence(workspace);

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.startsWith("Duplicate transaction id "))).toBe(true);
    expect(report.issues.some((issue) => issue.includes("references unknown account missing-account"))).toBe(true);
  });

  it("backs up and rolls back target workspaces when verified imports fail", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gnucash-ng-sqlite-import-rollback-"));
    cleanupPaths.push(directory);
    const backend = createSqliteWorkspacePersistenceBackend({
      databasePath: join(directory, "workspaces.sqlite"),
    });
    const existing = createDemoWorkspace();
    await backend.save(existing);

    const invalidReplacement = {
      ...createDemoWorkspace(),
      id: existing.id,
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

    await expect(
      importWorkspaceDocument({
        backend,
        backupTarget: true,
        document: invalidReplacement,
        rollbackOnFailure: true,
      }),
    ).rejects.toThrow("failed validation after write");

    const loaded = await backend.load(existing.id);
    expect(loaded.name).toBe(existing.name);

    const backups = await backend.listBackups(existing.id);
    expect(backups).toHaveLength(1);

    await backend.close?.();
  });
});
