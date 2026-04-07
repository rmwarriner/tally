import type { FinanceWorkspaceDocument, AuditEvent, AuditEventType } from "./types";

export interface AuditContext {
  actor?: string;
  actorRole?: "admin" | "guardian" | "local-admin" | "member";
  authorization?: {
    access: string;
    effectiveRole: string;
    grantedBy: "local-admin" | "workspace-role";
  };
  commandId?: string;
  disabled?: boolean;
  occurredAt?: string;
}

export interface AuditEventInput {
  entityIds: string[];
  eventType: AuditEventType;
  summary: Record<string, unknown>;
}

function normalizeEntityIds(entityIds: string[]): string[] {
  return [...new Set(entityIds)].sort((left, right) => left.localeCompare(right));
}

export function createAuditEvent(
  document: FinanceWorkspaceDocument,
  input: AuditEventInput,
  context: AuditContext = {},
): AuditEvent {
  const occurredAt = context.occurredAt ?? new Date().toISOString();
  const commandId = context.commandId ?? input.entityIds[0] ?? input.eventType;

  return {
    id: `audit:${input.eventType}:${commandId}:${occurredAt}`,
    workspaceId: document.id,
    actor: context.actor ?? "system",
    occurredAt,
    eventType: input.eventType,
    entityIds: normalizeEntityIds(input.entityIds),
    summary: {
      ...input.summary,
      ...(context.actorRole ? { actorRole: context.actorRole } : {}),
      ...(context.authorization ? { authorization: context.authorization } : {}),
    },
  };
}

export function appendAuditEvent(
  document: FinanceWorkspaceDocument,
  input: AuditEventInput,
  context: AuditContext = {},
): FinanceWorkspaceDocument {
  if (context.disabled) {
    return document;
  }

  return {
    ...document,
    auditEvents: [...document.auditEvents, createAuditEvent(document, input, context)].sort(
      (left, right) => `${left.occurredAt}:${left.id}`.localeCompare(`${right.occurredAt}:${right.id}`),
    ),
  };
}
