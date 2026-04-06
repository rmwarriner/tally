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

  it("resolves trusted-header identities when proxy key and actor header are valid", () => {
    const headers = new Headers();
    headers.set("x-proxy-key", "proxy-secret");
    headers.set("x-auth-actor", "alice@example.com");
    headers.set("x-auth-role", "admin");

    const result = resolveAuthContext({
      authIdentities: [],
      authRequired: true,
      trustedHeaderAuth: {
        actorHeader: "x-auth-actor",
        proxyKey: "proxy-secret",
        proxyKeyHeader: "x-proxy-key",
        roleHeader: "x-auth-role",
      },
      trustedHeaders: headers,
    });

    expect(result.ok).toBe(true);
    expect(result.context).toEqual({
      actor: "alice@example.com",
      kind: "trusted-header",
      role: "admin",
    });
  });

  it("rejects trusted-header identities when proxy key validation fails", () => {
    const headers = new Headers();
    headers.set("x-proxy-key", "wrong-key");
    headers.set("x-auth-actor", "alice@example.com");

    const result = resolveAuthContext({
      authIdentities: [],
      authRequired: true,
      trustedHeaderAuth: {
        actorHeader: "x-auth-actor",
        proxyKey: "proxy-secret",
        proxyKeyHeader: "x-proxy-key",
        roleHeader: "x-auth-role",
      },
      trustedHeaders: headers,
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
    const workspace = {
      ...createDemoWorkspace(),
      householdMemberRoles: {
        Admin: "admin" as const,
        Partner: "member" as const,
        Primary: "guardian" as const,
      },
      householdMembers: ["Primary", "Partner", "Admin"],
    };
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
    expect(memberAuthorization.error).toContain("Admin authority");
    expect(adminAuthorization.ok).toBe(true);
  });

  it("requires guardian or admin authority for operate access", () => {
    const workspace = {
      ...createDemoWorkspace(),
      householdMemberRoles: {
        Partner: "member" as const,
        Primary: "guardian" as const,
      },
    };

    const memberAuthorization = authorizeWorkspaceAccess(
      workspace,
      { actor: "Partner", kind: "token", role: "member", token: "token-2" },
      "operate",
    );
    const guardianAuthorization = authorizeWorkspaceAccess(
      workspace,
      { actor: "Primary", kind: "token", role: "member", token: "token-1" },
      "operate",
    );

    expect(memberAuthorization.ok).toBe(false);
    expect(memberAuthorization.error).toContain("Guardian or admin authority");
    expect(guardianAuthorization.ok).toBe(true);
  });
});
