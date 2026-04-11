import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { FinanceBookDocument } from "@tally/book";
import { ShellInspectorContent } from "./ShellSidePanels";
import { createLedgerBookModel } from "./shell";

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysFromToday(offset: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return toIsoDate(date);
}

const inPeriodDate = daysFromToday(-2);
const outOfPeriodDate = daysFromToday(-50);
const dueSoonDate = daysFromToday(7);
const dueLaterDate = daysFromToday(45);

const book: FinanceBookDocument = {
  accounts: [
    { code: "1000", id: "acct-checking", name: "Checking", type: "asset" as const },
    { code: "6100", id: "acct-expense-groceries", name: "Groceries", type: "expense" as const },
  ],
  auditEvents: [
    {
      actor: "Primary",
      bookId: "workspace",
      entityIds: ["txn-1"],
      eventType: "transaction.updated" as const,
      id: "audit-1",
      occurredAt: `${inPeriodDate}T13:25:00.000Z`,
      summary: {},
    },
  ],
  baseCommodityCode: "USD",
  baselineBudgetLines: [],
  closePeriods: [],
  commodities: [],
  envelopeAllocations: [],
  envelopes: [],
  householdMemberRoles: {},
  householdMembers: ["Primary"],
  id: "workspace",
  importBatches: [],
  name: "Household",
  pendingApprovals: [],
  reconciliationSessions: [],
  schemaVersion: 1 as const,
  version: 1,
  scheduledTransactions: [
    {
      autoPost: false,
      frequency: "monthly" as const,
      id: "sched-1",
      name: "Utilities",
      nextDueOn: dueSoonDate,
      templateTransaction: {
        description: "Utilities",
        postings: [
          { accountId: "acct-expense-groceries", amount: { commodityCode: "USD", quantity: 70 } },
          { accountId: "acct-checking", amount: { commodityCode: "USD", quantity: -70 } },
        ],
        tags: [],
      },
    },
    {
      autoPost: false,
      frequency: "monthly" as const,
      id: "sched-2",
      name: "Insurance",
      nextDueOn: dueLaterDate,
      templateTransaction: {
        description: "Insurance",
        postings: [
          { accountId: "acct-expense-groceries", amount: { commodityCode: "USD", quantity: 22 } },
          { accountId: "acct-checking", amount: { commodityCode: "USD", quantity: -22 } },
        ],
        tags: [],
      },
    },
  ],
  transactions: [
    {
      description: "Weekly groceries",
      id: "txn-1",
      occurredOn: inPeriodDate,
      payee: "Market",
      postings: [
        { accountId: "acct-expense-groceries", amount: { commodityCode: "USD", quantity: 120 } },
        { accountId: "acct-checking", amount: { commodityCode: "USD", quantity: -120 }, cleared: true },
      ],
      scheduleId: "sched-1",
      tags: ["household"],
    },
    {
      description: "Older transaction",
      id: "txn-2",
      occurredOn: outOfPeriodDate,
      postings: [
        { accountId: "acct-expense-groceries", amount: { commodityCode: "USD", quantity: 30 } },
        { accountId: "acct-checking", amount: { commodityCode: "USD", quantity: -30 }, cleared: true },
      ],
      tags: [],
    },
  ],
};

const ledgerBook = createLedgerBookModel({
  accountBalances: [],
  searchText: "",
  selectedAccountId: "acct-checking",
  selectedTransactionId: "txn-1",
  book,
});

const sharedProps = {
  book,
  currentPeriod: {
    from: daysFromToday(-30),
    to: daysFromToday(30),
  },
  isInspectorOpen: true,
  ledgerBook,
  onToggleInspector: () => undefined,
};

describe("Shell side panels", () => {
  it("renders ledger transaction detail, audit events, and schedule details", () => {
    const html = renderToStaticMarkup(
      createElement(ShellInspectorContent, { ...sharedProps, activeView: "ledger" }),
    );
    expect(html).toContain("Splits");
    expect(html).toContain("Weekly groceries");
    expect(html).toContain("Audit trail");
    expect(html).toContain("Updated");
    expect(html).toContain("Utilities");
    expect(html).toContain("Attachments · coming soon");
  });

  it("renders no-selection account summary state in ledger view", () => {
    const noSelectionLedgerBook = createLedgerBookModel({
      accountBalances: [],
      searchText: "",
      selectedAccountId: "acct-checking",
      selectedTransactionId: null,
      book,
    });
    const html = renderToStaticMarkup(
      createElement(ShellInspectorContent, {
        ...sharedProps,
        activeView: "ledger",
        ledgerBook: noSelectionLedgerBook,
      }),
    );
    expect(html).toContain("Checking");
    expect(html).toContain("asset");
    expect(html).toContain("Cleared");
    expect(html).toContain("Pending");
    expect(html).toContain("Scheduled (30d)");
    expect(html).toContain("-$150.00");
    expect(html).toContain("-$120.00");
    expect(html).toContain("-$70.00");
  });

  it("keeps the toggle strip visible while collapsing inspector content", () => {
    const html = renderToStaticMarkup(
      createElement(ShellInspectorContent, {
        ...sharedProps,
        activeView: "ledger",
        isInspectorOpen: false,
      }),
    );
    expect(html).toContain("Toggle inspector");
    expect(html).not.toContain("Weekly groceries");
  });

  it("renders empty inspector content in non-ledger views", () => {
    const html = renderToStaticMarkup(
      createElement(ShellInspectorContent, { ...sharedProps, activeView: "overview" }),
    );
    expect(html).toContain("Toggle inspector");
    expect(html).not.toContain("Compliance");
  });
});
