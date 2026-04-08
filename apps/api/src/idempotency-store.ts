import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createNoopLogger, type Logger } from "@tally/logging";
import { Pool } from "pg";
import type { ApiRuntimeConfig } from "./config";

export interface IdempotencyStoredResponse {
  body: unknown;
  headers: Record<string, string>;
  status: number;
}

export type IdempotencyBeginResult =
  | { kind: "started" }
  | { kind: "replay"; response: IdempotencyStoredResponse }
  | { kind: "hash_conflict" }
  | { kind: "in_progress" };

export interface IdempotencyStore {
  close?(): Promise<void>;
  begin(params: {
    expiresAt: string;
    requestHash: string;
    scopeKey: string;
  }): Promise<IdempotencyBeginResult>;
  complete(params: {
    response: IdempotencyStoredResponse;
    scopeKey: string;
  }): Promise<void>;
}

interface JsonRecord {
  createdAt: string;
  expiresAt: string;
  requestHash: string;
  response?: IdempotencyStoredResponse;
  scopeKey: string;
  status: "completed" | "pending";
}

interface JsonStoreData {
  records: JsonRecord[];
}

function nowIso(): string {
  return new Date().toISOString();
}

export function buildIdempotencyRequestHash(input: {
  contentType?: string | null;
  method: string;
  path: string;
  requestBodyBytes: Uint8Array;
}): string {
  const hash = createHash("sha256");
  hash.update(input.method);
  hash.update("\n");
  hash.update(input.path);
  hash.update("\n");
  hash.update(input.contentType ?? "");
  hash.update("\n");
  hash.update(input.requestBodyBytes);
  return hash.digest("hex");
}

function purgeExpired(records: JsonRecord[]): JsonRecord[] {
  const now = nowIso();
  return records.filter((record) => record.expiresAt > now);
}

async function ensureJson(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  try {
    await readFile(filePath, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      const initial: JsonStoreData = { records: [] };
      await writeFile(filePath, `${JSON.stringify(initial, null, 2)}\n`, "utf8");
      return;
    }
    throw error;
  }
}

async function readJson(filePath: string): Promise<JsonStoreData> {
  await ensureJson(filePath);
  return JSON.parse(await readFile(filePath, "utf8")) as JsonStoreData;
}

async function writeJson(filePath: string, data: JsonStoreData): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function createJsonIdempotencyStore(params: {
  filePath: string;
  logger?: Logger;
}): IdempotencyStore {
  const filePath = resolve(params.filePath);
  const logger = (params.logger ?? createNoopLogger()).child({
    component: "jsonIdempotencyStore",
    filePath,
  });

  return {
    async begin(params): Promise<IdempotencyBeginResult> {
      const data = await readJson(filePath);
      data.records = purgeExpired(data.records);
      const existing = data.records.find((record) => record.scopeKey === params.scopeKey);

      if (!existing) {
        data.records.push({
          createdAt: nowIso(),
          expiresAt: params.expiresAt,
          requestHash: params.requestHash,
          scopeKey: params.scopeKey,
          status: "pending",
        });
        await writeJson(filePath, data);
        return { kind: "started" };
      }

      if (existing.requestHash !== params.requestHash) {
        return { kind: "hash_conflict" };
      }

      if (existing.status === "pending") {
        return { kind: "in_progress" };
      }

      if (!existing.response) {
        return { kind: "in_progress" };
      }

      return { kind: "replay", response: existing.response };
    },

    async complete(params): Promise<void> {
      const data = await readJson(filePath);
      data.records = purgeExpired(data.records);
      const record = data.records.find((item) => item.scopeKey === params.scopeKey);
      if (!record) {
        return;
      }
      record.status = "completed";
      record.response = params.response;
      await writeJson(filePath, data);
      logger.debug("idempotency record completed", { scopeKey: params.scopeKey, status: params.response.status });
    },
  };
}

export function createSqliteIdempotencyStore(params: {
  databasePath: string;
}): IdempotencyStore {
  let database: DatabaseSync | null = null;

  async function ensureDatabase(): Promise<DatabaseSync> {
    if (database) return database;
    await mkdir(dirname(resolve(params.databasePath)), { recursive: true });
    database = new DatabaseSync(resolve(params.databasePath));
    database.exec(`
      CREATE TABLE IF NOT EXISTS api_idempotency (
        scope_key TEXT PRIMARY KEY,
        request_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        response_json TEXT,
        response_status INTEGER,
        response_headers_json TEXT
      );
    `);
    return database;
  }

  return {
    async close(): Promise<void> {
      if (database) {
        database.close();
        database = null;
      }
    },

    async begin(params): Promise<IdempotencyBeginResult> {
      const db = await ensureDatabase();
      db.prepare("DELETE FROM api_idempotency WHERE expires_at <= ?").run(nowIso());
      const existing = db
        .prepare("SELECT request_hash, status, response_json, response_status, response_headers_json FROM api_idempotency WHERE scope_key = ?")
        .get(params.scopeKey) as {
        request_hash: string;
        response_headers_json?: string;
        response_json?: string;
        response_status?: number;
        status: "completed" | "pending";
      } | undefined;

      if (!existing) {
        db.prepare(`
          INSERT INTO api_idempotency (scope_key, request_hash, status, created_at, expires_at)
          VALUES (?, ?, 'pending', ?, ?)
        `).run(params.scopeKey, params.requestHash, nowIso(), params.expiresAt);
        return { kind: "started" };
      }

      if (existing.request_hash !== params.requestHash) return { kind: "hash_conflict" };
      if (existing.status === "pending") return { kind: "in_progress" };
      if (!existing.response_json || existing.response_status === undefined) return { kind: "in_progress" };
      return {
        kind: "replay",
        response: {
          body: JSON.parse(existing.response_json),
          headers: existing.response_headers_json ? (JSON.parse(existing.response_headers_json) as Record<string, string>) : {},
          status: existing.response_status,
        },
      };
    },

    async complete(params): Promise<void> {
      const db = await ensureDatabase();
      db.prepare(`
        UPDATE api_idempotency
        SET status = 'completed',
            response_json = ?,
            response_status = ?,
            response_headers_json = ?
        WHERE scope_key = ?
      `).run(
        JSON.stringify(params.response.body),
        params.response.status,
        JSON.stringify(params.response.headers),
        params.scopeKey,
      );
    },
  };
}

export function createPostgresIdempotencyStore(params: {
  postgresUrl: string;
}): IdempotencyStore {
  const pool = new Pool({ connectionString: params.postgresUrl });
  let schemaReady = false;

  async function ensureSchema(): Promise<void> {
    if (schemaReady) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_idempotency (
        scope_key TEXT PRIMARY KEY,
        request_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        response_json TEXT,
        response_status INTEGER,
        response_headers_json TEXT
      );
    `);
    schemaReady = true;
  }

  return {
    async close(): Promise<void> {
      await pool.end();
    },

    async begin(params): Promise<IdempotencyBeginResult> {
      await ensureSchema();
      await pool.query("DELETE FROM api_idempotency WHERE expires_at <= NOW()");
      const existing = await pool.query<{
        request_hash: string;
        response_headers_json?: string;
        response_json?: string;
        response_status?: number;
        status: "completed" | "pending";
      }>("SELECT request_hash, status, response_json, response_status, response_headers_json FROM api_idempotency WHERE scope_key = $1", [
        params.scopeKey,
      ]);

      if (!existing.rows[0]) {
        await pool.query(
          "INSERT INTO api_idempotency (scope_key, request_hash, status, created_at, expires_at) VALUES ($1, $2, 'pending', NOW(), $3::timestamptz)",
          [params.scopeKey, params.requestHash, params.expiresAt],
        );
        return { kind: "started" };
      }

      if (existing.rows[0].request_hash !== params.requestHash) return { kind: "hash_conflict" };
      if (existing.rows[0].status === "pending") return { kind: "in_progress" };
      if (!existing.rows[0].response_json || existing.rows[0].response_status === undefined) return { kind: "in_progress" };
      return {
        kind: "replay",
        response: {
          body: JSON.parse(existing.rows[0].response_json),
          headers: existing.rows[0].response_headers_json
            ? (JSON.parse(existing.rows[0].response_headers_json) as Record<string, string>)
            : {},
          status: existing.rows[0].response_status,
        },
      };
    },

    async complete(params): Promise<void> {
      await ensureSchema();
      await pool.query(
        `
          UPDATE api_idempotency
          SET status = 'completed',
              response_json = $1,
              response_status = $2,
              response_headers_json = $3
          WHERE scope_key = $4
        `,
        [
          JSON.stringify(params.response.body),
          params.response.status,
          JSON.stringify(params.response.headers),
          params.scopeKey,
        ],
      );
    },
  };
}

export function createIdempotencyStore(params: {
  config: ApiRuntimeConfig;
  logger?: Logger;
}): IdempotencyStore {
  if (params.config.persistenceBackend === "sqlite") {
    return createSqliteIdempotencyStore({
      databasePath: params.config.sqlitePath,
    });
  }

  if (params.config.persistenceBackend === "postgres") {
    return createPostgresIdempotencyStore({
      postgresUrl: params.config.postgresUrl,
    });
  }

  return createJsonIdempotencyStore({
    filePath: resolve(params.config.dataDirectory, "_idempotency", "records.json"),
    logger: params.logger,
  });
}
