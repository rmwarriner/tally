import type { Command } from "commander";
import { buildContext } from "../lib/context";
import { printRows } from "../lib/output";

interface AuditEvent {
  id: string;
  bookId: string;
  actor: string;
  occurredAt: string;
  eventType: string;
  entityIds: string[];
  summary: Record<string, unknown>;
}

interface AuditEventsEnvelope {
  auditEvents: AuditEvent[];
}

function parseSince(value: string): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error("since must be an ISO timestamp.");
  }
  return value;
}

function parseLimit(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("limit must be a positive integer.");
  }
  return parsed;
}

function auditRows(events: AuditEvent[]): Array<Record<string, string>> {
  return events.map((event) => ({
    actor: event.actor,
    bookId: event.bookId,
    entities: event.entityIds.join("|"),
    eventType: event.eventType,
    id: event.id,
    occurredAt: event.occurredAt,
  }));
}

async function runAuditList(command: Command): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const opts = command.opts();
  const limit = typeof opts.limit === "string" ? parseLimit(opts.limit) : undefined;
  const since = typeof opts.since === "string" ? parseSince(opts.since) : undefined;
  const eventType = typeof opts.type === "string" ? opts.type : undefined;

  const response = await context.api.requestJson<AuditEventsEnvelope>(
    "GET",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/audit-events`,
    {
      query: {
        eventType,
        limit,
        since,
      },
    },
  );

  if (context.format === "json") {
    console.log(JSON.stringify(response.auditEvents, null, 2));
    return;
  }

  printRows(
    auditRows(response.auditEvents),
    ["occurredAt", "eventType", "actor", "entities", "id", "bookId"],
    context.format,
  );
}

export function registerAuditCommands(program: Command): void {
  const audit = program.command("audit").description("Audit event commands");

  audit
    .command("list")
    .description("List audit events")
    .option("--since <iso>", "include events at/after this ISO timestamp")
    .option("--type <eventType>", "filter by event type")
    .option("--limit <n>", "limit to newest N events")
    .action(async function auditListAction() {
      await runAuditList(this);
    });
}
