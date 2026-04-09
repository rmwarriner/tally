import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiResponseError, NetworkError } from "./api-client";

const BASE_URL = "http://localhost:3000";
const TOKEN = "test-token";

function makeClient() {
  return new ApiClient(BASE_URL, TOKEN);
}

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const responseHeaders = new Headers({ "content-type": "application/json", ...headers });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      headers: responseHeaders,
      json: () => Promise.resolve(body),
    }),
  );
}

function mockFetchNetworkError() {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ApiClient — auth header", () => {
  it("sends Authorization: Bearer on every request", async () => {
    mockFetch(200, { books: [] });
    const client = makeClient();
    await client.requestJson("GET", "/api/books");

    const call = vi.mocked(fetch).mock.calls[0];
    const headers = call?.[1]?.headers as Headers;
    expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
  });
});

describe("ApiClient — query serialization", () => {
  it("appends defined query params to URL", async () => {
    mockFetch(200, { transactions: [] });
    const client = makeClient();
    await client.requestJson("GET", "/api/books/b1/transactions", {
      query: { status: "cleared", limit: 10, from: "2026-01-01" },
    });

    const calledUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(calledUrl).toContain("status=cleared");
    expect(calledUrl).toContain("limit=10");
    expect(calledUrl).toContain("from=2026-01-01");
  });

  it("omits undefined query params", async () => {
    mockFetch(200, { transactions: [] });
    const client = makeClient();
    await client.requestJson("GET", "/api/books/b1/transactions", {
      query: { status: undefined, limit: 50 },
    });

    const calledUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(calledUrl).not.toContain("status");
    expect(calledUrl).toContain("limit=50");
  });
});

describe("ApiClient — success responses", () => {
  it("returns parsed body on 200", async () => {
    mockFetch(200, { books: [{ id: "b1", name: "Main" }] });
    const client = makeClient();
    const result = await client.requestJson<{ books: { id: string }[] }>("GET", "/api/books");
    expect(result.books[0]?.id).toBe("b1");
  });

  it("returns undefined on 204", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 204, headers: new Headers(), json: () => Promise.reject() }),
    );
    const client = makeClient();
    const result = await client.requestJson("DELETE", "/api/tokens/t1");
    expect(result).toBeUndefined();
  });
});

describe("ApiClient — error responses", () => {
  it("throws ApiResponseError with parsed message on 400", async () => {
    mockFetch(400, { error: { message: "description is required" } });
    const client = makeClient();

    await expect(client.requestJson("POST", "/api/books/b1/transactions", {})).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof ApiResponseError &&
        e.status === 400 &&
        e.message === "description is required",
    );
  });

  it("throws ApiResponseError on 401", async () => {
    mockFetch(401, { error: { message: "Unauthorized" } });
    const client = makeClient();

    await expect(client.requestJson("GET", "/api/books")).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiResponseError && e.status === 401,
    );
  });

  it("throws ApiResponseError on 409", async () => {
    mockFetch(409, { error: { message: "conflict" } });
    const client = makeClient();

    await expect(client.requestJson("POST", "/api/books/b1/transactions", {})).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiResponseError && e.status === 409,
    );
  });

  it("throws ApiResponseError with generic message on 500", async () => {
    mockFetch(500, {});
    const client = makeClient();

    await expect(client.requestJson("GET", "/api/books")).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiResponseError && e.status === 500,
    );
  });

  it("throws ApiResponseError even when response body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        headers: new Headers(),
        json: () => Promise.reject(new SyntaxError("not json")),
      }),
    );
    const client = makeClient();

    await expect(client.requestJson("GET", "/api/books")).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiResponseError && e.status === 502,
    );
  });
});

describe("ApiClient — network errors", () => {
  it("throws NetworkError when fetch itself rejects", async () => {
    mockFetchNetworkError();
    const client = makeClient();

    await expect(client.requestJson("GET", "/api/books")).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof NetworkError && e.message.includes("could not reach API"),
    );
  });

  it("includes the configured API URL in the NetworkError message", async () => {
    mockFetchNetworkError();
    const client = makeClient();

    await expect(client.requestJson("GET", "/api/books")).rejects.toSatisfy(
      (e: unknown) => e instanceof NetworkError && e.message.includes(BASE_URL),
    );
  });
});
