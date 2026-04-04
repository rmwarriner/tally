import { describe, expect, it } from "vitest";
import {
  createOverviewCards,
  getWorkspaceViewDefinition,
  workspaceViews,
} from "./shell";

describe("web shell view model", () => {
  it("exposes stable workspace views for navigation", () => {
    expect(workspaceViews.map((view) => view.id)).toEqual([
      "overview",
      "ledger",
      "budget",
      "envelopes",
      "imports",
      "automations",
      "reports",
    ]);
    expect(getWorkspaceViewDefinition("ledger")).toMatchObject({
      detail: "Double-entry workspace",
      label: "Ledger",
      title: "Ledger register",
    });
  });

  it("builds overview cards with readable singular and plural summaries", () => {
    expect(
      createOverviewCards({
        accountBalanceCount: 4,
        budgetIssueCount: 1,
        dueTransactionCount: 2,
        envelopeCount: 1,
        ledgerIssueCount: 0,
      }),
    ).toEqual([
      {
        id: "ledger",
        metric: "4",
        summary: "accounts with live balances",
      },
      {
        id: "budget",
        metric: "1",
        summary: "budget issue to review",
      },
      {
        id: "envelopes",
        metric: "1",
        summary: "envelope category active",
      },
      {
        id: "automations",
        metric: "2",
        summary: "scheduled items due soon",
      },
      {
        id: "reports",
        metric: "0",
        summary: "ledger warnings surfaced",
      },
    ]);
  });
});
