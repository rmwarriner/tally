import type { FinanceWorkspaceDocument } from "@gnucash-ng/workspace";

export type AuthRole = "admin" | "member" | "local-admin";

export interface AuthIdentity {
  actor: string;
  role: AuthRole;
  token: string;
}

export type AuthContext =
  | {
      actor: string;
      kind: "local";
      role: "local-admin";
    }
  | {
      actor: string;
      kind: "trusted-header";
      role: "admin" | "member";
    }
  | {
      actor: string;
      kind: "token";
      role: AuthRole;
      token: string;
    };

export interface AuthResolution {
  context?: AuthContext;
  error?: string;
  ok: boolean;
}

export interface AuthorizationResult {
  error?: string;
  ok: boolean;
}

export function resolveAuthContext(params: {
  authIdentities: AuthIdentity[];
  authRequired: boolean;
  authorizationHeader?: string | null;
  apiKeyHeader?: string | null;
  trustedHeaderAuth?: {
    actorHeader: string;
    proxyKey: string;
    proxyKeyHeader: string;
    roleHeader: string;
  };
  trustedHeaders?: Headers;
}): AuthResolution {
  if (params.trustedHeaderAuth) {
    const suppliedProxyKey = params.trustedHeaders?.get(params.trustedHeaderAuth.proxyKeyHeader)?.trim();

    if (!suppliedProxyKey || suppliedProxyKey !== params.trustedHeaderAuth.proxyKey) {
      return { error: "Authentication is required.", ok: false };
    }

    const actor = params.trustedHeaders?.get(params.trustedHeaderAuth.actorHeader)?.trim();

    if (!actor) {
      return { error: "Authentication is required.", ok: false };
    }

    const roleHeader = params.trustedHeaders?.get(params.trustedHeaderAuth.roleHeader)?.trim();
    const role = roleHeader === "admin" ? "admin" : "member";

    return {
      context: {
        actor,
        kind: "trusted-header",
        role,
      },
      ok: true,
    };
  }

  const token =
    params.authorizationHeader?.startsWith("Bearer ")
      ? params.authorizationHeader.slice("Bearer ".length)
      : params.apiKeyHeader ?? undefined;

  if (!params.authRequired && !token) {
    return {
      context: {
        actor: "local-admin",
        kind: "local",
        role: "local-admin",
      },
      ok: true,
    };
  }

  if (!token) {
    return { error: "Authentication is required.", ok: false };
  }

  const identity = params.authIdentities.find((candidate) => candidate.token === token);

  if (!identity) {
    return { error: "Authentication is required.", ok: false };
  }

  return {
    context: {
      actor: identity.actor,
      kind: "token",
      role: identity.role,
      token: identity.token,
    },
    ok: true,
  };
}

export function authorizeWorkspaceAccess(
  workspace: FinanceWorkspaceDocument,
  auth: AuthContext,
  access: "destroy" | "read" | "write",
): AuthorizationResult {
  if (auth.role === "local-admin" || auth.role === "admin") {
    return { ok: true };
  }

  if (access === "destroy") {
    return { ok: false, error: "Privileged authority is required for destructive transaction removal." };
  }

  if (!workspace.householdMembers.includes(auth.actor)) {
    return {
      error: `Actor ${auth.actor} is not authorized for workspace ${workspace.id}.`,
      ok: false,
    };
  }

  if (access === "read" || access === "write") {
    return { ok: true };
  }

  return { ok: false, error: "Access denied." };
}
