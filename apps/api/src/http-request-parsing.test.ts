import { describe, expect, it } from "vitest";
import { createNoopLogger } from "@gnucash-ng/logging";
import { parsePostRequestBody, parsePutRequestBody } from "./http-request-parsing";

describe("http request parsing", () => {
  const requestLogger = createNoopLogger();

  it("parses valid POST JSON body", async () => {
    const result = await parsePostRequestBody({
      bodylessPostRoute: false,
      maxBodyBytes: 1024,
      request: new Request("http://localhost/path", {
        body: JSON.stringify({ ok: true }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      requestLogger,
    });

    expect(result.errorCode).toBeUndefined();
    expect(result.body).toEqual({ ok: true });
  });

  it("supports bodyless POST routes", async () => {
    const result = await parsePostRequestBody({
      bodylessPostRoute: true,
      maxBodyBytes: 1024,
      request: new Request("http://localhost/path", { method: "POST" }),
      requestLogger,
    });

    expect(result.errorCode).toBeUndefined();
    expect(result.body).toBeUndefined();
  });

  it("rejects non-json POST and PUT requests", async () => {
    const post = await parsePostRequestBody({
      bodylessPostRoute: false,
      maxBodyBytes: 1024,
      request: new Request("http://localhost/path", {
        body: "plain",
        headers: { "content-type": "text/plain" },
        method: "POST",
      }),
      requestLogger,
    });

    const put = await parsePutRequestBody({
      maxBodyBytes: 1024,
      request: new Request("http://localhost/path", {
        body: "plain",
        headers: { "content-type": "text/plain" },
        method: "PUT",
      }),
      requestLogger,
    });

    expect(post.status).toBe(415);
    expect(put.status).toBe(415);
  });

  it("rejects invalid json and oversized payloads", async () => {
    const invalidPut = await parsePutRequestBody({
      maxBodyBytes: 1024,
      request: new Request("http://localhost/path", {
        body: "{invalid",
        headers: { "content-type": "application/json" },
        method: "PUT",
      }),
      requestLogger,
    });

    const tooLargePost = await parsePostRequestBody({
      bodylessPostRoute: false,
      maxBodyBytes: 4,
      request: new Request("http://localhost/path", {
        body: JSON.stringify({ payload: "too large" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      requestLogger,
    });

    expect(invalidPut.status).toBe(400);
    expect(tooLargePost.status).toBe(413);
  });
});
