import { describe, expect, it } from "vitest";
import {
  isLivenessRoute,
  isMetricsRoute,
  isReadinessRoute,
  matchHttpDeleteRoutes,
  matchHttpPostRoutes,
  matchHttpPutRoutes,
  matchHttpReadRoutes,
  normalizeRouteLabel,
} from "./http-routes";

describe("http routes", () => {
  it("normalizes known route labels", () => {
    expect(normalizeRouteLabel("GET", "/health/live")).toBe("/healthz");
    expect(normalizeRouteLabel("GET", "/health/ready")).toBe("/readyz");
    expect(normalizeRouteLabel("GET", "/metrics")).toBe("/metrics");
    expect(normalizeRouteLabel("GET", "/api/books")).toBe("/api/books");
    expect(normalizeRouteLabel("GET", "/api/books/demo")).toBe("/api/books/:bookId");
    expect(normalizeRouteLabel("GET", "/api/books/demo/audit-events")).toBe(
      "/api/books/:bookId/audit-events",
    );
    expect(normalizeRouteLabel("POST", "/api/books/demo/imports/ofx")).toBe(
      "/api/books/:bookId/imports/ofx",
    );
    expect(normalizeRouteLabel("POST", "/api/books/demo/transactions/txn-1/restore")).toBe(
      "/api/books/:bookId/transactions/:transactionId/restore",
    );
    expect(normalizeRouteLabel("GET", "/api/books/demo/attachments/att-1")).toBe(
      "/api/books/:bookId/attachments/:attachmentId",
    );
    expect(normalizeRouteLabel("GET", "/api/v1/books/demo")).toBe("/api/books/:bookId");
    expect(normalizeRouteLabel("GET", "/api/tokens")).toBe("/api/tokens");
    expect(normalizeRouteLabel("POST", "/api/sessions/exchange")).toBe("/api/sessions/exchange");
    expect(normalizeRouteLabel("DELETE", "/api/books/demo/transactions/txn-1/destroy")).toBe(
      "/api/books/:bookId/transactions/:transactionId/destroy",
    );
  });

  it("returns raw path for unknown labels", () => {
    expect(normalizeRouteLabel("GET", "/api/unknown")).toBe("/api/unknown");
  });

  it("matches liveness/readiness/metrics helpers", () => {
    expect(isLivenessRoute("GET", "/healthz")).toBe(true);
    expect(isReadinessRoute("GET", "/readyz")).toBe(true);
    expect(isMetricsRoute("GET", "/metrics")).toBe(true);
    expect(isLivenessRoute("POST", "/healthz")).toBe(false);
    expect(isReadinessRoute("GET", "/api/books/demo")).toBe(false);
    expect(isMetricsRoute("GET", "/healthz")).toBe(false);
  });

  it("matches read route variants", () => {
    const readBooks = matchHttpReadRoutes("/api/books");
    const readWorkspace = matchHttpReadRoutes("/api/books/demo");
    const readReport = matchHttpReadRoutes("/api/books/demo/reports/cash-flow");
    const readAuditEvents = matchHttpReadRoutes("/api/books/demo/audit-events");
    const readTransactions = matchHttpReadRoutes("/api/books/demo/transactions");
    const readAttachment = matchHttpReadRoutes("/api/books/demo/attachments/att-1");
    const readTokens = matchHttpReadRoutes("/api/tokens");

    expect(readBooks.booksMatch?.[0]).toBe("/api/books");
    expect(readBooks.bookMatch).toBeNull();
    expect(readWorkspace.bookMatch?.[1]).toBe("demo");
    expect(readWorkspace.reportMatch).toBeNull();
    expect(readWorkspace.auditEventsMatch).toBeNull();
    expect(readReport.bookMatch).toBeNull();
    expect(readReport.reportMatch?.[1]).toBe("demo");
    expect(readReport.reportMatch?.[2]).toBe("cash-flow");
    expect(readAuditEvents.auditEventsMatch?.[1]).toBe("demo");
    expect(readAuditEvents.bookMatch).toBeNull();
    expect(readTransactions.transactionsMatch?.[1]).toBe("demo");
    expect(readAttachment.attachmentDownloadMatch?.[1]).toBe("demo");
    expect(readAttachment.attachmentDownloadMatch?.[2]).toBe("att-1");
    expect(readTokens.tokensMatch?.[0]).toBe("/api/tokens");
  });

  it("matches post route variants and bodyless routes", () => {
    const postBooks = matchHttpPostRoutes("/api/books");
    const postTransactions = matchHttpPostRoutes("/api/books/demo/transactions");
    const postRestore = matchHttpPostRoutes("/api/books/demo/backups/backup-1/restore");
    const postTransactionRestore = matchHttpPostRoutes("/api/books/demo/transactions/txn-1/restore");
    const postAttachmentUpload = matchHttpPostRoutes("/api/books/demo/attachments");
    const postAttachmentLink = matchHttpPostRoutes("/api/books/demo/transactions/txn-1/attachments");
    const postToken = matchHttpPostRoutes("/api/tokens");
    const postSessionExchange = matchHttpPostRoutes("/api/sessions/exchange");

    expect(postBooks.booksCreateMatch?.[0]).toBe("/api/books");
    expect(postBooks.bodylessPostRoute).toBe(false);
    expect(postTransactions.transactionMatch?.[1]).toBe("demo");
    expect(postTransactions.bodylessPostRoute).toBe(false);
    expect(postRestore.backupRestoreMatch?.[1]).toBe("demo");
    expect(postRestore.backupRestoreMatch?.[2]).toBe("backup-1");
    expect(postRestore.bodylessPostRoute).toBe(true);
    expect(postTransactionRestore.restoreTransactionMatch?.[2]).toBe("txn-1");
    expect(postTransactionRestore.bodylessPostRoute).toBe(true);
    expect(postAttachmentUpload.attachmentUploadMatch?.[1]).toBe("demo");
    expect(postAttachmentLink.transactionAttachmentLinkMatch?.[2]).toBe("txn-1");
    expect(postToken.tokensCreateMatch?.[0]).toBe("/api/tokens");
    expect(postSessionExchange.sessionsExchangeMatch?.[0]).toBe("/api/sessions/exchange");
  });

  it("matches put and delete transaction routes", () => {
    const putRoutes = matchHttpPutRoutes("/api/books/demo/transactions/txn-42");
    const deleteRoutes = matchHttpDeleteRoutes("/api/books/demo/transactions/txn-42/destroy");

    expect(putRoutes.putTransactionMatch?.[1]).toBe("demo");
    expect(putRoutes.putTransactionMatch?.[2]).toBe("txn-42");
    expect(putRoutes.setHouseholdMemberRoleMatch).toBeNull();
    expect(deleteRoutes.destroyTransactionMatch?.[1]).toBe("demo");
    expect(deleteRoutes.destroyTransactionMatch?.[2]).toBe("txn-42");
    expect(deleteRoutes.deleteTransactionMatch).toBeNull();
  });

  it("matches household member routes", () => {
    const getMembers = matchHttpReadRoutes("/api/books/demo/members");
    const postMember = matchHttpPostRoutes("/api/books/demo/members");
    const putRole = matchHttpPutRoutes("/api/books/demo/members/Alice/role");
    const deleteMember = matchHttpDeleteRoutes("/api/books/demo/members/Alice");
    const deleteAttachment = matchHttpDeleteRoutes("/api/books/demo/transactions/txn-42/attachments/att-1");
    const deleteToken = matchHttpDeleteRoutes("/api/tokens/tok-1");
    const deleteCurrentSession = matchHttpDeleteRoutes("/api/sessions/current");

    expect(getMembers.householdMembersMatch?.[1]).toBe("demo");
    expect(postMember.householdMemberMatch?.[1]).toBe("demo");
    expect(putRole.setHouseholdMemberRoleMatch?.[1]).toBe("demo");
    expect(putRole.setHouseholdMemberRoleMatch?.[2]).toBe("Alice");
    expect(deleteMember.removeHouseholdMemberMatch?.[1]).toBe("demo");
    expect(deleteMember.removeHouseholdMemberMatch?.[2]).toBe("Alice");
    expect(deleteAttachment.transactionAttachmentUnlinkMatch?.[2]).toBe("txn-42");
    expect(deleteAttachment.transactionAttachmentUnlinkMatch?.[3]).toBe("att-1");
    expect(deleteToken.tokenDeleteMatch?.[1]).toBe("tok-1");
    expect(deleteCurrentSession.sessionCurrentDeleteMatch?.[0]).toBe("/api/sessions/current");
  });
});
