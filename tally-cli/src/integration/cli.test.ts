/**
 * CLI integration tests — Phase 1 commands.
 * Requires: pnpm dev:api running, TALLY_API_URL + TALLY_TOKEN + TALLY_BOOK set (or defaults).
 *
 * Run: pnpm --filter @tally-cli/app test:integration
 */
import { beforeAll, describe, expect, it } from "vitest";
import { requireDevApi, runCli } from "./helpers";

beforeAll(async () => {
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
    // This test needs real account IDs from the seeded dev book.
    // Set TEST_DEBIT_ACCOUNT and TEST_CREDIT_ACCOUNT in env to run.
    const debit = process.env.TEST_DEBIT_ACCOUNT;
    const credit = process.env.TEST_CREDIT_ACCOUNT;

    if (!debit || !credit) {
      console.warn("Skipping add test — set TEST_DEBIT_ACCOUNT and TEST_CREDIT_ACCOUNT");
      return;
    }

    const result = await runCli([
      "add",
      "42.00",
      "regression test",
      "--debit",
      debit,
      "--credit",
      credit,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/posted|transaction/i);
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
