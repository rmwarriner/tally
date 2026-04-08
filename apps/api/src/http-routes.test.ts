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
    expect(normalizeRouteLabel("GET", "/api/books/demo")).toBe("/api/books/:bookId");
    expect(normalizeRouteLabel("GET", "/api/books/demo/audit-events")).toBe(
      "/api/books/:bookId/audit-events",
    );
    expect(normalizeRouteLabel("POST", "/api/books/demo/imports/ofx")).toBe(
      "/api/books/:bookId/imports/ofx",
    );
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
    const readWorkspace = matchHttpReadRoutes("/api/books/demo");
    const readReport = matchHttpReadRoutes("/api/books/demo/reports/cash-flow");
    const readAuditEvents = matchHttpReadRoutes("/api/books/demo/audit-events");

    expect(readWorkspace.bookMatch?.[1]).toBe("demo");
    expect(readWorkspace.reportMatch).toBeNull();
    expect(readWorkspace.auditEventsMatch).toBeNull();
    expect(readReport.bookMatch).toBeNull();
    expect(readReport.reportMatch?.[1]).toBe("demo");
    expect(readReport.reportMatch?.[2]).toBe("cash-flow");
    expect(readAuditEvents.auditEventsMatch?.[1]).toBe("demo");
    expect(readAuditEvents.bookMatch).toBeNull();
  });

  it("matches post route variants and bodyless routes", () => {
    const postTransactions = matchHttpPostRoutes("/api/books/demo/transactions");
    const postRestore = matchHttpPostRoutes("/api/books/demo/backups/backup-1/restore");

    expect(postTransactions.transactionMatch?.[1]).toBe("demo");
    expect(postTransactions.bodylessPostRoute).toBe(false);
    expect(postRestore.backupRestoreMatch?.[1]).toBe("demo");
    expect(postRestore.backupRestoreMatch?.[2]).toBe("backup-1");
    expect(postRestore.bodylessPostRoute).toBe(true);
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

    expect(getMembers.householdMembersMatch?.[1]).toBe("demo");
    expect(postMember.householdMemberMatch?.[1]).toBe("demo");
    expect(putRole.setHouseholdMemberRoleMatch?.[1]).toBe("demo");
    expect(putRole.setHouseholdMemberRoleMatch?.[2]).toBe("Alice");
    expect(deleteMember.removeHouseholdMemberMatch?.[1]).toBe("demo");
    expect(deleteMember.removeHouseholdMemberMatch?.[2]).toBe("Alice");
  });
});
