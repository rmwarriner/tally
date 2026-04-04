import { describe, expect, it } from "vitest";
import { createDemoWorkspace } from "@gnucash-ng/workspace";
import { authorizeWorkspaceAccess, resolveAuthContext } from "./auth";

describe("api auth", () => {
  it("resolves loopback local admin access when auth is not required", () => {
    const result = resolveAuthContext({
      authIdentities: [],
      authRequired: false,
    });

    expect(result.ok).toBe(true);
    expect(result.context).toMatchObject({
      actor: "local-admin",
      kind: "local",
      role: "local-admin",
    });
  });

  it("resolves configured token identities", () => {
    const result = resolveAuthContext({
      apiKeyHeader: "token-1",
      authIdentities: [{ actor: "Primary", role: "member", token: "token-1" }],
      authRequired: true,
    });

    expect(result.ok).toBe(true);
    expect(result.context).toMatchObject({
      actor: "Primary",
      kind: "token",
      role: "member",
    });
  });

  it("denies workspace access to non-members", () => {
    const workspace = createDemoWorkspace();
    const authorization = authorizeWorkspaceAccess(
      workspace,
      { actor: "Intruder", kind: "token", role: "member", token: "bad" },
      "read",
    );

    expect(authorization.ok).toBe(false);
    expect(authorization.error).toContain("not authorized");
  });
});
