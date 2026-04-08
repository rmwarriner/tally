import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createJsonIdempotencyStore } from "./idempotency-store";

describe("json idempotency store", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanupPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
  });

  it("tracks started/in-progress/hash-conflict/replay states", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-idempotency-"));
    cleanupPaths.push(directory);
    const store = createJsonIdempotencyStore({
      filePath: join(directory, "idempotency.json"),
    });

    const scopeKey = "Primary:/api/books/:bookId/transactions:workspace:key-1";
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    await expect(
      store.begin({
        expiresAt,
        requestHash: "hash-a",
        scopeKey,
      }),
    ).resolves.toEqual({ kind: "started" });

    await expect(
      store.begin({
        expiresAt,
        requestHash: "hash-a",
        scopeKey,
      }),
    ).resolves.toEqual({ kind: "in_progress" });

    await expect(
      store.begin({
        expiresAt,
        requestHash: "hash-b",
        scopeKey,
      }),
    ).resolves.toEqual({ kind: "hash_conflict" });

    await store.complete({
      response: {
        body: { ok: true },
        headers: { "x-request-id": "req-1" },
        status: 201,
      },
      scopeKey,
    });

    await expect(
      store.begin({
        expiresAt,
        requestHash: "hash-a",
        scopeKey,
      }),
    ).resolves.toEqual({
      kind: "replay",
      response: {
        body: { ok: true },
        headers: { "x-request-id": "req-1" },
        status: 201,
      },
    });
  });
});
