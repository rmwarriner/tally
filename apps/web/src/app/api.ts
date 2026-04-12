import type {
  Account,
  BaselineBudgetLine,
  Envelope,
  EnvelopeAllocation,
  ScheduledTransaction,
} from "@tally/domain";
import type { FinanceBookDocument } from "@tally/book";
import type { CsvImportRow } from "@tally/book";

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

export interface BookResponse {
  book: FinanceBookDocument;
}

export interface BooksResponse {
  books: Array<{
    id: string;
    name: string;
    role: "admin" | "guardian" | "local-admin" | "member";
  }>;
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

export async function fetchBook(bookId: string): Promise<BookResponse> {
  const response = await fetch(`/api/books/${bookId}`);
  await ensureOk(response, "Failed to load book.");

  return readJson<BookResponse>(response);
}

export async function fetchBooks(): Promise<BooksResponse> {
  const response = await fetch("/api/books");
  await ensureOk(response, "Failed to load books.");

  return readJson<BooksResponse>(response);
}

export async function fetchDashboard(params: {
  from: string;
  to: string;
  bookId: string;
}): Promise<DashboardResponse> {
  const search = new URLSearchParams({ from: params.from, to: params.to });
  const response = await fetch(`/api/books/${params.bookId}/dashboard?${search}`);
  await ensureOk(response, "Failed to load dashboard.");

  return readJson<DashboardResponse>(response);
}

export async function postTransaction(
  bookId: string,
  bookVersion: number,
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
        reconciledAt?: string;
      }>;
    };
  },
): Promise<BookResponse> {
  const response = await fetch(`/api/books/${bookId}/transactions`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "if-match": `"book-${bookVersion}"`,
    },
    method: "POST",
  });
  await ensureOk(response, "Failed to post transaction.");

  return readJson<BookResponse>(response);
}

export async function postAccount(
  bookId: string,
  bookVersion: number,
  account: Account,
): Promise<BookResponse> {
  const response = await fetch(`/api/books/${bookId}/accounts`, {
    body: JSON.stringify({ account }),
    headers: {
      "content-type": "application/json",
      "if-match": `"book-${bookVersion}"`,
    },
    method: "POST",
  });
  await ensureOk(response, "Failed to post account.");

  return readJson<BookResponse>(response);
}

export async function putTransaction(
  bookId: string,
  bookVersion: number,
  transactionId: string,
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
        memo?: string;
        reconciledAt?: string;
      }>;
      tags?: string[];
    };
  },
): Promise<BookResponse> {
  const response = await fetch(`/api/books/${bookId}/transactions/${transactionId}`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "if-match": `"book-${bookVersion}"`,
    },
    method: "PUT",
  });
  await ensureOk(response, "Failed to update transaction.");

  return readJson<BookResponse>(response);
}

export async function deleteTransaction(
  bookId: string,
  bookVersion: number,
  transactionId: string,
  body: {
    actor?: string;
  } = {},
): Promise<BookResponse> {
  const response = await fetch(`/api/books/${bookId}/transactions/${transactionId}`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "if-match": `"book-${bookVersion}"`,
    },
    method: "DELETE",
  });
  await ensureOk(response, "Failed to delete transaction.");

  return readJson<BookResponse>(response);
}

export async function postReconciliation(
  bookId: string,
  bookVersion: number,
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
): Promise<BookResponse> {
  const response = await fetch(`/api/books/${bookId}/reconciliations`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "if-match": `"book-${bookVersion}"`,
    },
    method: "POST",
  });
  await ensureOk(response, "Failed to post reconciliation.");

  return readJson<BookResponse>(response);
}

export async function postCsvImport(
  bookId: string,
  bookVersion: number,
  body: {
    actor?: string;
    payload: {
      batchId: string;
      importedAt: string;
      rows: CsvImportRow[];
      sourceLabel: string;
    };
  },
): Promise<BookResponse> {
  const response = await fetch(`/api/books/${bookId}/imports/csv`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "if-match": `"book-${bookVersion}"`,
    },
    method: "POST",
  });
  await ensureOk(response, "Failed to import CSV.");

  return readJson<BookResponse>(response);
}

export async function postBaselineBudgetLine(
  bookId: string,
  bookVersion: number,
  body: {
    line: BaselineBudgetLine;
  },
): Promise<BookResponse> {
  const response = await fetch(`/api/books/${bookId}/budget-lines`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "if-match": `"book-${bookVersion}"`,
    },
    method: "POST",
  });
  await ensureOk(response, "Failed to save budget line.");

  return readJson<BookResponse>(response);
}

export async function postEnvelope(
  bookId: string,
  bookVersion: number,
  body: {
    envelope: Envelope;
  },
): Promise<BookResponse> {
  const response = await fetch(`/api/books/${bookId}/envelopes`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "if-match": `"book-${bookVersion}"`,
    },
    method: "POST",
  });
  await ensureOk(response, "Failed to save envelope.");

  return readJson<BookResponse>(response);
}

export async function postEnvelopeAllocation(
  bookId: string,
  bookVersion: number,
  body: {
    allocation: EnvelopeAllocation;
  },
): Promise<BookResponse> {
  const response = await fetch(`/api/books/${bookId}/envelope-allocations`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "if-match": `"book-${bookVersion}"`,
    },
    method: "POST",
  });
  await ensureOk(response, "Failed to record envelope allocation.");

  return readJson<BookResponse>(response);
}

export async function postScheduledTransaction(
  bookId: string,
  bookVersion: number,
  body: {
    schedule: ScheduledTransaction;
  },
): Promise<BookResponse> {
  const response = await fetch(`/api/books/${bookId}/schedules`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "if-match": `"book-${bookVersion}"`,
    },
    method: "POST",
  });
  await ensureOk(response, "Failed to save schedule.");

  return readJson<BookResponse>(response);
}
