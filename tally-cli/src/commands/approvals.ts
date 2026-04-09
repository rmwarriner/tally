import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { buildContext } from "../lib/context";
import { printRows } from "../lib/output";

interface Approval {
  id: string;
  kind: "destroy-transaction";
  entityId: string;
  requestedBy: string;
  requestedAt: string;
  expiresAt: string;
  status: "pending" | "approved" | "denied" | "expired";
  reviewedBy?: string;
  reviewedAt?: string;
}

interface ApprovalsEnvelope {
  approvals: Approval[];
}

interface BookEnvelope {
  book: {
    pendingApprovals?: Approval[];
  };
}

function approvalRows(approvals: Approval[]): Array<Record<string, string>> {
  return approvals.map((approval) => ({
    entityId: approval.entityId,
    expiresAt: approval.expiresAt,
    id: approval.id,
    kind: approval.kind,
    requestedAt: approval.requestedAt,
    requestedBy: approval.requestedBy,
    reviewedAt: approval.reviewedAt ?? "",
    reviewedBy: approval.reviewedBy ?? "",
    status: approval.status,
  }));
}

async function runApprovalsList(command: Command): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const response = await context.api.requestJson<ApprovalsEnvelope>(
    "GET",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/approvals`,
  );

  if (context.format === "json") {
    console.log(JSON.stringify(response.approvals, null, 2));
    return;
  }

  printRows(
    approvalRows(response.approvals),
    ["id", "kind", "entityId", "status", "requestedBy", "requestedAt", "reviewedBy", "reviewedAt", "expiresAt"],
    context.format,
  );
}

async function runApprovalsRequest(command: Command, transactionId: string): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const approvalId = `approval-cli-${randomUUID()}`;

  const response = await context.api.writeBookJson<BookEnvelope>(
    "POST",
    context.bookId ?? "",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/approvals`,
    {
      payload: {
        approvalId,
        entityId: transactionId,
        kind: "destroy-transaction",
      },
    },
  );

  const approvals = response.book.pendingApprovals ?? [];
  const created = approvals.find((candidate) => candidate.id === approvalId);
  const row = created
    ? approvalRows([created])[0]
    : {
        entityId: transactionId,
        expiresAt: "",
        id: approvalId,
        kind: "destroy-transaction",
        requestedAt: "",
        requestedBy: "",
        reviewedAt: "",
        reviewedBy: "",
        status: "pending",
      };

  printRows(
    [row],
    ["id", "kind", "entityId", "status", "requestedBy", "requestedAt", "reviewedBy", "reviewedAt", "expiresAt"],
    context.format,
  );
}

async function runApprovalReview(command: Command, approvalId: string, decision: "grant" | "deny"): Promise<void> {
  const context = buildContext(command, { requireBook: true });

  await context.api.writeBookJson<BookEnvelope>(
    "POST",
    context.bookId ?? "",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/approvals/${encodeURIComponent(approvalId)}/${decision}`,
  );

  printRows(
    [{ action: decision, approvalId }],
    ["action", "approvalId"],
    context.format,
  );
}

export function registerApprovalsCommands(program: Command): void {
  const approvals = program.command("approvals").description("Approval workflow commands");

  approvals
    .command("list")
    .description("List approvals")
    .action(async function approvalsListAction() {
      await runApprovalsList(this);
    });

  approvals
    .command("request")
    .description("Request destroy approval for a transaction")
    .argument("<transactionId>", "transaction id")
    .action(async function approvalsRequestAction(transactionId: string) {
      await runApprovalsRequest(this, transactionId);
    });

  approvals
    .command("grant")
    .description("Grant approval")
    .argument("<approvalId>", "approval id")
    .action(async function approvalsGrantAction(approvalId: string) {
      await runApprovalReview(this, approvalId, "grant");
    });

  approvals
    .command("deny")
    .description("Deny approval")
    .argument("<approvalId>", "approval id")
    .action(async function approvalsDenyAction(approvalId: string) {
      await runApprovalReview(this, approvalId, "deny");
    });
}
