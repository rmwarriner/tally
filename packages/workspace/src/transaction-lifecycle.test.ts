import { describe, expect, it } from "vitest";
import { createMoney } from "@tally/domain";
import { createDemoWorkspace } from "./factory";
import {
  buildOperationalWorkspaceView,
  listActiveTransactions,
  listDeletedTransactions,
  replaceActiveTransactions,
} from "./transaction-lifecycle";

describe("workspace transaction lifecycle helpers", () => {
  it("separates active and deleted transactions from an operational view", () => {
    const workspace = createDemoWorkspace();
    const nextTransactions = workspace.transactions.map((transaction, index) =>
      index === 0
        ? {
            ...transaction,
            deletion: {
              deletedAt: "2026-04-03T10:00:00Z",
              deletedBy: "Primary",
            },
          }
        : transaction,
    );
    const nextWorkspace = {
      ...workspace,
      transactions: nextTransactions,
    };

    expect(listDeletedTransactions(nextWorkspace.transactions)).toHaveLength(1);
    expect(listActiveTransactions(nextWorkspace.transactions)).toHaveLength(workspace.transactions.length - 1);
    expect(
      buildOperationalWorkspaceView(nextWorkspace).transactions.some((transaction) => transaction.deletion !== undefined),
    ).toBe(false);
  });

  it("replaces active transactions while preserving deleted history and sorted order", () => {
    const workspace = createDemoWorkspace();
    const deletedTransaction = {
      id: "txn-deleted-1",
      occurredOn: "2026-04-01",
      description: "Deleted transaction",
      postings: [
        { accountId: "acct-expense-groceries", amount: createMoney("USD", 10) },
        { accountId: "acct-checking", amount: createMoney("USD", -10) },
      ],
      deletion: {
        deletedAt: "2026-04-03T11:00:00Z",
        deletedBy: "Primary",
      },
    };
    const document = {
      ...workspace,
      transactions: [deletedTransaction, ...workspace.transactions],
    };
    const replacement = [
      {
        id: "txn-earlier-1",
        occurredOn: "2026-04-01",
        description: "Earlier replacement",
        postings: [
          { accountId: "acct-expense-groceries", amount: createMoney("USD", 5) },
          { accountId: "acct-checking", amount: createMoney("USD", -5) },
        ],
      },
      {
        id: "txn-later-1",
        occurredOn: "2026-04-03",
        description: "Later replacement",
        postings: [
          { accountId: "acct-expense-utilities", amount: createMoney("USD", 12) },
          { accountId: "acct-checking", amount: createMoney("USD", -12) },
        ],
      },
    ];

    expect(replaceActiveTransactions(document, replacement).map((transaction) => transaction.id)).toEqual([
      "txn-deleted-1",
      "txn-earlier-1",
      "txn-later-1",
    ]);
  });
});
