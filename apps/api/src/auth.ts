import type { FinanceBookDocument } from "@tally/book";

export type AuthRole = "admin" | "member" | "local-admin";
export type BookRole = "admin" | "guardian" | "local-admin" | "member";
export type BookAccess = "destroy" | "manage" | "operate" | "read" | "write";

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
    }
  | {
      actor: string;
      kind: "managed-token";
      role: "admin" | "member";
      tokenId: string;
    }
  | {
      actor: string;
      kind: "session";
      role: "admin" | "member";
      sessionId: string;
      tokenId: string;
    };

export interface AuthResolution {
  context?: AuthContext;
  error?: string;
  ok: boolean;
}

export interface AuthorizationResult {
  decision?: {
    access: BookAccess;
    effectiveRole: BookRole;
    grantedBy: "local-admin" | "book-role";
  };
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
    const suppliedProxyKey =
      params.trustedHeaders?.get(params.trustedHeaderAuth.proxyKeyHeader)?.trim() ??
      (params.trustedHeaderAuth.proxyKeyHeader === "x-tally-auth-proxy-key"
        ? params.trustedHeaders?.get("x-gnucash-ng-auth-proxy-key")?.trim()
        : undefined);

    if (!suppliedProxyKey || suppliedProxyKey !== params.trustedHeaderAuth.proxyKey) {
      return { error: "Authentication is required.", ok: false };
    }

    const actor = params.trustedHeaders?.get(params.trustedHeaderAuth.actorHeader)?.trim();

    if (!actor) {
      return { error: "Authentication is required.", ok: false };
    }

    const roleHeader =
      params.trustedHeaders?.get(params.trustedHeaderAuth.roleHeader)?.trim() ??
      (params.trustedHeaderAuth.roleHeader === "x-tally-auth-role"
        ? params.trustedHeaders?.get("x-gnucash-ng-auth-role")?.trim()
        : undefined);
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

export function authorizeBookAccess(
  book: FinanceBookDocument,
  auth: AuthContext,
  access: BookAccess,
): AuthorizationResult {
  if (auth.role === "local-admin") {
    return {
      decision: { access, effectiveRole: "local-admin", grantedBy: "local-admin" },
      ok: true,
    };
  }

  if (!book.householdMembers.includes(auth.actor)) {
    return {
      error: `Actor ${auth.actor} is not authorized for book ${book.id}.`,
      ok: false,
    };
  }

  const configuredRole = book.householdMemberRoles?.[auth.actor];
  const effectiveRole: BookRole =
    configuredRole === "admin" || configuredRole === "guardian" || configuredRole === "member"
      ? configuredRole
      : "member";

  if (access === "read" || access === "write") {
    return {
      decision: { access, effectiveRole, grantedBy: "book-role" },
      ok: true,
    };
  }

  if (access === "operate" && (effectiveRole === "guardian" || effectiveRole === "admin")) {
    return {
      decision: { access, effectiveRole, grantedBy: "book-role" },
      ok: true,
    };
  }

  if ((access === "destroy" || access === "manage") && effectiveRole === "admin") {
    return {
      decision: { access, effectiveRole, grantedBy: "book-role" },
      ok: true,
    };
  }

  if (access === "destroy") {
    return { ok: false, error: "Admin authority is required for destructive transaction removal." };
  }

  if (access === "manage") {
    return { ok: false, error: "Admin authority is required for household member management." };
  }

  if (access === "operate") {
    return { ok: false, error: "Guardian or admin authority is required for this operation." };
  }

  return { ok: false, error: "Access denied." };
}
