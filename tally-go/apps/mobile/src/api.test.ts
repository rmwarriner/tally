import { afterEach, describe, expect, it, vi } from "vitest";
import { createMobileApiClient, MobileApiError } from "./api";

describe("mobile api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads workspace and dashboard from the configured api base url", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ workspace: { id: "workspace-household-demo" } }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({ dashboard: { netWorth: { commodityCode: "USD", quantity: 0 } } }),
        ok: true,
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = createMobileApiClient({
      apiBaseUrl: "http://127.0.0.1:3000/",
    });

    await client.fetchWorkspace("workspace-household-demo");
    await client.fetchDashboard({
      from: "2026-04-01",
      to: "2026-04-30",
      workspaceId: "workspace-household-demo",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://127.0.0.1:3000/api/workspaces/workspace-household-demo", {
      headers: new Headers(),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:3000/api/workspaces/workspace-household-demo/dashboard?from=2026-04-01&to=2026-04-30",
      {
        headers: new Headers(),
      },
    );
  });

  it("sends api key headers when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ workspace: { id: "workspace-household-demo" } }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createMobileApiClient({
      apiBaseUrl: "http://192.168.1.15:3000",
      apiKey: "mobile-token",
    });

    await client.postEnvelopeAllocation("workspace-household-demo", {
      allocation: {
        amount: { commodityCode: "USD", quantity: 45 },
        envelopeId: "env-groceries",
        id: "alloc-mobile-1",
        occurredOn: "2026-04-03",
        type: "fund",
      },
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(requestInit.headers);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.1.15:3000/api/workspaces/workspace-household-demo/envelope-allocations",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-tally-api-key")).toBe("mobile-token");
  });

  it("posts mobile transactions and executes schedules through service routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ workspace: { id: "workspace-household-demo" } }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({ workspace: { id: "workspace-household-demo" } }),
        ok: true,
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = createMobileApiClient({
      apiBaseUrl: "http://192.168.1.15:3000",
    });

    await client.postTransaction("workspace-household-demo", {
      transaction: {
        description: "Coffee",
        id: "txn-mobile-1",
        occurredOn: "2026-04-03",
        postings: [
          {
            accountId: "acct-expense-groceries",
            amount: { commodityCode: "USD", quantity: 12.5 },
          },
          {
            accountId: "acct-checking",
            amount: { commodityCode: "USD", quantity: -12.5 },
          },
        ],
      },
    });

    await client.executeScheduledTransaction("workspace-household-demo", "sched-rent", {
      payload: {
        occurredOn: "2026-04-01",
      },
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://192.168.1.15:3000/api/workspaces/workspace-household-demo/transactions",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://192.168.1.15:3000/api/workspaces/workspace-household-demo/schedules/sched-rent/execute",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("saves scheduled transactions through the service route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ workspace: { id: "workspace-household-demo" } }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createMobileApiClient({
      apiBaseUrl: "http://192.168.1.15:3000",
    });

    await client.postScheduledTransaction("workspace-household-demo", {
      schedule: {
        autoPost: true,
        frequency: "monthly",
        id: "sched-rent",
        name: "Monthly Rent",
        nextDueOn: "2026-05-01",
        templateTransaction: {
          description: "Monthly rent",
          payee: "Property Management Co.",
          postings: [
            {
              accountId: "acct-expense-housing",
              amount: { commodityCode: "USD", quantity: 1400 },
            },
            {
              accountId: "acct-checking",
              amount: { commodityCode: "USD", quantity: -1400 },
            },
          ],
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.1.15:3000/api/workspaces/workspace-household-demo/schedules",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("applies scheduled transaction exceptions through the service route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ workspace: { id: "workspace-household-demo" } }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createMobileApiClient({
      apiBaseUrl: "http://192.168.1.15:3000",
    });

    await client.applyScheduledTransactionException("workspace-household-demo", "sched-rent", {
      payload: {
        action: "defer",
        nextDueOn: "2026-05-05",
        note: "Grace period",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.1.15:3000/api/workspaces/workspace-household-demo/schedules/sched-rent/exceptions",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("records reconciliations through the service route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ workspace: { id: "workspace-household-demo" } }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createMobileApiClient({
      apiBaseUrl: "http://192.168.1.15:3000",
    });

    await client.postReconciliation("workspace-household-demo", {
      payload: {
        accountId: "acct-checking",
        clearedTransactionIds: ["txn-paycheck-1", "txn-grocery-1"],
        statementBalance: 3051.58,
        statementDate: "2026-04-02",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.1.15:3000/api/workspaces/workspace-household-demo/reconciliations",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("raises structured client errors from api responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        error: {
          code: "auth.required",
          message: "Authentication is required.",
          status: 401,
        },
      }),
      ok: false,
      status: 401,
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createMobileApiClient({
      apiBaseUrl: "http://192.168.1.15:3000",
    });

    await expect(client.fetchWorkspace("workspace-household-demo")).rejects.toMatchObject({
      code: "auth.required",
      message: "Authentication is required.",
      status: 401,
    } satisfies Partial<MobileApiError>);
  });
});
