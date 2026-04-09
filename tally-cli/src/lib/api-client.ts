import { randomUUID } from "node:crypto";

type QueryValue = string | number | boolean | undefined;

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, QueryValue>;
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    details?: unknown;
    message?: string;
    status?: number;
  };
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

export class ApiResponseError extends Error {
  code?: string;
  details?: unknown;
  status: number;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiResponseError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ApiClient {
  private readonly apiUrl: string;
  private readonly token: string;

  constructor(apiUrl: string, token: string) {
    this.apiUrl = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
    this.token = token;
  }

  private buildUrl(path: string, query?: Record<string, QueryValue>): URL {
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
    const url = new URL(normalizedPath, this.apiUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) {
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  private async parseError(response: Response): Promise<ApiResponseError> {
    let message = `Request failed with status ${response.status}.`;
    let code: string | undefined;
    let details: unknown;

    try {
      const parsed = (await response.json()) as ErrorEnvelope;
      if (parsed.error?.message) {
        message = parsed.error.message;
      }
      code = parsed.error?.code;
      details = parsed.error?.details;
    } catch {
      // Ignore parse failures and keep generic message.
    }

    return new ApiResponseError(response.status, message, code, details);
  }

  private async fetchWithHandling(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<Response> {
    const url = this.buildUrl(path, options.query);

    const headers = new Headers(options.headers);
    headers.set("accept", "application/json");
    if (this.token) {
      headers.set("authorization", `Bearer ${this.token}`);
    }

    let body: string | undefined;
    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(options.body);
    }

    try {
      return await fetch(url, {
        body,
        headers,
        method,
      });
    } catch {
      throw new NetworkError(`could not reach API at ${this.apiUrl.replace(/\/$/, "")}`);
    }
  }

  async requestJson<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const response = await this.fetchWithHandling(method, path, options);
    if (!response.ok) {
      throw await this.parseError(response);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  async getBookEtag(bookId: string): Promise<string> {
    const response = await this.fetchWithHandling("GET", `/api/books/${encodeURIComponent(bookId)}`);
    if (!response.ok) {
      throw await this.parseError(response);
    }

    const etag = response.headers.get("etag");
    if (!etag) {
      throw new Error(`Book ${bookId} response did not include an ETag.`);
    }

    return etag;
  }

  async writeBookJson<T>(
    method: "POST" | "PUT" | "DELETE",
    bookId: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const idempotencyKey = randomUUID();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const etag = await this.getBookEtag(bookId);
      const response = await this.fetchWithHandling(method, path, {
        body,
        headers: {
          "idempotency-key": idempotencyKey,
          "if-match": etag,
        },
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      if ((response.status === 409 || response.status === 428) && attempt === 0) {
        continue;
      }

      throw await this.parseError(response);
    }

    throw new Error("Failed to satisfy write precondition.");
  }
}
