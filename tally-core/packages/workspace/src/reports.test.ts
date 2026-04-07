import { describe, expect, it } from "vitest";
import { createDemoWorkspace } from "./factory";
import { buildCloseSummary, buildWorkspaceReport } from "./reports";

describe("workspace reports", () => {
  it("builds a net worth report", () => {
    const workspace = createDemoWorkspace();
    const report = buildWorkspaceReport(workspace, {
      from: "2026-04-01",
      kind: "net-worth",
      to: "2026-04-30",
    });

    expect(report.kind).toBe("net-worth");
    expect(report.total.quantity).toBeCloseTo(3051.58);
    expect(report.balances.some((balance) => balance.accountId === "acct-checking")).toBe(true);
  });

  it("builds an income statement report", () => {
    const workspace = createDemoWorkspace();
    const report = buildWorkspaceReport(workspace, {
      from: "2026-04-01",
      kind: "income-statement",
      to: "2026-04-30",
    });

    expect(report.kind).toBe("income-statement");
    expect(report.incomeTotal.quantity).toBeCloseTo(3200);
    expect(report.expenseTotal.quantity).toBeCloseTo(148.42);
    expect(report.netIncome.quantity).toBeCloseTo(3051.58);
  });

  it("builds a cash-flow report", () => {
    const workspace = createDemoWorkspace();
    const report = buildWorkspaceReport(workspace, {
      from: "2026-04-01",
      kind: "cash-flow",
      to: "2026-04-30",
    });

    expect(report.kind).toBe("cash-flow");
    expect(report.totals.inflow.quantity).toBeCloseTo(3200);
    expect(report.totals.outflow.quantity).toBeCloseTo(148.42);
    expect(report.totals.net.quantity).toBeCloseTo(3051.58);
  });

  it("builds a close summary with reconciliation gaps", () => {
    const workspace = createDemoWorkspace();
    workspace.closePeriods = [
      {
        id: "close-2026-03",
        closedAt: "2026-04-01T00:00:00Z",
        closedBy: "Primary",
        from: "2026-03-01",
        to: "2026-03-31",
      },
    ];
    const summary = buildCloseSummary(workspace, {
      from: "2026-04-01",
      to: "2026-04-30",
    });

    expect(summary.netIncome.quantity).toBeCloseTo(3051.58);
    expect(summary.netWorth.quantity).toBeCloseTo(3051.58);
    expect(summary.transactionCount).toBeGreaterThan(0);
    expect(summary.checks.find((check) => check.id === "reconciliation")?.status).toBe("attention");
    expect(summary.latestClosePeriod?.id).toBe("close-2026-03");
    expect(summary.readyToClose).toBe(false);
  });
});
