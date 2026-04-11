import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiClientError,
  fetchDashboard,
  postBaselineBudgetLine,
  postAccount,
  postCsvImport,
  postEnvelope,
  postEnvelopeAllocation,
  postReconciliation,
  postScheduledTransaction,
  postTransaction,
  putTransaction,
} from "./api";

describe("web api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts transactions to the service route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ book: { id: "workspace-household-demo" } }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    await postTransaction("workspace-household-demo", {
      actor: "Primary",
      transaction: {
        id: "txn-1",
        occurredOn: "2026-04-03",
        description: "Test",
        postings: [],
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/workspace-household-demo/transactions",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("posts accounts to the service route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ book: { id: "workspace-household-demo" } }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    await postAccount("workspace-household-demo", {
      id: "acct-cash",
      code: "1000",
      name: "Cash",
      type: "asset",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/workspace-household-demo/accounts",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("puts transaction updates to the service route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ book: { id: "workspace-household-demo" } }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    await putTransaction("workspace-household-demo", "txn-grocery-1", {
      actor: "Primary",
      transaction: {
        description: "Updated groceries",
        id: "txn-grocery-1",
        occurredOn: "2026-04-02",
        postings: [],
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/workspace-household-demo/transactions/txn-grocery-1",
      expect.objectContaining({
        method: "PUT",
      }),
    );
  });

  it("posts csv imports to the service route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ book: { id: "workspace-household-demo" } }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    await postCsvImport("workspace-household-demo", {
      actor: "Primary",
      payload: {
        batchId: "import-1",
        importedAt: "2026-04-05T00:00:00Z",
        rows: [],
        sourceLabel: "checking.csv",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/workspace-household-demo/imports/csv",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("posts reconciliations to the service route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ book: { id: "workspace-household-demo" } }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    await postReconciliation("workspace-household-demo", {
      actor: "Primary",
      payload: {
        accountId: "acct-checking",
        clearedTransactionIds: ["txn-paycheck-1"],
        statementBalance: 3200,
        statementDate: "2026-04-01",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/workspace-household-demo/reconciliations",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("posts budget lines to the service route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ book: { id: "workspace-household-demo" } }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    await postBaselineBudgetLine("workspace-household-demo", {
      line: {
        accountId: "acct-expense-groceries",
        budgetPeriod: "monthly",
        period: "2026-05",
        plannedAmount: { commodityCode: "USD", quantity: 700 },
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/workspace-household-demo/budget-lines",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("posts envelopes and allocations to the service routes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ book: { id: "workspace-household-demo" } }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    await postEnvelope("workspace-household-demo", {
      envelope: {
        availableAmount: { commodityCode: "USD", quantity: 150 },
        expenseAccountId: "acct-expense-housing",
        fundingAccountId: "acct-checking",
        id: "env-housing",
        name: "Housing Buffer",
        rolloverEnabled: true,
        targetAmount: { commodityCode: "USD", quantity: 150 },
      },
    });

    await postEnvelopeAllocation("workspace-household-demo", {
      allocation: {
        amount: { commodityCode: "USD", quantity: 50 },
        envelopeId: "env-groceries",
        id: "alloc-1",
        occurredOn: "2026-04-15",
        type: "fund",
      },
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/books/workspace-household-demo/envelopes",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/books/workspace-household-demo/envelope-allocations",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("posts scheduled transactions to the service route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ book: { id: "workspace-household-demo" } }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    await postScheduledTransaction("workspace-household-demo", {
      schedule: {
        autoPost: false,
        frequency: "monthly",
        id: "sched-utilities",
        name: "Monthly Utilities",
        nextDueOn: "2026-05-15",
        templateTransaction: {
          description: "Monthly utilities",
          postings: [
            {
              accountId: "acct-expense-utilities",
              amount: { commodityCode: "USD", quantity: 120 },
            },
            {
              accountId: "acct-checking",
              amount: { commodityCode: "USD", quantity: -120 },
            },
          ],
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/workspace-household-demo/schedules",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("includes date-range query params for dashboard reads", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ dashboard: {} }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchDashboard({
      from: "2026-04-01",
      to: "2026-04-30",
      bookId: "workspace-household-demo",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/workspace-household-demo/dashboard?from=2026-04-01&to=2026-04-30",
    );
  });

  it("raises structured client errors from API error envelopes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        error: {
          code: "security.rate_limited",
          message: "Rate limit exceeded. Retry later.",
          status: 429,
        },
        errors: ["Rate limit exceeded. Retry later."],
      }),
      ok: false,
      status: 429,
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchDashboard({
        from: "2026-04-01",
        to: "2026-04-30",
        bookId: "workspace-household-demo",
      }),
    ).rejects.toMatchObject({
      code: "security.rate_limited",
      message: "Rate limit exceeded. Retry later.",
      status: 429,
    });
  });
});
