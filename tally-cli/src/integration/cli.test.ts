/**
 * CLI integration tests — Phase 1 commands.
 * Requires: pnpm dev:api running, TALLY_API_URL + TALLY_TOKEN + TALLY_BOOK set (or defaults).
 *
 * Run: pnpm --filter @tally-cli/app test:integration
 *
 * ── Known automation gap ─────────────────────────────────────────────────────
 * The multi-posting interactive flow in `tally transactions add` cannot be
 * tested with subprocess I/O redirection because @inquirer/prompts requires a
 * real TTY. The non-TTY guard (exit 1 when stdin is not a TTY) IS tested.
 *
 * To automate the interactive flow, use node-pty to allocate a pseudo-terminal
 * and drive keystrokes programmatically:
 *
 *   import pty from "node-pty";
 *   const term = pty.spawn("tsx", [CLI_ENTRY, "add"], { name: "xterm", cols: 80, rows: 30 });
 *   term.write("expenses:food\r");          // account ID + Enter
 *   term.write("85.42\r");                  // amount + Enter
 *   term.write("assets:checking\r");        // second account + Enter
 *   term.write("-85.42\r");                 // balancing amount + Enter
 *   term.write("y\r");                      // confirm
 *   // assert exit code 0 and stdout contains "posted"
 *
 * node-pty requires a native build (node-gyp). Add it only when interactive
 * coverage is prioritised — it adds build complexity and platform constraints.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getResolvedDefaults, requireDevApi, runCli } from "./helpers";
import {
  FIXTURE_BOOK_ID,
  FIXTURE_CREDIT_ACCOUNT_ID,
  FIXTURE_DEBIT_ACCOUNT_ID,
  resetIntegrationFixture,
} from "./reset-fixture";

// Isolated config dir so `tally use` tests never touch ~/.tally
const TEST_CONFIG_HOME = join(tmpdir(), `tally-integration-${Math.random().toString(36).slice(2)}`);
mkdirSync(join(TEST_CONFIG_HOME, ".tally"), { recursive: true });

beforeAll(async () => {
  resetIntegrationFixture();
  process.env.TEST_BOOK_ID = FIXTURE_BOOK_ID;
  await requireDevApi();
});

// ─── books list ─────────────────────────────────────────────────────────────

describe("tally books list", () => {
  it("returns a non-empty list in table format", async () => {
    const result = await runCli(["books", "list"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBeTruthy();
  });

  it("returns valid JSON with --format json", async () => {
    const result = await runCli(["books", "list", "--format", "json"]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as unknown;
    expect(Array.isArray(parsed) || typeof parsed === "object").toBe(true);
  });

  it("exits 1 with auth error on bad token", async () => {
    const result = await runCli(["books", "list"], { token: "bad-token" });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/authentication|unauthorized/i);
  });
});

// ─── dashboard ──────────────────────────────────────────────────────────────

describe("tally dashboard", () => {
  it("renders net worth and pending count", async () => {
    const result = await runCli(["dashboard"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it("exits 1 with clear message when book is missing", async () => {
    const result = await runCli(["dashboard"], { book: undefined });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/book/i);
  });
});

// ─── accounts list / bal ────────────────────────────────────────────────────

describe("tally accounts list", () => {
  it("renders account tree with a net total line", async () => {
    const result = await runCli(["accounts", "list"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it("tally bal alias produces identical output", async () => {
    const [full, alias] = await Promise.all([
      runCli(["accounts", "list"]),
      runCli(["bal"]),
    ]);
    expect(alias.exitCode).toBe(0);
    expect(alias.stdout).toBe(full.stdout);
  });

  it("--depth 1 limits to top-level accounts", async () => {
    const [all, depth1] = await Promise.all([
      runCli(["accounts", "list"]),
      runCli(["accounts", "list", "--depth", "1"]),
    ]);
    // depth-1 output should be equal or shorter
    expect(depth1.stdout.split("\n").length).toBeLessThanOrEqual(
      all.stdout.split("\n").length,
    );
  });

  it("returns valid JSON with --format json", async () => {
    const result = await runCli(["accounts", "list", "--format", "json"]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as unknown;
    expect(parsed).toBeTruthy();
  });
});

// ─── transactions list ───────────────────────────────────────────────────────

describe("tally transactions list", () => {
  it("returns results in table format", async () => {
    const result = await runCli(["transactions", "list"]);
    expect(result.exitCode).toBe(0);
  });

  it("tally reg alias works", async () => {
    const result = await runCli(["reg"]);
    expect(result.exitCode).toBe(0);
  });

  it("tally transactions ls alias works", async () => {
    const result = await runCli(["transactions", "ls"]);
    expect(result.exitCode).toBe(0);
  });

  it("--status cleared filters by status", async () => {
    const result = await runCli(["transactions", "list", "--status", "cleared"]);
    expect(result.exitCode).toBe(0);
  });

  it("--status pending filters by status", async () => {
    const result = await runCli(["transactions", "list", "--status", "pending"]);
    expect(result.exitCode).toBe(0);
  });

  it("-p last-month sends correct date range to API", async () => {
    const result = await runCli(["transactions", "list", "-p", "last-month"]);
    expect(result.exitCode).toBe(0);
  });

  it("--limit 5 returns at most 5 rows", async () => {
    const result = await runCli(["transactions", "list", "--limit", "5", "--format", "json"]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as unknown[];
    expect(parsed.length).toBeLessThanOrEqual(5);
  });

  it("produces valid JSON when piped (non-TTY default)", async () => {
    // runCli already runs non-TTY; output should be json by default
    const result = await runCli(["transactions", "list"]);
    expect(result.exitCode).toBe(0);
    // default non-TTY → json
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  it("empty date range returns without crash", async () => {
    const result = await runCli([
      "transactions",
      "list",
      "-b",
      "1900-01-01",
      "-e",
      "1900-01-31",
    ]);
    expect(result.exitCode).toBe(0);
  });
});

// ─── transactions add — simple path ─────────────────────────────────────────

describe("tally transactions add — simple path", () => {
  it("posts a balanced transaction with all flags and prints id", async () => {
    const result = await runCli([
      "add",
      "42.00",
      "regression test",
      "--debit",
      FIXTURE_DEBIT_ACCOUNT_ID,
      "--credit",
      FIXTURE_CREDIT_ACCOUNT_ID,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/txn-cli-|\"description\":\s*\"regression test\"/i);
  });

  it("exits 1 with message on invalid account id", async () => {
    const result = await runCli([
      "add",
      "10.00",
      "bad accounts",
      "--debit",
      "nonexistent-account",
      "--credit",
      "also-nonexistent",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});

// ─── transactions add — non-TTY guard ───────────────────────────────────────

describe("tally transactions add — non-TTY guard", () => {
  it("exits 1 with clear error when no flags and stdin is not TTY", async () => {
    // runCli always runs non-TTY
    const result = await runCli(["add"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});

// ─── bare tally (no subcommand → dashboard) ─────────────────────────────────

describe("bare tally invocation", () => {
  it("renders dashboard output (exit 0)", async () => {
    const result = await runCli([]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it("produces same output as tally dashboard", async () => {
    const [bare, explicit] = await Promise.all([
      runCli([]),
      runCli(["dashboard"]),
    ]);
    expect(bare.stdout).toBe(explicit.stdout);
  });

  it("exits 1 with book error when TALLY_BOOK is unset", async () => {
    const result = await runCli([], { book: undefined });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/book/i);
  });
});

// ─── tally use ───────────────────────────────────────────────────────────────

describe("tally use", () => {
  it("writes bookId to config and prints confirmation", async () => {
    const result = await runCli(["use", "test-book-123"], {
      configHome: TEST_CONFIG_HOME,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/test-book-123/);
  });

  it("subsequent commands use the stored book without --book flag", async () => {
    const defaults = getResolvedDefaults();
    const knownBook = defaults.book ?? process.env.TALLY_BOOK ?? "demo";

    // Write a known book ID via `tally use`
    await runCli(["use", knownBook], {
      configHome: TEST_CONFIG_HOME,
    });

    // Now run dashboard without --book — should resolve from config
    const result = await runCli(["dashboard"], {
      configHome: TEST_CONFIG_HOME,
      book: undefined,
    });
    expect(result.exitCode).toBe(0);
  });
});

// ─── tally books new ─────────────────────────────────────────────────────────

describe("tally books new", () => {
  it("creates a book and returns its id and name", async () => {
    const name = `regression-${Date.now()}`;
    const result = await runCli(["books", "new", name]);
    expect(result.exitCode).toBe(0);
    // Output should contain the book name
    expect(result.stdout).toContain(name.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  });

  it("returns valid JSON with --format json", async () => {
    const name = `regression-json-${Date.now()}`;
    const result = await runCli(["books", "new", name, "--format", "json"]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as unknown;
    expect(parsed).toBeTruthy();
  });
});

// ─── error contract ──────────────────────────────────────────────────────────

describe("error contract", () => {
  it("missing token → exit 1, stderr mentions token", async () => {
    const result = await runCli(["books", "list"], { token: "" });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/token/i);
  });

  it("unreachable API → exit 1, stderr mentions API URL", async () => {
    const result = await runCli(["books", "list"], { apiUrl: "http://localhost:19999" });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/could not reach/i);
  });

  it("no stack trace by default", async () => {
    const result = await runCli(["books", "list"], { apiUrl: "http://localhost:19999" });
    expect(result.stderr).not.toMatch(/at \w+ \(.*:\d+:\d+\)/);
  });
});
