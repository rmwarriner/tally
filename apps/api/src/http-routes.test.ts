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
    expect(normalizeRouteLabel("GET", "/api/workspaces/demo")).toBe("/api/workspaces/:workspaceId");
    expect(normalizeRouteLabel("POST", "/api/workspaces/demo/imports/ofx")).toBe(
      "/api/workspaces/:workspaceId/imports/ofx",
    );
    expect(normalizeRouteLabel("DELETE", "/api/workspaces/demo/transactions/txn-1/destroy")).toBe(
      "/api/workspaces/:workspaceId/transactions/:transactionId/destroy",
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
    expect(isReadinessRoute("GET", "/api/workspaces/demo")).toBe(false);
    expect(isMetricsRoute("GET", "/healthz")).toBe(false);
  });

  it("matches read route variants", () => {
    const readWorkspace = matchHttpReadRoutes("/api/workspaces/demo");
    const readReport = matchHttpReadRoutes("/api/workspaces/demo/reports/cash-flow");

    expect(readWorkspace.workspaceMatch?.[1]).toBe("demo");
    expect(readWorkspace.reportMatch).toBeNull();
    expect(readReport.workspaceMatch).toBeNull();
    expect(readReport.reportMatch?.[1]).toBe("demo");
    expect(readReport.reportMatch?.[2]).toBe("cash-flow");
  });

  it("matches post route variants and bodyless routes", () => {
    const postTransactions = matchHttpPostRoutes("/api/workspaces/demo/transactions");
    const postRestore = matchHttpPostRoutes("/api/workspaces/demo/backups/backup-1/restore");

    expect(postTransactions.transactionMatch?.[1]).toBe("demo");
    expect(postTransactions.bodylessPostRoute).toBe(false);
    expect(postRestore.backupRestoreMatch?.[1]).toBe("demo");
    expect(postRestore.backupRestoreMatch?.[2]).toBe("backup-1");
    expect(postRestore.bodylessPostRoute).toBe(true);
  });

  it("matches put and delete transaction routes", () => {
    const putRoutes = matchHttpPutRoutes("/api/workspaces/demo/transactions/txn-42");
    const deleteRoutes = matchHttpDeleteRoutes("/api/workspaces/demo/transactions/txn-42/destroy");

    expect(putRoutes.putTransactionMatch?.[1]).toBe("demo");
    expect(putRoutes.putTransactionMatch?.[2]).toBe("txn-42");
    expect(putRoutes.setHouseholdMemberRoleMatch).toBeNull();
    expect(deleteRoutes.destroyTransactionMatch?.[1]).toBe("demo");
    expect(deleteRoutes.destroyTransactionMatch?.[2]).toBe("txn-42");
    expect(deleteRoutes.deleteTransactionMatch).toBeNull();
  });

  it("matches household member routes", () => {
    const getMembers = matchHttpReadRoutes("/api/workspaces/demo/members");
    const postMember = matchHttpPostRoutes("/api/workspaces/demo/members");
    const putRole = matchHttpPutRoutes("/api/workspaces/demo/members/Alice/role");
    const deleteMember = matchHttpDeleteRoutes("/api/workspaces/demo/members/Alice");

    expect(getMembers.householdMembersMatch?.[1]).toBe("demo");
    expect(postMember.householdMemberMatch?.[1]).toBe("demo");
    expect(putRole.setHouseholdMemberRoleMatch?.[1]).toBe("demo");
    expect(putRole.setHouseholdMemberRoleMatch?.[2]).toBe("Alice");
    expect(deleteMember.removeHouseholdMemberMatch?.[1]).toBe("demo");
    expect(deleteMember.removeHouseholdMemberMatch?.[2]).toBe("Alice");
  });
});
