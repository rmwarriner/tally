import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const FIXTURE_BOOK_ID = "workspace-cli-integration";
export const FIXTURE_DEBIT_ACCOUNT_ID = "acct-expense-groceries";
export const FIXTURE_CREDIT_ACCOUNT_ID = "acct-checking";
export const FIXTURE_ADMIN_ACTOR = "api-user";
export const FIXTURE_REVIEWER_ACTOR = "cli-reviewer";
export const FIXTURE_ADMIN_TOKEN_SECRET = "tok_cli_admin_integration_secret";
export const FIXTURE_REVIEWER_TOKEN_SECRET = "tok_cli_reviewer_integration_secret";

function repoRoot(): string {
  return resolve(import.meta.dirname, "../../..");
}

function resolveApiDataDirectory(): string {
  const configured = process.env.TALLY_DATA_DIR;
  if (!configured) {
    return join(repoRoot(), "apps/api/data");
  }

  if (isAbsolute(configured)) {
    return configured;
  }

  // API runtime resolves relative data dir from apps/api working directory.
  return resolve(join(repoRoot(), "apps/api"), configured);
}

function resolveSqlitePath(dataDirectory: string): string {
  const configured = process.env.TALLY_API_SQLITE_PATH;

  if (!configured) {
    return resolve(dataDirectory, "workspaces.sqlite");
  }

  if (isAbsolute(configured)) {
    return configured;
  }

  return resolve(join(repoRoot(), "apps/api"), configured);
}

function removeEphemeralRegressionBooks(dataDirectory: string): void {
  if (!existsSync(dataDirectory)) {
    return;
  }

  const ephemeralPatterns = [
    /^regression(?:-json)?-\d+\.json$/,
    /^cli-integration-\d+\.json$/,
  ];

  for (const fileName of readdirSync(dataDirectory)) {
    if (ephemeralPatterns.some((pattern) => pattern.test(fileName))) {
      unlinkSync(join(dataDirectory, fileName));
    }
  }
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function seedManagedAuthFixture(dataDirectory: string): void {
  const authDirectory = join(dataDirectory, "_auth");
  const managedAuthPath = join(authDirectory, "managed-auth.json");
  mkdirSync(authDirectory, { recursive: true });

  const managedAuthFixture = {
    sessions: [],
    tokens: [
      {
        actor: FIXTURE_ADMIN_ACTOR,
        createdAt: "2026-04-09T00:00:00.000Z",
        createdBy: "fixture-seed",
        id: "tok-cli-admin",
        role: "admin",
        secretHash: hashSecret(FIXTURE_ADMIN_TOKEN_SECRET),
      },
      {
        actor: FIXTURE_REVIEWER_ACTOR,
        createdAt: "2026-04-09T00:00:00.000Z",
        createdBy: "fixture-seed",
        id: "tok-cli-reviewer",
        role: "admin",
        secretHash: hashSecret(FIXTURE_REVIEWER_TOKEN_SECRET),
      },
    ],
  };

  writeFileSync(managedAuthPath, `${JSON.stringify(managedAuthFixture, null, 2)}\n`, "utf8");
}

function seedSqliteFixture(params: {
  fixture: Record<string, unknown>;
  sqlitePath: string;
}): void {
  mkdirSync(dirname(params.sqlitePath), { recursive: true });
  const database = new DatabaseSync(params.sqlitePath);
  try {
    database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        document_json TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS api_tokens (
        id TEXT PRIMARY KEY,
        actor TEXT NOT NULL,
        role TEXT NOT NULL,
        secret_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE TABLE IF NOT EXISTS api_sessions (
        id TEXT PRIMARY KEY,
        token_id TEXT NOT NULL,
        actor TEXT NOT NULL,
        role TEXT NOT NULL,
        secret_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT
      );
    `);

    const now = new Date().toISOString();
    const serialized = `${JSON.stringify(params.fixture)}\n`;
    database
      .prepare(`
        INSERT INTO workspaces (id, document_json, version, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          document_json = excluded.document_json,
          version = excluded.version,
          updated_at = excluded.updated_at
      `)
      .run(FIXTURE_BOOK_ID, serialized, 1, now);

    database.prepare("DELETE FROM api_sessions WHERE token_id IN (?, ?)").run("tok-cli-admin", "tok-cli-reviewer");
    database.prepare("DELETE FROM api_tokens WHERE id IN (?, ?)").run("tok-cli-admin", "tok-cli-reviewer");
    const insertToken = database.prepare(`
      INSERT INTO api_tokens (id, actor, role, secret_hash, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertToken.run(
      "tok-cli-admin",
      FIXTURE_ADMIN_ACTOR,
      "admin",
      hashSecret(FIXTURE_ADMIN_TOKEN_SECRET),
      "2026-04-09T00:00:00.000Z",
      "fixture-seed",
    );
    insertToken.run(
      "tok-cli-reviewer",
      FIXTURE_REVIEWER_ACTOR,
      "admin",
      hashSecret(FIXTURE_REVIEWER_TOKEN_SECRET),
      "2026-04-09T00:00:00.000Z",
      "fixture-seed",
    );
  } finally {
    database.close();
  }
}

export function resetIntegrationFixture(): void {
  const root = repoRoot();
  const sourceTemplatePath = join(root, "apps/api/data/workspace-household-demo.json");
  const dataDirectory = resolveApiDataDirectory();

  if (!existsSync(sourceTemplatePath)) {
    throw new Error(`Missing fixture template: ${sourceTemplatePath}`);
  }

  const template = JSON.parse(readFileSync(sourceTemplatePath, "utf8")) as Record<string, unknown>;
  const fixture = {
    ...template,
    id: FIXTURE_BOOK_ID,
    name: "CLI Integration Fixture",
    version: 1,
    householdMembers: ["Primary", "Partner", "api-user", FIXTURE_REVIEWER_ACTOR],
    householdMemberRoles: {
      Partner: "member",
      Primary: "guardian",
      "api-user": "admin",
      [FIXTURE_REVIEWER_ACTOR]: "admin",
    },
    auditEvents: [],
  };

  mkdirSync(dataDirectory, { recursive: true });
  removeEphemeralRegressionBooks(dataDirectory);
  const targetPath = join(dataDirectory, `${FIXTURE_BOOK_ID}.json`);
  writeFileSync(targetPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  seedManagedAuthFixture(dataDirectory);
  seedSqliteFixture({
    fixture,
    sqlitePath: resolveSqlitePath(dataDirectory),
  });
}
