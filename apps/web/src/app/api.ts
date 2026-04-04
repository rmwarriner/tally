import type {
  BaselineBudgetLine,
  Envelope,
  EnvelopeAllocation,
  ScheduledTransaction,
} from "@gnucash-ng/domain";
import type { FinanceWorkspaceDocument } from "@gnucash-ng/workspace";
import type { CsvImportRow } from "@gnucash-ng/workspace";

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

export class ApiClientError extends Error {
  readonly code?: string;
  readonly status: number;

  constructor(params: { code?: string; message: string; status: number }) {
    super(params.message);
    this.name = "ApiClientError";
    this.code = params.code;
    this.status = params.status;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function ensureOk(response: Response, fallbackMessage: string): Promise<void> {
  if (response.ok) {
    return;
  }

  const body: ErrorResponse = await readJson<ErrorResponse>(response).catch(() => ({}));
  throw new ApiClientError({
    code: body.error?.code,
    message: body.error?.message ?? body.errors?.[0] ?? fallbackMessage,
    status: response.status,
  });
}

export async function fetchWorkspace(workspaceId: string): Promise<WorkspaceResponse> {
  const response = await fetch(`/api/workspaces/${workspaceId}`);
  await ensureOk(response, "Failed to load workspace.");

  return readJson<WorkspaceResponse>(response);
}

export async function fetchDashboard(params: {
  from: string;
  to: string;
  workspaceId: string;
}): Promise<DashboardResponse> {
  const search = new URLSearchParams({ from: params.from, to: params.to });
  const response = await fetch(`/api/workspaces/${params.workspaceId}/dashboard?${search}`);
  await ensureOk(response, "Failed to load dashboard.");

  return readJson<DashboardResponse>(response);
}

export async function postTransaction(
  workspaceId: string,
  body: {
    actor?: string;
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
  const response = await fetch(`/api/workspaces/${workspaceId}/transactions`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  await ensureOk(response, "Failed to post transaction.");

  return readJson<WorkspaceResponse>(response);
}

export async function postReconciliation(
  workspaceId: string,
  body: {
    actor?: string;
    payload: {
      accountId: string;
      clearedTransactionIds: string[];
      reconciliationId?: string;
      statementBalance: number;
      statementDate: string;
    };
  },
): Promise<WorkspaceResponse> {
  const response = await fetch(`/api/workspaces/${workspaceId}/reconciliations`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  await ensureOk(response, "Failed to post reconciliation.");

  return readJson<WorkspaceResponse>(response);
}

export async function postCsvImport(
  workspaceId: string,
  body: {
    actor?: string;
    payload: {
      batchId: string;
      importedAt: string;
      rows: CsvImportRow[];
      sourceLabel: string;
    };
  },
): Promise<WorkspaceResponse> {
  const response = await fetch(`/api/workspaces/${workspaceId}/imports/csv`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  await ensureOk(response, "Failed to import CSV.");

  return readJson<WorkspaceResponse>(response);
}

export async function postBaselineBudgetLine(
  workspaceId: string,
  body: {
    line: BaselineBudgetLine;
  },
): Promise<WorkspaceResponse> {
  const response = await fetch(`/api/workspaces/${workspaceId}/budget-lines`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  await ensureOk(response, "Failed to save budget line.");

  return readJson<WorkspaceResponse>(response);
}

export async function postEnvelope(
  workspaceId: string,
  body: {
    envelope: Envelope;
  },
): Promise<WorkspaceResponse> {
  const response = await fetch(`/api/workspaces/${workspaceId}/envelopes`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  await ensureOk(response, "Failed to save envelope.");

  return readJson<WorkspaceResponse>(response);
}

export async function postEnvelopeAllocation(
  workspaceId: string,
  body: {
    allocation: EnvelopeAllocation;
  },
): Promise<WorkspaceResponse> {
  const response = await fetch(`/api/workspaces/${workspaceId}/envelope-allocations`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  await ensureOk(response, "Failed to record envelope allocation.");

  return readJson<WorkspaceResponse>(response);
}

export async function postScheduledTransaction(
  workspaceId: string,
  body: {
    schedule: ScheduledTransaction;
  },
): Promise<WorkspaceResponse> {
  const response = await fetch(`/api/workspaces/${workspaceId}/schedules`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  await ensureOk(response, "Failed to save schedule.");

  return readJson<WorkspaceResponse>(response);
}
