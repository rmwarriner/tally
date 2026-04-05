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

  it("rejects unknown configured tokens", () => {
    const result = resolveAuthContext({
      apiKeyHeader: "unknown",
      authIdentities: [{ actor: "Primary", role: "member", token: "token-1" }],
      authRequired: true,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Authentication is required.");
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

  it("denies destroy access to non-privileged members and allows admins", () => {
    const workspace = createDemoWorkspace();
    const memberAuthorization = authorizeWorkspaceAccess(
      workspace,
      { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      "destroy",
    );
    const adminAuthorization = authorizeWorkspaceAccess(
      workspace,
      { actor: "Admin", kind: "token", role: "admin", token: "token-2" },
      "destroy",
    );

    expect(memberAuthorization.ok).toBe(false);
    expect(memberAuthorization.error).toContain("Privileged authority");
    expect(adminAuthorization.ok).toBe(true);
  });
});
