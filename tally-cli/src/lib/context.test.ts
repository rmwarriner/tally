import type { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./api-client";
import { buildContext, getGlobalOptions } from "./context";
import { resolveConfig } from "./config";
import { resolveOutputFormat } from "./output";

vi.mock("./config", () => ({
  resolveConfig: vi.fn(),
}));

vi.mock("./output", async (importOriginal) => {
  const original = await importOriginal<typeof import("./output")>();
  return {
    ...original,
    resolveOutputFormat: vi.fn(),
  };
});

describe("getGlobalOptions", () => {
  it("maps optsWithGlobals values and derives color=true by default", () => {
    const command = {
      optsWithGlobals: () => ({
        api: "http://127.0.0.1:4000",
        book: "book-1",
        format: "json",
        token: "secret",
      }),
    } as Command;

    const options = getGlobalOptions(command);
    expect(options).toEqual({
      api: "http://127.0.0.1:4000",
      book: "book-1",
      color: true,
      format: "json",
      noColor: undefined,
      token: "secret",
    });
  });

  it("respects explicit noColor flag", () => {
    const command = {
      optsWithGlobals: () => ({
        noColor: true,
      }),
    } as Command;

    const options = getGlobalOptions(command);
    expect(options.color).toBe(false);
    expect(options.noColor).toBe(true);
  });
});

describe("buildContext", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds context with book id when config includes currentBook", () => {
    const command = {
      optsWithGlobals: () => ({
        api: "http://api",
        color: true,
        token: "tok",
      }),
    } as Command;

    vi.mocked(resolveConfig).mockReturnValue({
      apiUrl: "http://api",
      currentBook: "book-abc",
      token: "tok",
    });
    vi.mocked(resolveOutputFormat).mockReturnValue("table");

    const context = buildContext(command, { requireBook: true });

    expect(vi.mocked(resolveConfig)).toHaveBeenCalledWith(
      expect.objectContaining({ api: "http://api", token: "tok" }),
      { requireBook: true },
    );
    expect(vi.mocked(resolveOutputFormat)).toHaveBeenCalled();
    expect(context.bookId).toBe("book-abc");
    expect(context.color).toBe(true);
    expect(context.format).toBe("table");
    expect(context.api).toBeInstanceOf(ApiClient);
  });

  it("builds context without book id when config has no currentBook", () => {
    const command = {
      optsWithGlobals: () => ({
        noColor: true,
      }),
    } as Command;

    vi.mocked(resolveConfig).mockReturnValue({
      apiUrl: "http://api",
      token: "tok",
    });
    vi.mocked(resolveOutputFormat).mockReturnValue("json");

    const context = buildContext(command);
    expect(context.bookId).toBeUndefined();
    expect(context.color).toBe(false);
    expect(context.format).toBe("json");
    expect(context.api).toBeInstanceOf(ApiClient);
  });
});
