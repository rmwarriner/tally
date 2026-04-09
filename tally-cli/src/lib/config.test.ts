import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getConfigPath, resolveConfig, writeConfig } from "./config";

// Redirect config path to a temp directory so tests never touch ~/.tally
let tmpHome: string;

vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return {
    ...original,
    homedir: () => tmpHome,
  };
});

beforeEach(() => {
  tmpHome = join(tmpdir(), `tally-test-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpHome, { recursive: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getConfigPath", () => {
  it("returns path under homedir", () => {
    expect(getConfigPath()).toBe(join(tmpHome, ".tally", "config.json"));
  });
});

describe("resolveConfig — precedence", () => {
  const base = { api: undefined, book: undefined, format: undefined, noColor: false, token: undefined };

  beforeEach(() => {
    // Make precedence assertions deterministic even when the host shell exports TALLY_* values.
    vi.stubEnv("TALLY_API_URL", "");
    vi.stubEnv("TALLY_TOKEN", "");
    vi.stubEnv("TALLY_BOOK", "");
  });

  it("flag wins over env and config file", () => {
    vi.stubEnv("TALLY_API_URL", "http://env-api");
    vi.stubEnv("TALLY_TOKEN", "env-token");
    vi.stubEnv("TALLY_BOOK", "env-book");

    const cfg = resolveConfig(
      { ...base, api: "http://flag-api", token: "flag-token", book: "flag-book" },
    );

    expect(cfg.apiUrl).toBe("http://flag-api");
    expect(cfg.token).toBe("flag-token");
    expect((cfg as { currentBook?: string }).currentBook).toBe("flag-book");
  });

  it("env wins over config file", () => {
    mkdirSync(join(tmpHome, ".tally"), { recursive: true });
    writeFileSync(
      join(tmpHome, ".tally", "config.json"),
      JSON.stringify({ apiUrl: "http://file-api", token: "file-token", currentBook: "file-book" }),
      { mode: 0o600 },
    );

    vi.stubEnv("TALLY_API_URL", "http://env-api");
    vi.stubEnv("TALLY_TOKEN", "env-token");
    vi.stubEnv("TALLY_BOOK", "env-book");

    const cfg = resolveConfig({ ...base });

    expect(cfg.apiUrl).toBe("http://env-api");
    expect(cfg.token).toBe("env-token");
  });

  it("config file used when no flag or env", () => {
    mkdirSync(join(tmpHome, ".tally"), { recursive: true });
    writeFileSync(
      join(tmpHome, ".tally", "config.json"),
      JSON.stringify({ apiUrl: "http://file-api", token: "file-token", currentBook: "book-1" }),
      { mode: 0o600 },
    );

    const cfg = resolveConfig({ ...base });

    expect(cfg.apiUrl).toBe("http://file-api");
    expect(cfg.token).toBe("file-token");
    expect((cfg as { currentBook?: string }).currentBook).toBe("book-1");
  });

  it("throws when apiUrl is missing from all sources", () => {
    expect(() => resolveConfig({ ...base, token: "t" })).toThrow(/API URL/);
  });

  it("throws when token is missing from all sources", () => {
    expect(() => resolveConfig({ ...base, api: "http://api" })).toThrow(/token/i);
  });

  it("throws when requireBook and no book in any source", () => {
    expect(() =>
      resolveConfig({ ...base, api: "http://api", token: "t" }, { requireBook: true }),
    ).toThrow(/book/i);
  });

  it("ignores unknown fields in config file", () => {
    mkdirSync(join(tmpHome, ".tally"), { recursive: true });
    writeFileSync(
      join(tmpHome, ".tally", "config.json"),
      JSON.stringify({ apiUrl: "http://api", token: "t", unknown: true }),
      { mode: 0o600 },
    );

    expect(() => resolveConfig({ ...base })).not.toThrow();
  });

  it("treats missing config file as empty (no crash)", () => {
    expect(() => resolveConfig({ ...base, api: "http://api", token: "t" })).not.toThrow();
  });

  it("throws on invalid JSON in config file", () => {
    mkdirSync(join(tmpHome, ".tally"), { recursive: true });
    writeFileSync(join(tmpHome, ".tally", "config.json"), "not-json", { mode: 0o600 });

    expect(() => resolveConfig({ ...base })).toThrow();
  });
});

describe("writeConfig", () => {
  it("writes currentBook to config file", () => {
    writeConfig({ apiUrl: "http://api", token: "t", currentBook: "book-42" });

    const configPath = getConfigPath();
    const saved = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, string>;

    expect(saved.currentBook).toBe("book-42");
    expect(saved.apiUrl).toBe("http://api");
    expect(saved.token).toBe("t");
  });

  it("sets file mode to 0600", () => {
    writeConfig({ apiUrl: "http://api", token: "t" });

    const configPath = getConfigPath();
    // eslint-disable-next-line no-bitwise
    const mode = require("node:fs").statSync(configPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("merges with existing config rather than overwriting", () => {
    writeConfig({ apiUrl: "http://api", token: "original-token" });
    writeConfig({ currentBook: "new-book" });

    const configPath = getConfigPath();
    const saved = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, string>;

    expect(saved.token).toBe("original-token");
    expect(saved.currentBook).toBe("new-book");
  });

  it("creates parent directory if it does not exist", () => {
    expect(existsSync(join(tmpHome, ".tally"))).toBe(false);
    writeConfig({ apiUrl: "http://api", token: "t" });
    expect(existsSync(join(tmpHome, ".tally"))).toBe(true);
  });
});
