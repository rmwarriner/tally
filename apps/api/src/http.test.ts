import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildGnuCashXmlExport, createDemoBook } from "@tally/book";
import { saveBookToFile } from "@tally/book/src/node";
import {
  createInMemoryRateLimiter,
  createFileSystemBookRepository,
  createHttpHandler,
  createJsonIdempotencyStore,
  createJsonManagedAuthStore,
  createBookService,
} from "./index";
import type { HttpRequestObserver } from "./observability";

describe("api http transport", () => {
  function createTestHttpHandler(
    params: Parameters<typeof createHttpHandler>[0],
  ): (request: Request) => Promise<Response> {
    const handler = createHttpHandler(params);
    const versions = new Map<string, number>();

    return async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const rawPath = url.pathname.replace(/\/+$/, "") || "/";
      const path = rawPath.replace(/^\/api\/v1(?=\/|$)/, "/api");
      const method = request.method.toUpperCase();
      const bookMatch = path.match(/^\/api\/books\/([^/]+)/);
      const isExistingBookWrite =
        (method === "POST" || method === "PUT" || method === "DELETE") &&
        bookMatch !== null &&
        !(method === "POST" && path === "/api/books");

      let nextRequest = request;
      if (isExistingBookWrite && !request.headers.has("if-match")) {
        const bookId = decodeURIComponent(bookMatch[1]);
        const knownVersion = versions.get(bookId) ?? 1;
        const headers = new Headers(request.headers);
        headers.set("if-match", `"book-${knownVersion}"`);
        nextRequest = new Request(request, { headers });
      }

      const response = await handler(nextRequest);
      if (bookMatch) {
        const returnedVersion = Number.parseInt(response.headers.get("x-book-version") ?? "", 10);
        if (Number.isInteger(returnedVersion) && returnedVersion > 0) {
          versions.set(decodeURIComponent(bookMatch[1]), returnedVersion);
        } else if (isExistingBookWrite) {
          const refreshResponse = await handler(
            new Request(`http://localhost/api/books/${decodeURIComponent(bookMatch[1])}`, {
              headers: new Headers(request.headers),
            }),
          );
          const refreshedVersion = Number.parseInt(refreshResponse.headers.get("x-book-version") ?? "", 10);
          if (Number.isInteger(refreshedVersion) && refreshedVersion > 0) {
            versions.set(decodeURIComponent(bookMatch[1]), refreshedVersion);
          }
        }
      }

      return response;
    };
  }

  async function createFixture() {
    const directory = await mkdtemp(join(tmpdir(), "tally-http-"));
    const book = createDemoBook();
    const bookPath = join(directory, `${book.id}.json`);

    await saveBookToFile(bookPath, book);

    return {
      cleanup: async () => rm(directory, { recursive: true, force: true }),
      directory,
      book,
      bookPath,
    };
  }

  it("serves book reads over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.book.id).toBe(fixture.book.id);
    expect(response.headers.get("x-request-id")).toBeTruthy();

    await fixture.cleanup();
  });

  it("emits ETag and x-book-version headers on book-state responses", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Primary", role: "member", token: "tok-primary" }],
      service,
    });

    const readResponse = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}`, {
        headers: { authorization: "Bearer tok-primary" },
      }),
    );
    expect(readResponse.headers.get("etag")).toBe('"book-1"');
    expect(readResponse.headers.get("x-book-version")).toBe("1");

    const writeResponse = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/transactions`, {
        body: JSON.stringify({
          transaction: {
            description: "Versioned write",
            id: "txn-version-header",
            occurredOn: "2026-04-07",
            postings: [
              { accountId: "acct-expense-groceries", amount: { commodityCode: "USD", quantity: 10 } },
              { accountId: "acct-checking", amount: { commodityCode: "USD", quantity: -10 } },
            ],
          },
        }),
        headers: {
          authorization: "Bearer tok-primary",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    expect(writeResponse.headers.get("etag")).toBe('"book-2"');
    expect(writeResponse.headers.get("x-book-version")).toBe("2");

    await fixture.cleanup();
  });

  it("records canonical route spans for /api and /api/v1 through request observer", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const startedRoutes: string[] = [];
    const completedStatuses: number[] = [];
    const requestObserver: HttpRequestObserver = {
      start(input) {
        startedRoutes.push(input.route);
        return {
          spanId: "span-1",
          traceId: "trace-1",
          complete({ status }) {
            completedStatuses.push(status);
          },
        };
      },
    };
    const handler = createHttpHandler({ requestObserver, service });

    await handler(new Request(`http://localhost/api/books/${fixture.book.id}`));
    await handler(new Request(`http://localhost/api/v1/books/${fixture.book.id}`));

    expect(startedRoutes).toEqual(["/api/books/:bookId", "/api/books/:bookId"]);
    expect(completedStatuses).toEqual([200, 200]);

    await fixture.cleanup();
  });

  it("completes observed requests with error status codes", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const completedStatuses: number[] = [];
    const requestObserver: HttpRequestObserver = {
      start() {
        return {
          complete({ status }) {
            completedStatuses.push(status);
          },
        };
      },
    };
    const handler = createHttpHandler({
      authIdentities: [{ actor: "Primary", role: "member", token: "top-secret" }],
      requestObserver,
      service,
    });

    await handler(new Request(`http://localhost/api/books/${fixture.book.id}`));

    expect(completedStatuses).toEqual([401]);

    await fixture.cleanup();
  });

  it("lists books over HTTP with actor-scoped visibility", async () => {
    const fixture = await createFixture();
    const secondBook = {
      ...createDemoBook(),
      id: "book-secondary",
      householdMemberRoles: { Owner: "admin" as const },
      householdMembers: ["Owner"],
      name: "Secondary Book",
    };
    await saveBookToFile(join(fixture.directory, `${secondBook.id}.json`), secondBook);
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Primary", role: "member", token: "tok-primary" }],
      service,
    });

    const response = await handler(
      new Request("http://localhost/api/books", {
        headers: { authorization: "Bearer tok-primary" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.books).toHaveLength(1);
    expect(body.books[0]).toMatchObject({
      id: fixture.book.id,
      role: "guardian",
    });

    await fixture.cleanup();
  });

  it("creates books over HTTP and validates duplicate and malformed payloads", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Creator", role: "member", token: "tok-creator" }],
      service,
    });

    const created = await handler(
      new Request("http://localhost/api/books", {
        body: JSON.stringify({
          payload: {
            bookId: "book-created-http",
            name: "Created Over HTTP",
          },
        }),
        headers: {
          authorization: "Bearer tok-creator",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const createdBody = await created.json();

    expect(created.status).toBe(201);
    expect(createdBody.book.id).toBe("book-created-http");
    expect(createdBody.book.householdMemberRoles).toEqual({ Creator: "admin" });

    const duplicate = await handler(
      new Request("http://localhost/api/books", {
        body: JSON.stringify({
          payload: {
            bookId: "book-created-http",
            name: "Duplicate",
          },
        }),
        headers: {
          authorization: "Bearer tok-creator",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const duplicateBody = await duplicate.json();

    expect(duplicate.status).toBe(409);
    expect(duplicateBody.error.code).toBe("book.already_exists");

    const invalid = await handler(
      new Request("http://localhost/api/books", {
        body: JSON.stringify({
          payload: {
            bookId: "bad id",
          },
        }),
        headers: {
          authorization: "Bearer tok-creator",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const invalidBody = await invalid.json();

    expect(invalid.status).toBe(400);
    expect(invalidBody.error.code).toBe("validation.failed");

    await fixture.cleanup();
  });

  it("requires If-Match for existing-book writes and returns 428 when missing", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({
      authIdentities: [{ actor: "Primary", role: "member", token: "tok-primary" }],
      service,
    });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/transactions`, {
        body: JSON.stringify({
          transaction: {
            description: "Missing precondition",
            id: "txn-missing-if-match",
            occurredOn: "2026-04-06",
            postings: [
              { accountId: "acct-expense-groceries", amount: { commodityCode: "USD", quantity: 10 } },
              { accountId: "acct-checking", amount: { commodityCode: "USD", quantity: -10 } },
            ],
          },
        }),
        headers: {
          authorization: "Bearer tok-primary",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(428);
    expect(body.error.code).toBe("request.precondition_required");

    await fixture.cleanup();
  });

  it("returns 409 version conflict for stale If-Match values", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createHttpHandler({
      authIdentities: [{ actor: "Primary", role: "member", token: "tok-primary" }],
      service,
    });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/transactions`, {
        body: JSON.stringify({
          transaction: {
            description: "Version conflict",
            id: "txn-stale-if-match",
            occurredOn: "2026-04-06",
            postings: [
              { accountId: "acct-expense-groceries", amount: { commodityCode: "USD", quantity: 10 } },
              { accountId: "acct-checking", amount: { commodityCode: "USD", quantity: -10 } },
            ],
          },
        }),
        headers: {
          authorization: "Bearer tok-primary",
          "content-type": "application/json",
          "if-match": "\"book-999\"",
        },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("request.version_conflict");
    expect(body.error.details).toEqual({
      expectedVersion: 1,
      providedVersion: 999,
    });

    await fixture.cleanup();
  });

  it("replays POST mutation responses when Idempotency-Key is reused with same payload", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const idempotencyStore = createJsonIdempotencyStore({
      filePath: join(fixture.directory, "idempotency.json"),
    });
    const handler = createHttpHandler({
      authIdentities: [{ actor: "Primary", role: "member", token: "tok-primary" }],
      idempotencyStore,
      service,
    });

    const requestBody = {
      transaction: {
        description: "Replay me",
        id: "txn-idempotent-1",
        occurredOn: "2026-04-06",
        postings: [
          { accountId: "acct-expense-groceries", amount: { commodityCode: "USD", quantity: 10 } },
          { accountId: "acct-checking", amount: { commodityCode: "USD", quantity: -10 } },
        ],
      },
    };

    const first = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/transactions`, {
        body: JSON.stringify(requestBody),
        headers: {
          authorization: "Bearer tok-primary",
          "content-type": "application/json",
          "idempotency-key": "txn-idempotent-key",
          "if-match": "\"book-1\"",
        },
        method: "POST",
      }),
    );
    const firstBody = await first.json();

    const second = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/transactions`, {
        body: JSON.stringify(requestBody),
        headers: {
          authorization: "Bearer tok-primary",
          "content-type": "application/json",
          "idempotency-key": "txn-idempotent-key",
          "if-match": "\"book-1\"",
        },
        method: "POST",
      }),
    );
    const secondBody = await second.json();

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(secondBody).toEqual(firstBody);
    expect(second.headers.get("x-book-version")).toBe(first.headers.get("x-book-version"));

    const readResponse = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}`, {
        headers: { authorization: "Bearer tok-primary" },
      }),
    );
    const readBody = await readResponse.json();
    const createdTransactions = readBody.book.transactions.filter(
      (transaction: { id: string }) => transaction.id === "txn-idempotent-1",
    );
    expect(createdTransactions).toHaveLength(1);

    await fixture.cleanup();
  });

  it("manages tokens and exchanges/revokes sessions through managed auth endpoints", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const managedAuthStore = createJsonManagedAuthStore({
      filePath: join(fixture.directory, "managed-auth.json"),
    });
    const handler = createHttpHandler({
      authIdentities: [{ actor: "Admin", role: "admin", token: "tok-admin" }],
      managedAuthStore,
      service,
    });

    const issueResponse = await handler(
      new Request("http://localhost/api/v1/tokens", {
        body: JSON.stringify({ payload: { actor: "Primary", role: "member" } }),
        headers: {
          authorization: "Bearer tok-admin",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const issueBody = await issueResponse.json();
    expect(issueResponse.status).toBe(201);
    expect(issueBody.token.actor).toBe("Primary");
    expect(typeof issueBody.secret).toBe("string");

    const listResponse = await handler(
      new Request("http://localhost/api/tokens", {
        headers: { authorization: "Bearer tok-admin" },
      }),
    );
    const listBody = await listResponse.json();
    expect(listResponse.status).toBe(200);
    expect(listBody.tokens.some((token: { id: string }) => token.id === issueBody.token.id)).toBe(true);

    const exchangeResponse = await handler(
      new Request("http://localhost/api/sessions/exchange", {
        body: JSON.stringify({}),
        method: "POST",
        headers: {
          authorization: `Bearer ${issueBody.secret}`,
          "content-type": "application/json",
        },
      }),
    );
    const exchangeBody = await exchangeResponse.json();
    expect(exchangeResponse.status).toBe(201);
    expect(typeof exchangeBody.secret).toBe("string");
    expect(exchangeBody.session.tokenId).toBe(issueBody.token.id);

    const revokeSessionResponse = await handler(
      new Request("http://localhost/api/sessions/current", {
        method: "DELETE",
        headers: { authorization: `Bearer ${exchangeBody.secret}` },
      }),
    );
    expect(revokeSessionResponse.status).toBe(200);

    const revokeTokenResponse = await handler(
      new Request(`http://localhost/api/tokens/${issueBody.token.id}`, {
        method: "DELETE",
        headers: { authorization: "Bearer tok-admin" },
      }),
    );
    expect(revokeTokenResponse.status).toBe(200);

    const exchangeAfterRevokeResponse = await handler(
      new Request("http://localhost/api/sessions/exchange", {
        body: JSON.stringify({}),
        method: "POST",
        headers: {
          authorization: `Bearer ${issueBody.secret}`,
          "content-type": "application/json",
        },
      }),
    );
    expect(exchangeAfterRevokeResponse.status).toBe(401);

    await fixture.cleanup();
  });

  it("supports /api and /api/v1 parity with canonical metrics labels", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      dataDirectory: fixture.directory,
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Primary", role: "member", token: "top-secret" }],
      service,
    });

    const v1Read = await handler(
      new Request(`http://localhost/api/v1/books/${fixture.book.id}`, {
        headers: { authorization: "Bearer top-secret" },
      }),
    );
    expect(v1Read.status).toBe(200);

    const v1Restore = await handler(
      new Request(`http://localhost/api/v1/books/${fixture.book.id}/transactions/${fixture.book.transactions[0]!.id}/restore`, {
        headers: { authorization: "Bearer top-secret" },
        method: "POST",
      }),
    );
    expect(v1Restore.status).toBe(422);

    const metricsResponse = await handler(new Request("http://localhost/metrics"));
    const metricsBody = await metricsResponse.text();
    expect(metricsBody).toContain('route="/api/books/:bookId"');
    expect(metricsBody).toContain('route="/api/books/:bookId/transactions/:transactionId/restore"');

    await fixture.cleanup();
  });

  it("lists transactions with filtering and cursor paging over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Primary", role: "member", token: "top-secret" }],
      service,
    });

    await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/transactions`, {
        body: JSON.stringify({
          transaction: {
            description: "Pending recent",
            id: "txn-http-list-1",
            occurredOn: "2026-04-06",
            postings: [
              { accountId: "acct-expense-groceries", amount: { commodityCode: "USD", quantity: 5 } },
              { accountId: "acct-checking", amount: { commodityCode: "USD", quantity: -5 } },
            ],
          },
        }),
        headers: {
          authorization: "Bearer top-secret",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    const firstPage = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/transactions?limit=1&status=pending`, {
        headers: { authorization: "Bearer top-secret" },
      }),
    );
    const firstPageBody = await firstPage.json();
    expect(firstPage.status).toBe(200);
    expect(firstPageBody.transactions).toHaveLength(1);
    expect(firstPageBody.nextCursor).toBeTruthy();

    const secondPage = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/transactions?limit=2&cursor=${encodeURIComponent(firstPageBody.nextCursor)}`, {
        headers: { authorization: "Bearer top-secret" },
      }),
    );
    const secondPageBody = await secondPage.json();
    expect(secondPage.status).toBe(200);
    expect(Array.isArray(secondPageBody.transactions)).toBe(true);

    await fixture.cleanup();
  });

  it("uploads, downloads, links, and unlinks attachments over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      dataDirectory: fixture.directory,
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Primary", role: "member", token: "top-secret" }],
      service,
    });

    const formData = new FormData();
    formData.append("file", new File([new Uint8Array(Buffer.from("http-attachment", "utf8"))], "receipt.txt", { type: "text/plain" }));

    const uploaded = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/attachments`, {
        body: formData,
        headers: { authorization: "Bearer top-secret" },
        method: "POST",
      }),
    );
    const uploadedBody = await uploaded.json();
    expect(uploaded.status).toBe(201);

    const downloaded = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/attachments/${uploadedBody.attachment.id}`, {
        headers: { authorization: "Bearer top-secret" },
      }),
    );
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers.get("content-type")).toContain("text/plain");
    expect(downloaded.headers.get("content-disposition")).toContain("receipt.txt");

    const linked = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/transactions/${fixture.book.transactions[0]!.id}/attachments`, {
        body: JSON.stringify({ payload: { attachmentId: uploadedBody.attachment.id } }),
        headers: {
          authorization: "Bearer top-secret",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    expect(linked.status).toBe(200);

    const unlinked = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/transactions/${fixture.book.transactions[0]!.id}/attachments/${uploadedBody.attachment.id}`, {
        headers: { authorization: "Bearer top-secret" },
        method: "DELETE",
      }),
    );
    expect(unlinked.status).toBe(200);

    await fixture.cleanup();
  });

  it("serves unauthenticated liveness and readiness checks over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Primary", role: "member", token: "top-secret" }],
      readinessProbe: async () => ({
        details: { persistenceBackend: "json" },
        ok: true,
      }),
      service,
    });

    const live = await handler(new Request("http://localhost/healthz"));
    const ready = await handler(new Request("http://localhost/readyz"));
    const legacyLive = await handler(new Request("http://localhost/health/live"));
    const legacyReady = await handler(new Request("http://localhost/health/ready"));

    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({
      service: "api",
      status: "ok",
    });

    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({
      persistenceBackend: "json",
      service: "api",
      status: "ready",
    });

    expect(legacyLive.status).toBe(200);
    expect(legacyReady.status).toBe(200);

    await fixture.cleanup();
  });

  it("returns 503 for readiness checks when dependencies are unavailable", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Primary", role: "member", token: "top-secret" }],
      readinessProbe: async () => ({
        details: { persistenceBackend: "postgres" },
        ok: false,
      }),
      service,
    });

    const response = await handler(new Request("http://localhost/readyz"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      persistenceBackend: "postgres",
      service: "api",
      status: "not_ready",
    });

    await fixture.cleanup();
  });

  it("serves request metrics over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Primary", role: "member", token: "top-secret" }],
      service,
    });

    await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}`, {
        headers: {
          authorization: "Bearer top-secret",
        },
      }),
    );
    await handler(
      new Request("http://localhost/api/books", {
        headers: {
          authorization: "Bearer top-secret",
        },
      }),
    );

    await handler(new Request("http://localhost/api/unknown"));

    const metricsResponse = await handler(new Request("http://localhost/metrics"));
    const body = await metricsResponse.text();

    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.headers.get("content-type")).toContain("text/plain");
    expect(metricsResponse.headers.get("x-request-id")).toBeTruthy();
    expect(body).toContain("# HELP gnucash_ng_http_requests_total");
    expect(body).toContain(
      'gnucash_ng_http_requests_total{method="GET",route="/api/books/:bookId",status="200"} 1',
    );
    expect(body).toContain(
      'gnucash_ng_http_requests_total{method="GET",route="/api/unknown",status="401"} 1',
    );
    expect(body).toContain(
      'gnucash_ng_http_request_failures_total{method="GET",route="/api/unknown",status="401"} 1',
    );
    expect(body).toContain(
      'gnucash_ng_http_request_duration_ms_count{method="GET",route="/api/books/:bookId"} 1',
    );
    expect(body).toContain(
      'gnucash_ng_http_requests_total{method="GET",route="/api/books",status="200"} 1',
    );

    await fixture.cleanup();
  });

  it("authenticates requests using trusted-header auth when configured", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      authRequired: true,
      service,
      trustedHeaderAuth: {
        actorHeader: "x-authenticated-actor",
        proxyKey: "proxy-secret",
        proxyKeyHeader: "x-proxy-key",
        roleHeader: "x-authenticated-role",
      },
    });

    const unauthorized = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}`),
    );

    expect(unauthorized.status).toBe(401);

    const authorized = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}`, {
        headers: {
          "x-authenticated-actor": "Primary",
          "x-authenticated-role": "member",
          "x-proxy-key": "proxy-secret",
        },
      }),
    );

    expect(authorized.status).toBe(200);

    await fixture.cleanup();
  });

  it("serves dashboard projections over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(
        `http://localhost/api/books/${fixture.book.id}/dashboard?from=2026-04-01&to=2026-04-30`,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.dashboard.netWorth.quantity).toBeCloseTo(3051.58);

    await fixture.cleanup();
  });

  it("serves reports and close summaries over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const reportResponse = await handler(
      new Request(
        `http://localhost/api/books/${fixture.book.id}/reports/income-statement?from=2026-04-01&to=2026-04-30`,
      ),
    );
    const reportBody = await reportResponse.json();

    expect(reportResponse.status).toBe(200);
    expect(reportBody.report.kind).toBe("income-statement");
    expect(reportBody.report.netIncome.quantity).toBeCloseTo(3051.58);

    const closeResponse = await handler(
      new Request(
        `http://localhost/api/books/${fixture.book.id}/close-summary?from=2026-04-01&to=2026-04-30`,
      ),
    );
    const closeBody = await closeResponse.json();

    expect(closeResponse.status).toBe(200);
    expect(closeBody.closeSummary.readyToClose).toBe(false);
    expect(closeBody.closeSummary.checks.some((check: { id: string }) => check.id === "reconciliation")).toBe(
      true,
    );

    const cashFlowResponse = await handler(
      new Request(
        `http://localhost/api/books/${fixture.book.id}/reports/cash-flow?from=2026-04-01&to=2026-04-30`,
      ),
    );
    const cashFlowBody = await cashFlowResponse.json();

    expect(cashFlowResponse.status).toBe(200);
    expect(cashFlowBody.report.kind).toBe("cash-flow");

    await fixture.cleanup();
  });

  it("imports qif transactions over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/imports/qif`, {
        body: JSON.stringify({
          payload: {
            batchId: "http-qif-1",
            cashAccountId: "acct-checking",
            defaultCounterpartAccountId: "acct-expense-groceries",
            importedAt: "2026-04-05T00:00:00Z",
            qif: `!Type:Bank
D04/03/2026
T-45.12
PCity Utilities
MElectric bill
Lacct-expense-utilities
^
`,
            sourceLabel: "checking.qif",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.book.transactions.some((item: { id: string }) => item.id === "http-qif-1:1")).toBe(
      true,
    );
    expect(body.book.auditEvents.at(-1).eventType).toBe("import.qif.recorded");

    await fixture.cleanup();
  });

  it("imports ofx transactions over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/imports/ofx`, {
        body: JSON.stringify({
          payload: {
            batchId: "http-ofx-1",
            cashAccountId: "acct-checking",
            defaultCounterpartAccountId: "acct-expense-groceries",
            format: "ofx",
            importedAt: "2026-04-05T00:00:00Z",
            sourceLabel: "checking.ofx",
            statement: `OFXHEADER:100
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260403000000
<TRNAMT>-45.12
<FITID>fit-http-1
<NAME>City Utilities
<MEMO>Electric bill
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`,
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.book.transactions.some((item: { id: string }) => item.id === "http-ofx-1:1")).toBe(true);
    expect(body.book.auditEvents.at(-1).eventType).toBe("import.ofx.recorded");

    await fixture.cleanup();
  });

  it("records close periods over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/close-periods`, {
        body: JSON.stringify({
          payload: {
            closedAt: "2026-04-01T00:00:00Z",
            from: "2026-03-01",
            to: "2026-03-31",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.book.closePeriods).toHaveLength(1);
    expect(body.book.auditEvents.at(-1).eventType).toBe("close.recorded");

    await fixture.cleanup();
  });

  it("creates, lists, and restores backups over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const createResponse = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/backups`, {
        method: "POST",
      }),
    );
    const createBody = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(createBody.backup.id).toContain("backup-");

    const updateResponse = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/imports/gnucash-xml`, {
        body: JSON.stringify({
          payload: {
            importedAt: "2026-04-05T00:00:00Z",
            sourceLabel: "book.gnucash.xml",
            xml: buildGnuCashXmlExport({ book: fixture.book }).contents.replace(
              'name="Household Finance"',
              'name="Changed Before Restore"',
            ),
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    expect(updateResponse.status).toBe(200);

    const listResponse = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/backups`),
    );
    const listBody = await listResponse.json();

    expect(listResponse.status).toBe(200);
    expect(listBody.backups).toHaveLength(1);

    const restoreResponse = await handler(
      new Request(
        `http://localhost/api/books/${fixture.book.id}/backups/${createBody.backup.id}/restore`,
        {
          method: "POST",
        },
      ),
    );
    const restoreBody = await restoreResponse.json();

    expect(restoreResponse.status).toBe(200);
    expect(restoreBody.book.name).toBe("Household Finance");

    await fixture.cleanup();
  });

  it("exports qif transactions over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(
        `http://localhost/api/books/${fixture.book.id}/exports/qif?accountId=acct-checking&from=2026-04-01&to=2026-04-30`,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.export.fileName).toBe(`${fixture.book.id}-acct-checking-2026-04-01-2026-04-30.qif`);
    expect(body.export.transactionCount).toBeGreaterThan(0);
    expect(body.export.contents).toContain("!Type:Bank");

    await fixture.cleanup();
  });

  it("exports ofx, qfx, and gnucash xml over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const ofxResponse = await handler(
      new Request(
        `http://localhost/api/books/${fixture.book.id}/exports/ofx?accountId=acct-checking&from=2026-04-01&to=2026-04-30`,
      ),
    );
    const qfxResponse = await handler(
      new Request(
        `http://localhost/api/books/${fixture.book.id}/exports/qfx?accountId=acct-checking&from=2026-04-01&to=2026-04-30`,
      ),
    );
    const xmlResponse = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/exports/gnucash-xml`),
    );

    const ofxBody = await ofxResponse.json();
    const qfxBody = await qfxResponse.json();
    const xmlBody = await xmlResponse.json();

    expect(ofxResponse.status).toBe(200);
    expect(ofxBody.export.format).toBe("ofx");
    expect(qfxResponse.status).toBe(200);
    expect(qfxBody.export.format).toBe("qfx");
    expect(xmlResponse.status).toBe(200);
    expect(xmlBody.export.fileName).toBe(`${fixture.book.id}.gnucash.xml`);

    await fixture.cleanup();
  });

  it("imports qfx and gnucash xml validation failures over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const qfxResponse = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/imports/qfx`, {
        body: JSON.stringify({
          payload: {
            batchId: "http-qfx-bad-1",
            cashAccountId: "acct-checking",
            defaultCounterpartAccountId: "acct-expense-groceries",
            format: "qfx",
            importedAt: "2026-04-05T00:00:00Z",
            sourceLabel: "checking.qfx",
            statement: "<OFX></OFX>",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const xmlResponse = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/imports/gnucash-xml`, {
        body: JSON.stringify({
          payload: {
            importedAt: "2026-04-05T00:00:00Z",
            sourceLabel: "book.gnucash.xml",
            xml: buildGnuCashXmlExport({ book: { ...fixture.book, id: "other-book" } }).contents,
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    const qfxBody = await qfxResponse.json();
    const xmlBody = await xmlResponse.json();

    expect(qfxResponse.status).toBe(422);
    expect(qfxBody.error.code).toBe("validation.failed");
    expect(xmlResponse.status).toBe(422);
    expect(xmlBody.error.code).toBe("validation.failed");

    await fixture.cleanup();
  });

  it("accepts transaction posts over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/transactions`, {
        body: JSON.stringify({
          actor: "Primary",
          transaction: {
            id: "txn-http-1",
            occurredOn: "2026-04-03",
            description: "HTTP transaction",
            postings: [
              {
                accountId: "acct-expense-utilities",
                amount: { commodityCode: "USD", quantity: 45.12 },
              },
              {
                accountId: "acct-checking",
                amount: { commodityCode: "USD", quantity: -45.12 },
                cleared: true,
              },
            ],
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.book.transactions.some((item: { id: string }) => item.id === "txn-http-1")).toBe(
      true,
    );
    expect(body.book.auditEvents.at(-1).actor).toBe("local-admin");

    await fixture.cleanup();
  });

  it("accepts transaction updates over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/transactions/txn-grocery-1`, {
        body: JSON.stringify({
          actor: "Primary",
          transaction: {
            id: "txn-grocery-1",
            occurredOn: "2026-04-02",
            description: "HTTP-updated groceries",
            postings: [
              {
                accountId: "acct-expense-groceries",
                amount: { commodityCode: "USD", quantity: 151.5 },
              },
              {
                accountId: "acct-checking",
                amount: { commodityCode: "USD", quantity: -151.5 },
                cleared: true,
              },
            ],
          },
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(
      body.book.transactions.find((item: { id: string }) => item.id === "txn-grocery-1").description,
    ).toBe("HTTP-updated groceries");
    expect(body.book.auditEvents.at(-1).eventType).toBe("transaction.updated");

    await fixture.cleanup();
  });

  it("soft-deletes transactions over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/transactions/txn-grocery-1`, {
        method: "DELETE",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.book.transactions.some((item: { id: string }) => item.id === "txn-grocery-1")).toBe(false);
    expect(body.book.auditEvents.at(-1).eventType).toBe("transaction.deleted");

    await fixture.cleanup();
  });

  it("requires privileged authority to destroy transactions over HTTP", async () => {
    const fixture = await createFixture();
    fixture.book.householdMembers = [...fixture.book.householdMembers, "Admin"];
    fixture.book.householdMemberRoles = {
      ...(fixture.book.householdMemberRoles ?? {}),
      Admin: "admin",
    };
    await saveBookToFile(fixture.bookPath, fixture.book);

    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      authIdentities: [
        { actor: "Primary", role: "member", token: "member-token" },
        { actor: "Admin", role: "admin", token: "admin-token" },
      ],
      service,
    });

    const forbidden = await handler(
      new Request(
        `http://localhost/api/books/${fixture.book.id}/transactions/txn-grocery-1/destroy`,
        {
          headers: {
            authorization: "Bearer member-token",
          },
          method: "DELETE",
        },
      ),
    );

    expect(forbidden.status).toBe(403);

    const allowed = await handler(
      new Request(
        `http://localhost/api/books/${fixture.book.id}/transactions/txn-grocery-1/destroy`,
        {
          headers: {
            authorization: "Bearer admin-token",
          },
          method: "DELETE",
        },
      ),
    );
    const allowedBody = await allowed.json();

    expect(allowed.status).toBe(200);
    expect(allowedBody.book.transactions.some((item: { id: string }) => item.id === "txn-grocery-1")).toBe(
      false,
    );
    expect(allowedBody.book.auditEvents.at(-1).eventType).toBe("transaction.destroyed");

    await fixture.cleanup();
  });

  it("accepts budget line and envelope writes over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const budgetResponse = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/budget-lines`, {
        body: JSON.stringify({
          line: {
            accountId: "acct-expense-groceries",
            budgetPeriod: "monthly",
            period: "2026-05",
            plannedAmount: { commodityCode: "USD", quantity: 700 },
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const envelopeResponse = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/envelopes`, {
        body: JSON.stringify({
          envelope: {
            availableAmount: { commodityCode: "USD", quantity: 150 },
            expenseAccountId: "acct-expense-housing",
            fundingAccountId: "acct-checking",
            id: "env-housing",
            name: "Housing Buffer",
            rolloverEnabled: true,
            targetAmount: { commodityCode: "USD", quantity: 150 },
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(budgetResponse.status).toBe(200);
    expect(envelopeResponse.status).toBe(200);

    await fixture.cleanup();
  });

  it("accepts envelope allocation and schedule writes over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const allocationResponse = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/envelope-allocations`, {
        body: JSON.stringify({
          allocation: {
            amount: { commodityCode: "USD", quantity: 50 },
            envelopeId: "env-groceries",
            id: "alloc-http-1",
            occurredOn: "2026-04-15",
            type: "fund",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const scheduleResponse = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/schedules`, {
        body: JSON.stringify({
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
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(allocationResponse.status).toBe(200);
    expect(scheduleResponse.status).toBe(200);

    await fixture.cleanup();
  });

  it("executes due schedules over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/schedules/sched-rent/execute`, {
        body: JSON.stringify({
          payload: {
            occurredOn: "2026-05-01",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.book.transactions.some((item: { id: string }) => item.id === "sched-rent:2026-05-01")).toBe(
      true,
    );
    expect(body.book.auditEvents.some((event: { eventType: string }) => event.eventType === "schedule.executed")).toBe(
      true,
    );

    await fixture.cleanup();
  });

  it("applies schedule exceptions over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/schedules/sched-rent/exceptions`, {
        body: JSON.stringify({
          payload: {
            action: "defer",
            nextDueOn: "2026-05-05",
            note: "Grace period",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.book.scheduledTransactions.find((item: { id: string }) => item.id === "sched-rent")?.nextDueOn).toBe(
      "2026-05-05",
    );
    expect(
      body.book.auditEvents.some((event: { eventType: string }) => event.eventType === "schedule.exception.applied"),
    ).toBe(true);

    await fixture.cleanup();
  });

  it("returns 400 for invalid json bodies", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/transactions`, {
        body: "{",
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errors).toContain("Request body must be valid JSON.");
    expect(body.error.code).toBe("request.invalid");

    await fixture.cleanup();
  });

  it("returns 404 for unknown routes", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(new Request("http://localhost/api/unknown"));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("request.not_found");

    await fixture.cleanup();
  });

  it("returns 401 when auth is required and no token is provided", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Primary", role: "member", token: "top-secret" }],
      service,
    });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}`),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.errors).toContain("Authentication is required.");
    expect(body.error.code).toBe("auth.required");

    await fixture.cleanup();
  });

  it("allows authenticated household members and ignores caller-supplied actor spoofing", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Primary", role: "member", token: "top-secret" }],
      service,
    });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/transactions`, {
        body: JSON.stringify({
          actor: "Spoofed",
          transaction: {
            id: "txn-auth-1",
            occurredOn: "2026-04-03",
            description: "Authorized transaction",
            postings: [
              {
                accountId: "acct-expense-utilities",
                amount: { commodityCode: "USD", quantity: 45.12 },
              },
              {
                accountId: "acct-checking",
                amount: { commodityCode: "USD", quantity: -45.12 },
                cleared: true,
              },
            ],
          },
        }),
        headers: {
          authorization: "Bearer top-secret",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.book.auditEvents.at(-1).actor).toBe("Primary");

    await fixture.cleanup();
  });

  it("returns 403 for authenticated non-members", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Intruder", role: "member", token: "bad-token" }],
      service,
    });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}`, {
        headers: {
          authorization: "Bearer bad-token",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.errors[0]).toContain("not authorized");
    expect(body.error.code).toBe("auth.forbidden");

    await fixture.cleanup();
  });

  it("returns 415 for non-json post bodies", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/transactions`, {
        body: "actor=Primary",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(415);
    expect(body.errors).toContain("POST requests must use application/json.");
    expect(body.error.code).toBe("request.unsupported_media_type");

    await fixture.cleanup();
  });

  it("returns 400 for malformed transaction payloads", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/transactions`, {
        body: JSON.stringify({
          transaction: {
            id: "txn-bad-schema",
            occurredOn: "04/03/2026",
            description: "",
            postings: [
              {
                accountId: "acct-expense-utilities",
                amount: { commodityCode: "USD", quantity: "bad" },
              },
            ],
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errors).toContain("transaction.description is required.");
    expect(body.error.code).toBe("validation.failed");
    expect(body.errors).toContain("transaction.occurredOn must use YYYY-MM-DD format.");
    expect(body.errors).toContain("transaction.postings must contain at least two postings.");

    await fixture.cleanup();
  });

  it("returns 400 for malformed export requests and 404 for missing restores", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const exportResponse = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/exports/ofx?from=2026-04-01&to=2026-04-30`),
    );
    const restoreResponse = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/backups/backup-missing/restore`, {
        method: "POST",
      }),
    );

    const exportBody = await exportResponse.json();
    const restoreBody = await restoreResponse.json();

    expect(exportResponse.status).toBe(400);
    expect(exportBody.error.code).toBe("validation.failed");
    expect(restoreResponse.status).toBe(404);
    expect(restoreBody.error.code).toBe("book.not_found");

    await fixture.cleanup();
  });

  it("returns 400 for malformed reconciliation payloads", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/reconciliations`, {
        body: JSON.stringify({
          payload: {
            accountId: "",
            clearedTransactionIds: "txn-paycheck-1",
            statementBalance: "bad",
            statementDate: "2026/04/02",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errors).toContain("payload.accountId is required.");
    expect(body.error.code).toBe("validation.failed");
    expect(body.errors).toContain("payload.clearedTransactionIds must be an array.");
    expect(body.errors).toContain("payload.statementBalance must be a finite number.");
    expect(body.errors).toContain("payload.statementDate must use YYYY-MM-DD format.");

    await fixture.cleanup();
  });

  it("returns 400 for malformed csv import payloads", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/imports/csv`, {
        body: JSON.stringify({
          payload: {
            batchId: "",
            importedAt: "not-a-timestamp",
            rows: [
              {
                amount: "bad",
                cashAccountId: "",
                counterpartAccountId: "acct-expense-transport",
                description: "",
                occurredOn: "2026/04/04",
              },
            ],
            sourceLabel: "",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errors).toContain("payload.batchId is required.");
    expect(body.error.code).toBe("validation.failed");
    expect(body.errors).toContain("payload.sourceLabel is required.");
    expect(body.errors).toContain("payload.importedAt must be a valid ISO timestamp.");
    expect(body.errors).toContain("payload.rows[0].occurredOn must use YYYY-MM-DD format.");
    expect(body.errors).toContain("payload.rows[0].description is required.");
    expect(body.errors).toContain("payload.rows[0].amount must be a finite number.");
    expect(body.errors).toContain("payload.rows[0].cashAccountId is required.");

    await fixture.cleanup();
  });

  it("returns 400 for malformed richer write payloads", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const budgetResponse = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/budget-lines`, {
        body: JSON.stringify({
          line: {
            accountId: "",
            budgetPeriod: "bad",
            period: "",
            plannedAmount: { commodityCode: "", quantity: "bad" },
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const envelopeResponse = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/envelopes`, {
        body: JSON.stringify({
          envelope: {
            id: "",
            name: "",
            expenseAccountId: "",
            fundingAccountId: "",
            availableAmount: { commodityCode: "", quantity: "bad" },
            rolloverEnabled: "yes",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const budgetBody = await budgetResponse.json();
    const envelopeBody = await envelopeResponse.json();

    expect(budgetResponse.status).toBe(400);
    expect(budgetBody.error.code).toBe("validation.failed");
    expect(budgetBody.errors).toContain("line.accountId is required.");
    expect(envelopeResponse.status).toBe(400);
    expect(envelopeBody.errors).toContain("envelope.rolloverEnabled must be a boolean.");

    await fixture.cleanup();
  });

  it("returns 413 for oversized request bodies", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ maxBodyBytes: 10, service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/transactions`, {
        body: JSON.stringify({ actor: "Primary", transaction: { id: "x" } }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.errors).toContain("Request body exceeds the configured size limit.");
    expect(body.error.code).toBe("request.too_large");

    await fixture.cleanup();
  });

  it("adds security headers to responses", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}`),
    );

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("x-request-id")).toBeTruthy();

    await fixture.cleanup();
  });

  it("echoes caller-supplied request ids on responses", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}`, {
        headers: {
          "x-request-id": "req-test-123",
        },
      }),
    );

    expect(response.headers.get("x-request-id")).toBe("req-test-123");

    await fixture.cleanup();
  });

  it("returns 429 when read requests exceed the configured rate limit", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      rateLimiter: createInMemoryRateLimiter({ now: () => 1000 }),
      rateLimitPolicy: {
        import: { keyPrefix: "import", limit: 10, windowMs: 60000 },
        mutation: { keyPrefix: "mutation", limit: 10, windowMs: 60000 },
        read: { keyPrefix: "read", limit: 1, windowMs: 60000 },
      },
      service,
    });

    const first = await handler(new Request(`http://localhost/api/books/${fixture.book.id}`));
    const second = await handler(new Request(`http://localhost/api/books/${fixture.book.id}`));
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(secondBody.errors).toContain("Rate limit exceeded. Retry later.");
    expect(secondBody.error.code).toBe("security.rate_limited");
    expect(second.headers.get("retry-after")).toBe("60");
    expect(second.headers.get("x-ratelimit-limit")).toBe("1");
    expect(second.headers.get("x-ratelimit-remaining")).toBe("0");

    await fixture.cleanup();
  });

  it("returns 429 when import requests exceed the configured import throttle", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      rateLimiter: createInMemoryRateLimiter({ now: () => 1000 }),
      rateLimitPolicy: {
        import: { keyPrefix: "import", limit: 1, windowMs: 60000 },
        mutation: { keyPrefix: "mutation", limit: 10, windowMs: 60000 },
        read: { keyPrefix: "read", limit: 10, windowMs: 60000 },
      },
      service,
    });

    const request = () =>
      new Request(`http://localhost/api/books/${fixture.book.id}/imports/csv`, {
        body: JSON.stringify({
          payload: {
            batchId: "import-rate-limit",
            importedAt: "2026-04-03T12:00:00.000Z",
            rows: [
              {
                amount: 25,
                cashAccountId: "acct-checking",
                counterpartAccountId: "acct-expense-groceries",
                description: "Groceries",
                occurredOn: "2026-04-03",
              },
            ],
            sourceLabel: "CSV",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

    const first = await handler(request());
    const second = await handler(request());
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(secondBody.errors).toContain("Rate limit exceeded. Retry later.");
    expect(secondBody.error.code).toBe("security.rate_limited");

    await fixture.cleanup();
  });

  it("returns household members for any authenticated member", async () => {
    const fixture = await createFixture();
    fixture.book.householdMembers = ["Primary", "Partner", "Admin"];
    fixture.book.householdMemberRoles = {
      Primary: "guardian",
      Partner: "member",
      Admin: "admin",
    };
    await saveBookToFile(fixture.bookPath, fixture.book);

    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Partner", role: "member", token: "tok-partner" }],
      service: createBookService({
        repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
      }),
    });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/members`, {
        headers: { authorization: "Bearer tok-partner" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.members).toHaveLength(3);
    expect(body.members.find((m: { actor: string }) => m.actor === "Admin")?.role).toBe("admin");

    await fixture.cleanup();
  });

  it("returns 403 for non-member on GET household members", async () => {
    const fixture = await createFixture();
    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Stranger", role: "member", token: "tok-stranger" }],
      service: createBookService({
        repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
      }),
    });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/members`, {
        headers: { authorization: "Bearer tok-stranger" },
      }),
    );

    expect(response.status).toBe(403);

    await fixture.cleanup();
  });

  it("adds a household member for admin", async () => {
    const fixture = await createFixture();
    fixture.book.householdMembers = ["Primary", "Admin"];
    fixture.book.householdMemberRoles = { Primary: "guardian", Admin: "admin" };
    await saveBookToFile(fixture.bookPath, fixture.book);

    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Admin", role: "admin", token: "tok-admin" }],
      service: createBookService({
        repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
      }),
    });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/members`, {
        method: "POST",
        headers: { authorization: "Bearer tok-admin", "content-type": "application/json" },
        body: JSON.stringify({ payload: { actor: "NewMember", role: "member" } }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.book.householdMembers).toContain("NewMember");

    await fixture.cleanup();
  });

  it("returns 403 when non-admin attempts to add a household member", async () => {
    const fixture = await createFixture();
    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Primary", role: "member", token: "tok-primary" }],
      service: createBookService({
        repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
      }),
    });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/members`, {
        method: "POST",
        headers: { authorization: "Bearer tok-primary", "content-type": "application/json" },
        body: JSON.stringify({ payload: { actor: "NewMember" } }),
      }),
    );

    expect(response.status).toBe(403);

    await fixture.cleanup();
  });

  it("updates a household member role for admin", async () => {
    const fixture = await createFixture();
    fixture.book.householdMembers = ["Primary", "Admin"];
    fixture.book.householdMemberRoles = { Primary: "guardian", Admin: "admin" };
    await saveBookToFile(fixture.bookPath, fixture.book);

    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Admin", role: "admin", token: "tok-admin" }],
      service: createBookService({
        repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
      }),
    });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/members/Primary/role`, {
        method: "PUT",
        headers: { authorization: "Bearer tok-admin", "content-type": "application/json" },
        body: JSON.stringify({ payload: { role: "member" } }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.book.householdMemberRoles?.["Primary"]).toBe("member");

    await fixture.cleanup();
  });

  it("removes a household member for admin", async () => {
    const fixture = await createFixture();
    fixture.book.householdMembers = ["Primary", "Partner", "Admin"];
    fixture.book.householdMemberRoles = { Primary: "guardian", Partner: "member", Admin: "admin" };
    await saveBookToFile(fixture.bookPath, fixture.book);

    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Admin", role: "admin", token: "tok-admin" }],
      service: createBookService({
        repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
      }),
    });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/members/Partner`, {
        method: "DELETE",
        headers: { authorization: "Bearer tok-admin" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.book.householdMembers).not.toContain("Partner");

    await fixture.cleanup();
  });

  it("returns 409 when removing the last admin", async () => {
    const fixture = await createFixture();
    fixture.book.householdMembers = ["Primary", "Admin"];
    fixture.book.householdMemberRoles = { Primary: "guardian", Admin: "admin" };
    await saveBookToFile(fixture.bookPath, fixture.book);

    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Admin", role: "admin", token: "tok-admin" }],
      service: createBookService({
        repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
      }),
    });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/members/Admin`, {
        method: "DELETE",
        headers: { authorization: "Bearer tok-admin" },
      }),
    );

    expect(response.status).toBe(409);

    await fixture.cleanup();
  });

  it("returns 400 when POST household member body is invalid", async () => {
    const fixture = await createFixture();
    fixture.book.householdMembers = ["Admin"];
    fixture.book.householdMemberRoles = { Admin: "admin" };
    await saveBookToFile(fixture.bookPath, fixture.book);

    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Admin", role: "admin", token: "tok-admin" }],
      service: createBookService({
        repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
      }),
    });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/members`, {
        method: "POST",
        headers: { authorization: "Bearer tok-admin", "content-type": "application/json" },
        body: JSON.stringify({ payload: { role: "member" } }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errors).toContain("payload.actor is required.");

    await fixture.cleanup();
  });

  it("returns 400 when PUT household member role body is invalid", async () => {
    const fixture = await createFixture();
    fixture.book.householdMembers = ["Primary", "Admin"];
    fixture.book.householdMemberRoles = { Primary: "guardian", Admin: "admin" };
    await saveBookToFile(fixture.bookPath, fixture.book);

    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Admin", role: "admin", token: "tok-admin" }],
      service: createBookService({
        repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
      }),
    });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/members/Primary/role`, {
        method: "PUT",
        headers: { authorization: "Bearer tok-admin", "content-type": "application/json" },
        body: JSON.stringify({ payload: { role: "superuser" } }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errors).toContain("payload.role must be admin, guardian, or member.");

    await fixture.cleanup();
  });

  it("responds to OPTIONS preflight requests without requiring auth", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      authIdentities: [{ actor: "Primary", role: "admin", token: "top-secret" }],
      corsAllowedOrigins: ["https://app.example.com"],
      service,
    });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/transactions`, {
        method: "OPTIONS",
        headers: { origin: "https://app.example.com" },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
    expect(response.headers.get("access-control-allow-methods")).toBeTruthy();
    expect(response.headers.get("access-control-allow-headers")).toBeTruthy();
    expect(response.headers.get("access-control-max-age")).toBeTruthy();

    await fixture.cleanup();
  });

  it("reflects configured allowed origin on cross-origin requests", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      corsAllowedOrigins: ["https://app.example.com"],
      service,
    });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}`, {
        headers: { origin: "https://app.example.com" },
      }),
    );

    expect(response.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
    expect(response.headers.get("vary")).toBe("Origin");

    await fixture.cleanup();
  });

  it("omits ACAO header when origin does not match configured allowed origins", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      corsAllowedOrigins: ["https://app.example.com"],
      service,
    });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}`, {
        headers: { origin: "https://evil.example.com" },
      }),
    );

    expect(response.headers.get("access-control-allow-origin")).toBeNull();

    await fixture.cleanup();
  });

  it("emits wildcard ACAO in non-production when no origins are configured", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      runtimeMode: "development",
      service,
    });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}`, {
        headers: { origin: "https://anything.example.com" },
      }),
    );

    expect(response.headers.get("access-control-allow-origin")).toBe("*");

    await fixture.cleanup();
  });

  it("omits ACAO header in production when no origins are configured", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({
      runtimeMode: "production",
      service,
    });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}`, {
        headers: { origin: "https://anything.example.com" },
      }),
    );

    expect(response.headers.get("access-control-allow-origin")).toBeNull();

    await fixture.cleanup();
  });

  it("serves audit events over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/audit-events`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body.auditEvents)).toBe(true);

    await fixture.cleanup();
  });

  it("filters audit events by eventType over HTTP", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(
        `http://localhost/api/books/${fixture.book.id}/audit-events?eventType=transaction.created`,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    for (const event of body.auditEvents) {
      expect(event.eventType).toBe("transaction.created");
    }

    await fixture.cleanup();
  });

  it("rejects audit events with an invalid limit parameter", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(
        `http://localhost/api/books/${fixture.book.id}/audit-events?limit=notanumber`,
      ),
    );

    expect(response.status).toBe(400);

    await fixture.cleanup();
  });

  it("normalizes audit events route label for metrics", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/audit-events`),
    );

    const metricsResponse = await handler(new Request("http://localhost/metrics"));
    const body = await metricsResponse.text();

    expect(body).toContain("/api/books/:bookId/audit-events");

    await fixture.cleanup();
  });

  it("serves account list via GET /api/workspaces/:id/accounts", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/accounts`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body.accounts)).toBe(true);
    expect(body.accounts.length).toBe(fixture.book.accounts.length);

    await fixture.cleanup();
  });

  it("creates an account via POST /api/workspaces/:id/accounts", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/accounts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account: { id: "acct-http-new", code: "9999", name: "HTTP Account", type: "income" },
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect("book" in body).toBe(true);

    await fixture.cleanup();
  });

  it("returns 400 for invalid account POST body", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const response = await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/accounts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account: { id: "x", code: "", name: "X", type: "asset" } }),
      }),
    );

    expect(response.status).toBe(400);

    await fixture.cleanup();
  });

  it("archives an account via DELETE /api/workspaces/:id/accounts/:accountId", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    // Create a fresh account with no transactions so we can archive it
    await handler(
      new Request(`http://localhost/api/books/${fixture.book.id}/accounts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account: { id: "acct-to-delete", code: "7777", name: "To Delete", type: "expense" },
        }),
      }),
    );

    const response = await handler(
      new Request(
        `http://localhost/api/books/${fixture.book.id}/accounts/acct-to-delete`,
        { method: "DELETE" },
      ),
    );

    expect(response.status).toBe(200);

    await fixture.cleanup();
  });

  it("returns 409 when archiving account with transactions", async () => {
    const fixture = await createFixture();
    const service = createBookService({
      repository: createFileSystemBookRepository({ rootDirectory: fixture.directory }),
    });
    const handler = createTestHttpHandler({ service });

    const accountWithTransactions = fixture.book.accounts.find((a) =>
      fixture.book.transactions.some(
        (t) => !t.deletion && t.postings.some((p) => p.accountId === a.id),
      ),
    );

    if (!accountWithTransactions) {
      await fixture.cleanup();
      return;
    }

    const response = await handler(
      new Request(
        `http://localhost/api/books/${fixture.book.id}/accounts/${accountWithTransactions.id}`,
        { method: "DELETE" },
      ),
    );

    expect(response.status).toBe(409);

    await fixture.cleanup();
  });
});
