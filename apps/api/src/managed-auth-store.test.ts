import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createJsonManagedAuthStore } from "./managed-auth-store";

describe("json managed auth store", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanupPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
  });

  it("issues, verifies, exchanges, and revokes token/session credentials", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tally-managed-auth-"));
    cleanupPaths.push(directory);
    const store = createJsonManagedAuthStore({
      filePath: join(directory, "managed-auth.json"),
    });

    const issued = await store.issueToken({
      actor: "Primary",
      createdBy: "Admin",
      role: "member",
    });
    expect(issued.secret).toMatch(/^tok_/);
    expect(issued.token.actor).toBe("Primary");

    const listed = await store.listTokens();
    expect(listed.some((token) => token.id === issued.token.id)).toBe(true);

    await expect(store.verifyBearer(issued.secret)).resolves.toEqual({
      actor: "Primary",
      kind: "managed-token",
      role: "member",
      tokenId: issued.token.id,
    });

    const exchanged = await store.exchangeSession({ tokenId: issued.token.id });
    expect(exchanged.secret).toMatch(/^ses_/);

    await expect(store.verifyBearer(exchanged.secret)).resolves.toEqual({
      actor: "Primary",
      kind: "session",
      role: "member",
      sessionId: exchanged.session.id,
      tokenId: issued.token.id,
    });

    await store.revokeSession(exchanged.session.id);
    await expect(store.verifyBearer(exchanged.secret)).resolves.toBeUndefined();

    await store.revokeToken(issued.token.id);
    await expect(store.verifyBearer(issued.secret)).resolves.toBeUndefined();
  });
});
