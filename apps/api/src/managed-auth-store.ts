import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createNoopLogger, type Logger } from "@tally/logging";
import { Pool } from "pg";
import type { ApiRuntimeConfig } from "./config";
import { ApiError } from "./errors";

export interface ManagedAuthToken {
  actor: string;
  createdAt: string;
  createdBy: string;
  id: string;
  revokedAt?: string;
  role: "admin" | "member";
}

export interface ManagedAuthSession {
  actor: string;
  createdAt: string;
  expiresAt: string;
  id: string;
  revokedAt?: string;
  role: "admin" | "member";
  tokenId: string;
}

export type VerifiedManagedCredential =
  | {
      actor: string;
      role: "admin" | "member";
      kind: "managed-token";
      tokenId: string;
    }
  | {
      actor: string;
      role: "admin" | "member";
      kind: "session";
      sessionId: string;
      tokenId: string;
    };

export interface ManagedAuthStore {
  close?(): Promise<void>;
  verifyBearer(secret: string, options?: { logger?: Logger }): Promise<VerifiedManagedCredential | undefined>;
  listTokens(options?: { logger?: Logger }): Promise<ManagedAuthToken[]>;
  issueToken(
    input: { actor: string; createdBy: string; role: "admin" | "member" },
    options?: { logger?: Logger },
  ): Promise<{ secret: string; token: ManagedAuthToken }>;
  revokeToken(tokenId: string, options?: { logger?: Logger }): Promise<ManagedAuthToken | undefined>;
  exchangeSession(
    input: { tokenId: string },
    options?: { logger?: Logger },
  ): Promise<{ secret: string; session: ManagedAuthSession }>;
  revokeSession(sessionId: string, options?: { logger?: Logger }): Promise<ManagedAuthSession | undefined>;
}

interface JsonManagedAuthData {
  sessions: ManagedAuthSessionRecord[];
  tokens: ManagedAuthTokenRecord[];
}

interface ManagedAuthTokenRecord extends ManagedAuthToken {
  secretHash: string;
}

interface ManagedAuthSessionRecord extends ManagedAuthSession {
  secretHash: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function buildSecret(prefix: "tok" | "ses"): string {
  return `${prefix}_${randomBytes(24).toString("hex")}`;
}

async function ensureJsonData(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  try {
    await readFile(filePath, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      const initial: JsonManagedAuthData = { sessions: [], tokens: [] };
      await writeFile(filePath, `${JSON.stringify(initial, null, 2)}\n`, "utf8");
      return;
    }
    throw error;
  }
}

async function readJsonData(filePath: string): Promise<JsonManagedAuthData> {
  await ensureJsonData(filePath);
  return JSON.parse(await readFile(filePath, "utf8")) as JsonManagedAuthData;
}

async function writeJsonData(filePath: string, data: JsonManagedAuthData): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function isSessionActive(session: ManagedAuthSessionRecord): boolean {
  return !session.revokedAt && session.expiresAt > nowIso();
}

export function createJsonManagedAuthStore(params: {
  filePath: string;
  logger?: Logger;
}): ManagedAuthStore {
  const filePath = resolve(params.filePath);
  const logger = (params.logger ?? createNoopLogger()).child({
    component: "jsonManagedAuthStore",
    filePath,
  });

  return {
    async verifyBearer(secret: string): Promise<VerifiedManagedCredential | undefined> {
      const data = await readJsonData(filePath);
      const secretHash = hashSecret(secret);
      const token = data.tokens.find((candidate) => candidate.secretHash === secretHash && !candidate.revokedAt);
      if (token) {
        return {
          actor: token.actor,
          kind: "managed-token",
          role: token.role,
          tokenId: token.id,
        };
      }

      const session = data.sessions.find((candidate) => candidate.secretHash === secretHash && isSessionActive(candidate));
      if (!session) {
        return undefined;
      }

      return {
        actor: session.actor,
        kind: "session",
        role: session.role,
        sessionId: session.id,
        tokenId: session.tokenId,
      };
    },

    async listTokens(): Promise<ManagedAuthToken[]> {
      const data = await readJsonData(filePath);
      return data.tokens
        .map(({ secretHash: _secretHash, ...token }) => token)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },

    async issueToken(input): Promise<{ secret: string; token: ManagedAuthToken }> {
      const data = await readJsonData(filePath);
      const secret = buildSecret("tok");
      const token: ManagedAuthTokenRecord = {
        actor: input.actor,
        createdAt: nowIso(),
        createdBy: input.createdBy,
        id: randomUUID(),
        role: input.role,
        secretHash: hashSecret(secret),
      };
      data.tokens.push(token);
      await writeJsonData(filePath, data);
      logger.info("managed auth token issued", { actor: token.actor, tokenId: token.id });
      const { secretHash: _secretHash, ...publicToken } = token;
      return { secret, token: publicToken };
    },

    async revokeToken(tokenId: string): Promise<ManagedAuthToken | undefined> {
      const data = await readJsonData(filePath);
      const token = data.tokens.find((candidate) => candidate.id === tokenId);
      if (!token) {
        return undefined;
      }
      const revokedAt = nowIso();
      token.revokedAt = revokedAt;
      for (const session of data.sessions) {
        if (session.tokenId === tokenId && !session.revokedAt) {
          session.revokedAt = revokedAt;
        }
      }
      await writeJsonData(filePath, data);
      const { secretHash: _secretHash, ...publicToken } = token;
      return publicToken;
    },

    async exchangeSession(input): Promise<{ secret: string; session: ManagedAuthSession }> {
      const data = await readJsonData(filePath);
      const token = data.tokens.find((candidate) => candidate.id === input.tokenId && !candidate.revokedAt);
      if (!token) {
        throw new ApiError({
          code: "auth.required",
          message: "Authentication is required.",
          status: 401,
        });
      }

      const secret = buildSecret("ses");
      const createdAt = nowIso();
      const session: ManagedAuthSessionRecord = {
        actor: token.actor,
        createdAt,
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        id: randomUUID(),
        role: token.role,
        tokenId: token.id,
        secretHash: hashSecret(secret),
      };
      data.sessions.push(session);
      await writeJsonData(filePath, data);
      const { secretHash: _secretHash, ...publicSession } = session;
      return { secret, session: publicSession };
    },

    async revokeSession(sessionId: string): Promise<ManagedAuthSession | undefined> {
      const data = await readJsonData(filePath);
      const session = data.sessions.find((candidate) => candidate.id === sessionId);
      if (!session) {
        return undefined;
      }
      session.revokedAt = nowIso();
      await writeJsonData(filePath, data);
      const { secretHash: _secretHash, ...publicSession } = session;
      return publicSession;
    },
  };
}

export function createSqliteManagedAuthStore(params: {
  databasePath: string;
  logger?: Logger;
}): ManagedAuthStore {
  const logger = (params.logger ?? createNoopLogger()).child({
    component: "sqliteManagedAuthStore",
    databasePath: resolve(params.databasePath),
  });
  let database: DatabaseSync | null = null;

  async function ensureDatabase(): Promise<DatabaseSync> {
    if (database) {
      return database;
    }
    await mkdir(dirname(resolve(params.databasePath)), { recursive: true });
    database = new DatabaseSync(resolve(params.databasePath));
    database.exec(`
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
    return database;
  }

  return {
    async close(): Promise<void> {
      if (database) {
        database.close();
        database = null;
      }
    },

    async verifyBearer(secret: string): Promise<VerifiedManagedCredential | undefined> {
      const db = await ensureDatabase();
      const secretHash = hashSecret(secret);
      const token = db
        .prepare("SELECT id, actor, role FROM api_tokens WHERE secret_hash = ? AND revoked_at IS NULL")
        .get(secretHash) as { actor: string; id: string; role: "admin" | "member" } | undefined;
      if (token) {
        return { actor: token.actor, kind: "managed-token", role: token.role, tokenId: token.id };
      }

      const session = db
        .prepare("SELECT id, token_id, actor, role FROM api_sessions WHERE secret_hash = ? AND revoked_at IS NULL AND expires_at > ?")
        .get(secretHash, nowIso()) as { actor: string; id: string; role: "admin" | "member"; token_id: string } | undefined;
      if (!session) {
        return undefined;
      }
      return {
        actor: session.actor,
        kind: "session",
        role: session.role,
        sessionId: session.id,
        tokenId: session.token_id,
      };
    },

    async listTokens(): Promise<ManagedAuthToken[]> {
      const db = await ensureDatabase();
      const rows = db
        .prepare("SELECT id, actor, role, created_at, created_by, revoked_at FROM api_tokens ORDER BY created_at DESC")
        .all() as Array<{
        actor: string;
        created_at: string;
        created_by: string;
        id: string;
        revoked_at?: string;
        role: "admin" | "member";
      }>;
      return rows.map((row) => ({
        actor: row.actor,
        createdAt: row.created_at,
        createdBy: row.created_by,
        id: row.id,
        revokedAt: row.revoked_at ?? undefined,
        role: row.role,
      }));
    },

    async issueToken(input): Promise<{ secret: string; token: ManagedAuthToken }> {
      const db = await ensureDatabase();
      const secret = buildSecret("tok");
      const token: ManagedAuthToken = {
        actor: input.actor,
        createdAt: nowIso(),
        createdBy: input.createdBy,
        id: randomUUID(),
        role: input.role,
      };
      db.prepare(`
        INSERT INTO api_tokens (id, actor, role, secret_hash, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(token.id, token.actor, token.role, hashSecret(secret), token.createdAt, token.createdBy);
      logger.info("managed auth token issued", { actor: token.actor, tokenId: token.id });
      return { secret, token };
    },

    async revokeToken(tokenId: string): Promise<ManagedAuthToken | undefined> {
      const db = await ensureDatabase();
      const row = db
        .prepare("SELECT id, actor, role, created_at, created_by, revoked_at FROM api_tokens WHERE id = ?")
        .get(tokenId) as {
        actor: string;
        created_at: string;
        created_by: string;
        id: string;
        revoked_at?: string;
        role: "admin" | "member";
      } | undefined;
      if (!row) {
        return undefined;
      }

      const revokedAt = nowIso();
      db.prepare("UPDATE api_tokens SET revoked_at = ? WHERE id = ?").run(revokedAt, tokenId);
      db.prepare("UPDATE api_sessions SET revoked_at = ? WHERE token_id = ? AND revoked_at IS NULL").run(revokedAt, tokenId);
      return {
        actor: row.actor,
        createdAt: row.created_at,
        createdBy: row.created_by,
        id: row.id,
        revokedAt,
        role: row.role,
      };
    },

    async exchangeSession(input): Promise<{ secret: string; session: ManagedAuthSession }> {
      const db = await ensureDatabase();
      const token = db
        .prepare("SELECT id, actor, role FROM api_tokens WHERE id = ? AND revoked_at IS NULL")
        .get(input.tokenId) as { actor: string; id: string; role: "admin" | "member" } | undefined;
      if (!token) {
        throw new ApiError({
          code: "auth.required",
          message: "Authentication is required.",
          status: 401,
        });
      }

      const secret = buildSecret("ses");
      const session: ManagedAuthSession = {
        actor: token.actor,
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        id: randomUUID(),
        role: token.role,
        tokenId: token.id,
      };
      db.prepare(`
        INSERT INTO api_sessions (id, token_id, actor, role, secret_hash, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        session.id,
        session.tokenId,
        session.actor,
        session.role,
        hashSecret(secret),
        session.createdAt,
        session.expiresAt,
      );
      return { secret, session };
    },

    async revokeSession(sessionId: string): Promise<ManagedAuthSession | undefined> {
      const db = await ensureDatabase();
      const row = db
        .prepare("SELECT id, token_id, actor, role, created_at, expires_at, revoked_at FROM api_sessions WHERE id = ?")
        .get(sessionId) as {
        actor: string;
        created_at: string;
        expires_at: string;
        id: string;
        revoked_at?: string;
        role: "admin" | "member";
        token_id: string;
      } | undefined;
      if (!row) {
        return undefined;
      }
      const revokedAt = nowIso();
      db.prepare("UPDATE api_sessions SET revoked_at = ? WHERE id = ?").run(revokedAt, sessionId);
      return {
        actor: row.actor,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        id: row.id,
        revokedAt,
        role: row.role,
        tokenId: row.token_id,
      };
    },
  };
}

export function createPostgresManagedAuthStore(params: {
  logger?: Logger;
  postgresUrl: string;
}): ManagedAuthStore {
  const logger = (params.logger ?? createNoopLogger()).child({
    component: "postgresManagedAuthStore",
  });
  const pool = new Pool({ connectionString: params.postgresUrl });
  let schemaReady = false;

  async function ensureSchema(): Promise<void> {
    if (schemaReady) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_tokens (
        id TEXT PRIMARY KEY,
        actor TEXT NOT NULL,
        role TEXT NOT NULL,
        secret_hash TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL,
        created_by TEXT NOT NULL,
        revoked_at TIMESTAMPTZ NULL
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_sessions (
        id TEXT PRIMARY KEY,
        token_id TEXT NOT NULL,
        actor TEXT NOT NULL,
        role TEXT NOT NULL,
        secret_hash TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ NULL
      );
    `);
    schemaReady = true;
  }

  return {
    async close(): Promise<void> {
      await pool.end();
    },

    async verifyBearer(secret: string): Promise<VerifiedManagedCredential | undefined> {
      await ensureSchema();
      const secretHash = hashSecret(secret);
      const token = await pool.query<{ actor: string; id: string; role: "admin" | "member" }>(
        "SELECT id, actor, role FROM api_tokens WHERE secret_hash = $1 AND revoked_at IS NULL",
        [secretHash],
      );
      if (token.rows[0]) {
        return { actor: token.rows[0].actor, kind: "managed-token", role: token.rows[0].role, tokenId: token.rows[0].id };
      }

      const session = await pool.query<{ actor: string; id: string; role: "admin" | "member"; token_id: string }>(
        "SELECT id, token_id, actor, role FROM api_sessions WHERE secret_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()",
        [secretHash],
      );
      if (!session.rows[0]) {
        return undefined;
      }
      return {
        actor: session.rows[0].actor,
        kind: "session",
        role: session.rows[0].role,
        sessionId: session.rows[0].id,
        tokenId: session.rows[0].token_id,
      };
    },

    async listTokens(): Promise<ManagedAuthToken[]> {
      await ensureSchema();
      const rows = await pool.query<{
        actor: string;
        created_at: string;
        created_by: string;
        id: string;
        revoked_at?: string;
        role: "admin" | "member";
      }>("SELECT id, actor, role, created_at, created_by, revoked_at FROM api_tokens ORDER BY created_at DESC");
      return rows.rows.map((row) => ({
        actor: row.actor,
        createdAt: row.created_at,
        createdBy: row.created_by,
        id: row.id,
        revokedAt: row.revoked_at ?? undefined,
        role: row.role,
      }));
    },

    async issueToken(input): Promise<{ secret: string; token: ManagedAuthToken }> {
      await ensureSchema();
      const secret = buildSecret("tok");
      const token: ManagedAuthToken = {
        actor: input.actor,
        createdAt: nowIso(),
        createdBy: input.createdBy,
        id: randomUUID(),
        role: input.role,
      };
      await pool.query(
        "INSERT INTO api_tokens (id, actor, role, secret_hash, created_at, created_by) VALUES ($1, $2, $3, $4, $5, $6)",
        [token.id, token.actor, token.role, hashSecret(secret), token.createdAt, token.createdBy],
      );
      logger.info("managed auth token issued", { actor: token.actor, tokenId: token.id });
      return { secret, token };
    },

    async revokeToken(tokenId: string): Promise<ManagedAuthToken | undefined> {
      await ensureSchema();
      const row = await pool.query<{
        actor: string;
        created_at: string;
        created_by: string;
        id: string;
        revoked_at?: string;
        role: "admin" | "member";
      }>("SELECT id, actor, role, created_at, created_by, revoked_at FROM api_tokens WHERE id = $1", [tokenId]);
      if (!row.rows[0]) {
        return undefined;
      }
      const revokedAt = nowIso();
      await pool.query("UPDATE api_tokens SET revoked_at = $1 WHERE id = $2", [revokedAt, tokenId]);
      await pool.query("UPDATE api_sessions SET revoked_at = $1 WHERE token_id = $2 AND revoked_at IS NULL", [revokedAt, tokenId]);
      return {
        actor: row.rows[0].actor,
        createdAt: row.rows[0].created_at,
        createdBy: row.rows[0].created_by,
        id: row.rows[0].id,
        revokedAt,
        role: row.rows[0].role,
      };
    },

    async exchangeSession(input): Promise<{ secret: string; session: ManagedAuthSession }> {
      await ensureSchema();
      const token = await pool.query<{ actor: string; id: string; role: "admin" | "member" }>(
        "SELECT id, actor, role FROM api_tokens WHERE id = $1 AND revoked_at IS NULL",
        [input.tokenId],
      );
      if (!token.rows[0]) {
        throw new ApiError({
          code: "auth.required",
          message: "Authentication is required.",
          status: 401,
        });
      }
      const secret = buildSecret("ses");
      const session: ManagedAuthSession = {
        actor: token.rows[0].actor,
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        id: randomUUID(),
        role: token.rows[0].role,
        tokenId: token.rows[0].id,
      };
      await pool.query(
        "INSERT INTO api_sessions (id, token_id, actor, role, secret_hash, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [session.id, session.tokenId, session.actor, session.role, hashSecret(secret), session.createdAt, session.expiresAt],
      );
      return { secret, session };
    },

    async revokeSession(sessionId: string): Promise<ManagedAuthSession | undefined> {
      await ensureSchema();
      const row = await pool.query<{
        actor: string;
        created_at: string;
        expires_at: string;
        id: string;
        role: "admin" | "member";
        token_id: string;
      }>("SELECT id, token_id, actor, role, created_at, expires_at FROM api_sessions WHERE id = $1", [sessionId]);
      if (!row.rows[0]) {
        return undefined;
      }
      const revokedAt = nowIso();
      await pool.query("UPDATE api_sessions SET revoked_at = $1 WHERE id = $2", [revokedAt, sessionId]);
      return {
        actor: row.rows[0].actor,
        createdAt: row.rows[0].created_at,
        expiresAt: row.rows[0].expires_at,
        id: row.rows[0].id,
        revokedAt,
        role: row.rows[0].role,
        tokenId: row.rows[0].token_id,
      };
    },
  };
}

export function createManagedAuthStore(params: {
  config: ApiRuntimeConfig;
  logger?: Logger;
}): ManagedAuthStore {
  if (params.config.persistenceBackend === "sqlite") {
    return createSqliteManagedAuthStore({
      databasePath: params.config.sqlitePath,
      logger: params.logger,
    });
  }

  if (params.config.persistenceBackend === "postgres") {
    return createPostgresManagedAuthStore({
      logger: params.logger,
      postgresUrl: params.config.postgresUrl,
    });
  }

  return createJsonManagedAuthStore({
    filePath: resolve(params.config.dataDirectory, "_auth", "managed-auth.json"),
    logger: params.logger,
  });
}
