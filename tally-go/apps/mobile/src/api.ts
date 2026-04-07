import type { EnvelopeAllocation, ScheduledTransaction } from "@tally-core/domain";
import type { FinanceWorkspaceDocument } from "@tally-core/workspace";

export interface DashboardResponse {
  dashboard: {
    accountBalances: Array<{
      accountId: string;
      accountName: string;
      accountType: string;
      balance: number;
      commodityCode: string;
    }>;
    budgetErrors: string[];
    budgetSnapshot: Array<{
      accountId: string;
      accountName: string;
      actual: { commodityCode: string; quantity: number };
      planned: { commodityCode: string; quantity: number };
      variance: { commodityCode: string; quantity: number };
    }>;
    dueTransactions: Array<{
      id: string;
      occurredOn: string;
      description: string;
    }>;
    envelopeSnapshot: Array<{
      envelopeId: string;
      name: string;
      funded: { commodityCode: string; quantity: number };
      spent: { commodityCode: string; quantity: number };
      available: { commodityCode: string; quantity: number };
    }>;
    ledgerErrors: string[];
    netWorth: { commodityCode: string; quantity: number };
  };
}

export interface WorkspaceResponse {
  workspace: FinanceWorkspaceDocument;
}

interface ErrorResponse {
  error?: {
    code?: string;
    message?: string;
    status?: number;
  };
  errors?: string[];
}

export class MobileApiError extends Error {
  readonly code?: string;
  readonly status: number;

  constructor(params: { code?: string; message: string; status: number }) {
    super(params.message);
    this.name = "MobileApiError";
    this.code = params.code;
    this.status = params.status;
  }
}

export interface MobileApiClient {
  postReconciliation(
    workspaceId: string,
    body: {
      payload: {
        accountId: string;
        clearedTransactionIds: string[];
        reconciliationId?: string;
        statementBalance: number;
        statementDate: string;
      };
    },
  ): Promise<WorkspaceResponse>;
  applyScheduledTransactionException(
    workspaceId: string,
    scheduleId: string,
    body: {
      payload: {
        action: "defer" | "skip-next";
        effectiveOn?: string;
        nextDueOn?: string;
        note?: string;
      };
    },
  ): Promise<WorkspaceResponse>;
  executeScheduledTransaction(
    workspaceId: string,
    scheduleId: string,
    body: {
      payload: {
        occurredOn: string;
        transactionId?: string;
      };
    },
  ): Promise<WorkspaceResponse>;
  fetchDashboard(params: { from: string; to: string; workspaceId: string }): Promise<DashboardResponse>;
  fetchWorkspace(workspaceId: string): Promise<WorkspaceResponse>;
  postScheduledTransaction(
    workspaceId: string,
    body: {
      schedule: ScheduledTransaction;
    },
  ): Promise<WorkspaceResponse>;
  postTransaction(
    workspaceId: string,
    body: {
      transaction: {
        id: string;
        occurredOn: string;
        description: string;
        payee?: string;
        postings: Array<{
          accountId: string;
          amount: { commodityCode: string; quantity: number };
          cleared?: boolean;
        }>;
      };
    },
  ): Promise<WorkspaceResponse>;
  postEnvelopeAllocation(
    workspaceId: string,
    body: { allocation: EnvelopeAllocation },
  ): Promise<WorkspaceResponse>;
}

export interface MobileApiClientConfig {
  apiBaseUrl: string;
  apiKey?: string;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function ensureOk(response: Response, fallbackMessage: string): Promise<void> {
  if (response.ok) {
    return;
  }

  const body: ErrorResponse = await readJson<ErrorResponse>(response).catch(() => ({}));
  throw new MobileApiError({
    code: body.error?.code,
    message: body.error?.message ?? body.errors?.[0] ?? fallbackMessage,
    status: response.status,
  });
}

function normalizeBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/+$/, "");
}

export function createMobileApiClient(config: MobileApiClientConfig): MobileApiClient {
  const apiBaseUrl = normalizeBaseUrl(config.apiBaseUrl);

  async function request(path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);

    if (config.apiKey) {
      headers.set("x-tally-api-key", config.apiKey);
    }

    return fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers,
    });
  }

  return {
    async postReconciliation(
      workspaceId: string,
      body: {
        payload: {
          accountId: string;
          clearedTransactionIds: string[];
          reconciliationId?: string;
          statementBalance: number;
          statementDate: string;
        };
      },
    ): Promise<WorkspaceResponse> {
      const response = await request(`/api/workspaces/${workspaceId}/reconciliations`, {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      await ensureOk(response, "Failed to record reconciliation.");
      return readJson<WorkspaceResponse>(response);
    },

    async applyScheduledTransactionException(
      workspaceId: string,
      scheduleId: string,
      body: {
        payload: {
          action: "defer" | "skip-next";
          effectiveOn?: string;
          nextDueOn?: string;
          note?: string;
        };
      },
    ): Promise<WorkspaceResponse> {
      const response = await request(`/api/workspaces/${workspaceId}/schedules/${scheduleId}/exceptions`, {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      await ensureOk(response, "Failed to apply scheduled transaction exception.");
      return readJson<WorkspaceResponse>(response);
    },

    async fetchWorkspace(workspaceId: string): Promise<WorkspaceResponse> {
      const response = await request(`/api/workspaces/${workspaceId}`);
      await ensureOk(response, "Failed to load workspace.");
      return readJson<WorkspaceResponse>(response);
    },

    async fetchDashboard(params: {
      from: string;
      to: string;
      workspaceId: string;
    }): Promise<DashboardResponse> {
      const search = new URLSearchParams({ from: params.from, to: params.to });
      const response = await request(`/api/workspaces/${params.workspaceId}/dashboard?${search}`);
      await ensureOk(response, "Failed to load dashboard.");
      return readJson<DashboardResponse>(response);
    },

    async postTransaction(
      workspaceId: string,
      body: {
        transaction: {
          id: string;
          occurredOn: string;
          description: string;
          payee?: string;
          postings: Array<{
            accountId: string;
            amount: { commodityCode: string; quantity: number };
            cleared?: boolean;
          }>;
        };
      },
    ): Promise<WorkspaceResponse> {
      const response = await request(`/api/workspaces/${workspaceId}/transactions`, {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      await ensureOk(response, "Failed to post transaction.");
      return readJson<WorkspaceResponse>(response);
    },

    async postScheduledTransaction(
      workspaceId: string,
      body: {
        schedule: ScheduledTransaction;
      },
    ): Promise<WorkspaceResponse> {
      const response = await request(`/api/workspaces/${workspaceId}/schedules`, {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      await ensureOk(response, "Failed to save scheduled transaction.");
      return readJson<WorkspaceResponse>(response);
    },

    async postEnvelopeAllocation(
      workspaceId: string,
      body: {
        allocation: EnvelopeAllocation;
      },
    ): Promise<WorkspaceResponse> {
      const response = await request(`/api/workspaces/${workspaceId}/envelope-allocations`, {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      await ensureOk(response, "Failed to record envelope allocation.");
      return readJson<WorkspaceResponse>(response);
    },

    async executeScheduledTransaction(
      workspaceId: string,
      scheduleId: string,
      body: {
        payload: {
          occurredOn: string;
          transactionId?: string;
        };
      },
    ): Promise<WorkspaceResponse> {
      const response = await request(`/api/workspaces/${workspaceId}/schedules/${scheduleId}/execute`, {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      await ensureOk(response, "Failed to execute scheduled transaction.");
      return readJson<WorkspaceResponse>(response);
    },
  };
}
