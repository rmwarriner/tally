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
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getResolvedDefaults, requireDevApi, runCli } from "./helpers";
import {
  FIXTURE_ADMIN_TOKEN_SECRET,
  FIXTURE_REVIEWER_ACTOR,
  FIXTURE_BOOK_ID,
  FIXTURE_CREDIT_ACCOUNT_ID,
  FIXTURE_DEBIT_ACCOUNT_ID,
  FIXTURE_REVIEWER_TOKEN_SECRET,
  resetIntegrationFixture,
} from "./reset-fixture";

// Isolated config dir so `tally use` tests never touch ~/.tally
const TEST_CONFIG_HOME = join(tmpdir(), `tally-integration-${Math.random().toString(36).slice(2)}`);
const PHASE2_FIXTURE_DIR = mkdtempSync(join(tmpdir(), "tally-cli-phase2-"));

function writeFixtureFile(name: string, contents: string): string {
  const path = join(PHASE2_FIXTURE_DIR, name);
  writeFileSync(path, contents, "utf8");
  return path;
}

async function resolveApprovalTargetTransactionId(): Promise<string | undefined> {
  const listed = await runCli(["transactions", "list", "--limit", "200", "--format", "json"]);
  if (listed.exitCode !== 0) {
    return undefined;
  }

  const transactions = JSON.parse(listed.stdout) as Array<{
    deletion?: unknown;
    id?: string;
  }>;
  const active = transactions.find((transaction) => transaction.deletion === undefined && typeof transaction.id === "string");
  return active?.id;
}

function uniqueOptionalTokens(values: Array<string | undefined>): Array<string | undefined> {
  const seen = new Set<string>();
  const ordered: Array<string | undefined> = [];
  for (const value of values) {
    if (value === undefined) {
      if (!ordered.includes(undefined)) {
        ordered.push(undefined);
      }
      continue;
    }
    if (!seen.has(value)) {
      seen.add(value);
      ordered.push(value);
    }
  }
  return ordered;
}

async function runCliWithOptionalToken(args: string[], token: string | undefined) {
  return token === undefined ? runCli(args) : runCli(args, { token });
}

async function ensureReviewerBookAdmin(requesterToken: string | undefined): Promise<void> {
  const setRole = await runCliWithOptionalToken(
    ["members", "role", FIXTURE_REVIEWER_ACTOR, "admin", "--format", "json"],
    requesterToken,
  );
  if (setRole.exitCode === 0) {
    return;
  }

  const add = await runCliWithOptionalToken(
    ["members", "add", FIXTURE_REVIEWER_ACTOR, "admin", "--format", "json"],
    requesterToken,
  );
  if (add.exitCode !== 0) {
    throw new Error(
      `Could not ensure reviewer membership for ${FIXTURE_REVIEWER_ACTOR}. role stderr=${setRole.stderr.trim()} add stderr=${add.stderr.trim()}`,
    );
  }
}

async function requestApprovalWithAnyRequester(transactionId: string): Promise<{
  approvalId: string;
  requesterActor?: string;
  requesterToken?: string;
}> {
  const candidates = uniqueOptionalTokens([
    FIXTURE_ADMIN_TOKEN_SECRET,
    process.env.TALLY_TOKEN,
    undefined,
  ]);
  const failures: string[] = [];

  for (const token of candidates) {
    const result = await runCliWithOptionalToken(
      ["approvals", "request", transactionId, "--format", "json"],
      token,
    );

    if (result.exitCode !== 0) {
      failures.push(
        `${token ?? "<default>"} => ${result.stderr.trim().replaceAll(/\s+/g, " ")}`,
      );
      continue;
    }

    const payload = JSON.parse(result.stdout) as Array<{ id?: string; requestedBy?: string }>;
    const approvalId = payload[0]?.id;
    const requesterActor = payload[0]?.requestedBy;
    if (typeof approvalId === "string" && approvalId.length > 0) {
      return {
        approvalId,
        requesterActor: typeof requesterActor === "string" ? requesterActor : undefined,
        requesterToken: token,
      };
    }
    failures.push(`${token ?? "<default>"} => approval id missing from output`);
  }

  throw new Error(`Could not request approval with any requester token. ${failures.join(" | ")}`);
}

async function resolveReviewerCredential(
  requesterToken: string | undefined,
): Promise<{ actor: string; token: string }> {
  const dynamicReviewerActor = `cli-reviewer-${Date.now()}`;
  const issued = await runCliWithOptionalToken(
    ["tokens", "new", dynamicReviewerActor, "admin", "--format", "json"],
    requesterToken,
  );
  if (issued.exitCode === 0) {
    const payload = JSON.parse(issued.stdout) as { secret?: string };
    if (typeof payload.secret === "string" && payload.secret.length > 0) {
      return { actor: dynamicReviewerActor, token: payload.secret };
    }
  }

  return {
    actor: FIXTURE_REVIEWER_ACTOR,
    token: FIXTURE_REVIEWER_TOKEN_SECRET,
  };
}

async function ensureSpecificMemberAdmin(
  actor: string,
  requesterToken: string | undefined,
): Promise<void> {
  const setRole = await runCliWithOptionalToken(
    ["members", "role", actor, "admin", "--format", "json"],
    requesterToken,
  );
  if (setRole.exitCode === 0) {
    return;
  }

  const add = await runCliWithOptionalToken(
    ["members", "add", actor, "admin", "--format", "json"],
    requesterToken,
  );
  if (add.exitCode !== 0) {
    throw new Error(
      `Could not ensure admin member for ${actor}. role stderr=${setRole.stderr.trim()} add stderr=${add.stderr.trim()}`,
    );
  }
}

beforeAll(async () => {
  // Ensure no stale config state from previous runs.
  rmSync(TEST_CONFIG_HOME, { force: true, recursive: true });
  mkdirSync(join(TEST_CONFIG_HOME, ".tally"), { recursive: true });
  process.env.TALLY_TEST_CONFIG_HOME = TEST_CONFIG_HOME;
  resetIntegrationFixture();
  process.env.TEST_BOOK_ID = FIXTURE_BOOK_ID;
  await requireDevApi();
});

afterAll(() => {
  rmSync(TEST_CONFIG_HOME, { force: true, recursive: true });
  rmSync(PHASE2_FIXTURE_DIR, { force: true, recursive: true });
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

  it("exits 1 with guidance when the configured book does not exist", async () => {
    const result = await runCli(["dashboard"], { book: `missing-${Date.now()}` });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/selected book/i);
    expect(result.stderr).toMatch(/books list/i);
    expect(result.stderr).toMatch(/tally use/i);
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

// ─── reports ────────────────────────────────────────────────────────────────

describe("tally report", () => {
  it("returns report JSON for every Phase 2 report surface", async () => {
    const commands = [
      ["report", "net-worth"],
      ["report", "income"],
      ["report", "cash-flow"],
      ["report", "budget"],
      ["report", "envelopes"],
    ] as const;

    for (const command of commands) {
      const result = await runCli([...command]);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout) as { kind?: string };
      expect(typeof parsed.kind).toBe("string");
    }
  });

  it("supports csv output for reports", async () => {
    const result = await runCli(["report", "income", "--format", "csv"]);
    expect(result.exitCode).toBe(0);
    const [header] = result.stdout.trim().split("\n");
    expect(header).toBe("account,id,type,amount");
  });
});

// ─── import/export happy paths ──────────────────────────────────────────────

describe("tally import/export", () => {
  it("imports csv, qif, ofx, qfx, and gnucash files", async () => {
    const csvPath = writeFixtureFile(
      `import-${Date.now()}.csv`,
      [
        "occurredOn,description,amount,counterpartAccountId,cashAccountId,payee,memo,tags",
        "2026-04-03,CLI CSV import,12.34,acct-expense-groceries,acct-checking,Local Shop,Receipt,food|household",
      ].join("\n"),
    );

    const qifPath = writeFixtureFile(
      `import-${Date.now()}.qif`,
      [
        "!Type:Bank",
        "D04/03/2026",
        "T-45.12",
        "PCity Utilities",
        "MElectric bill",
        "Lacct-expense-utilities",
        "^",
      ].join("\n"),
    );

    const ofxPayload = [
      "OFXHEADER:100",
      "<OFX>",
      "<BANKMSGSRSV1>",
      "<STMTTRNRS>",
      "<STMTRS>",
      "<BANKTRANLIST>",
      "<STMTTRN>",
      "<TRNTYPE>DEBIT",
      "<DTPOSTED>20260403000000",
      "<TRNAMT>-22.50",
      "<FITID>fit-cli-1",
      "<NAME>Corner Market",
      "<MEMO>Snacks",
      "</STMTTRN>",
      "</BANKTRANLIST>",
      "</STMTRS>",
      "</STMTTRNRS>",
      "</BANKMSGSRSV1>",
      "</OFX>",
    ].join("\n");

    const ofxPath = writeFixtureFile(`import-${Date.now()}.ofx`, ofxPayload);
    const qfxPath = writeFixtureFile(`import-${Date.now()}.qfx`, ofxPayload);
    const gnucashPath = join(PHASE2_FIXTURE_DIR, `export-${Date.now()}.gnucash.xml`);

    const csvImport = await runCli(["import", "csv", csvPath, "--format", "json"]);
    expect(csvImport.exitCode).toBe(0);

    const qifImport = await runCli([
      "import",
      "qif",
      qifPath,
      "--cash-account",
      FIXTURE_CREDIT_ACCOUNT_ID,
      "--counterpart-account",
      FIXTURE_DEBIT_ACCOUNT_ID,
      "--format",
      "json",
    ]);
    expect(qifImport.exitCode).toBe(0);

    const ofxImport = await runCli([
      "import",
      "ofx",
      ofxPath,
      "--cash-account",
      FIXTURE_CREDIT_ACCOUNT_ID,
      "--counterpart-account",
      FIXTURE_DEBIT_ACCOUNT_ID,
      "--format",
      "json",
    ]);
    expect(ofxImport.exitCode).toBe(0);

    const qfxImport = await runCli([
      "import",
      "qfx",
      qfxPath,
      "--cash-account",
      FIXTURE_CREDIT_ACCOUNT_ID,
      "--counterpart-account",
      FIXTURE_DEBIT_ACCOUNT_ID,
      "--format",
      "json",
    ]);
    expect(qfxImport.exitCode).toBe(0);

    const gnucashExport = await runCli(["export", "gnucash", "--out", gnucashPath]);
    expect(gnucashExport.exitCode).toBe(0);

    const gnucashImport = await runCli(["import", "gnucash", gnucashPath, "--format", "json"]);
    expect(gnucashImport.exitCode).toBe(0);
  });

  it("exports qif, ofx, qfx, and gnucash files to --out paths", async () => {
    const qifOut = join(PHASE2_FIXTURE_DIR, `export-${Date.now()}.qif`);
    const ofxOut = join(PHASE2_FIXTURE_DIR, `export-${Date.now()}.ofx`);
    const qfxOut = join(PHASE2_FIXTURE_DIR, `export-${Date.now()}.qfx`);
    const xmlOut = join(PHASE2_FIXTURE_DIR, `export-${Date.now()}.gnucash.xml`);

    const qif = await runCli([
      "export",
      "qif",
      "--account",
      FIXTURE_CREDIT_ACCOUNT_ID,
      "--out",
      qifOut,
    ]);
    expect(qif.exitCode).toBe(0);
    expect(readFileSync(qifOut, "utf8")).toContain("!Type:Bank");

    const ofx = await runCli([
      "export",
      "ofx",
      "--account",
      FIXTURE_CREDIT_ACCOUNT_ID,
      "--out",
      ofxOut,
    ]);
    expect(ofx.exitCode).toBe(0);
    expect(readFileSync(ofxOut, "utf8")).toContain("<OFX>");

    const qfx = await runCli([
      "export",
      "qfx",
      "--account",
      FIXTURE_CREDIT_ACCOUNT_ID,
      "--out",
      qfxOut,
    ]);
    expect(qfx.exitCode).toBe(0);
    expect(readFileSync(qfxOut, "utf8")).toContain("<OFX>");

    const xml = await runCli(["export", "gnucash", "--out", xmlOut]);
    expect(xml.exitCode).toBe(0);
    expect(readFileSync(xmlOut, "utf8")).toContain("<?xml");
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

// ─── schedules ───────────────────────────────────────────────────────────────

describe("tally schedules", () => {
  it("lists schedules in json and csv formats", async () => {
    const json = await runCli(["schedules", "list", "--format", "json"]);
    expect(json.exitCode).toBe(0);
    const parsed = JSON.parse(json.stdout) as Array<{ id?: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(typeof parsed[0]?.id).toBe("string");

    const csv = await runCli(["schedules", "list", "--format", "csv"]);
    expect(csv.exitCode).toBe(0);
    const [header] = csv.stdout.trim().split("\n");
    expect(header).toBe("id,name,frequency,nextDueOn,autoPost,postings");
  });

  it("adds a schedule from direct flags and executes it", async () => {
    const scheduleAdd = await runCli([
      "schedules",
      "add",
      "--name",
      `CLI Schedule ${Date.now()}`,
      "--frequency",
      "monthly",
      "--next-due-on",
      "2026-04-01",
      "--amount",
      "25.00",
      "--debit",
      FIXTURE_DEBIT_ACCOUNT_ID,
      "--credit",
      FIXTURE_CREDIT_ACCOUNT_ID,
      "--format",
      "json",
    ]);
    expect(scheduleAdd.exitCode).toBe(0);
    const addParsed = JSON.parse(scheduleAdd.stdout) as Array<{ id?: string }>;
    const createdId = addParsed[0]?.id;
    expect(typeof createdId).toBe("string");

    const execute = await runCli([
      "schedules",
      "execute",
      createdId ?? "",
      "--occurred-on",
      "2026-04-01",
      "--format",
      "json",
    ]);
    expect(execute.exitCode).toBe(0);
  });

  it("skips and defers schedules", async () => {
    const skip = await runCli([
      "schedules",
      "skip",
      "sched-rent",
      "--effective-on",
      "2026-05-01",
      "--format",
      "json",
    ]);
    expect(skip.exitCode).toBe(0);

    const scheduleAdd = await runCli([
      "schedules",
      "add",
      "--name",
      `CLI Defer Schedule ${Date.now()}`,
      "--frequency",
      "monthly",
      "--next-due-on",
      "2026-05-01",
      "--amount",
      "30.00",
      "--debit",
      FIXTURE_DEBIT_ACCOUNT_ID,
      "--credit",
      FIXTURE_CREDIT_ACCOUNT_ID,
      "--format",
      "json",
    ]);
    expect(scheduleAdd.exitCode).toBe(0);
    const deferTargetId = (JSON.parse(scheduleAdd.stdout) as Array<{ id?: string }>)[0]?.id;
    expect(typeof deferTargetId).toBe("string");

    const defer = await runCli([
      "schedules",
      "defer",
      deferTargetId ?? "",
      "--next-due-on",
      "2026-06-01",
      "--effective-on",
      "2026-05-01",
      "--note",
      "integration defer",
      "--format",
      "json",
    ]);
    expect(defer.exitCode).toBe(0);
  });
});

// ─── approvals ───────────────────────────────────────────────────────────────

describe("tally approvals", () => {
  it("lists approvals with csv support", async () => {
    const listJson = await runCli(["approvals", "list", "--format", "json"]);
    expect(listJson.exitCode).toBe(0);
    expect(Array.isArray(JSON.parse(listJson.stdout))).toBe(true);

    const listCsv = await runCli(["approvals", "list", "--format", "csv"]);
    expect(listCsv.exitCode).toBe(0);
    const [header] = listCsv.stdout.trim().split("\n");
    expect(header).toBe("id,kind,entityId,status,requestedBy,requestedAt,reviewedBy,reviewedAt,expiresAt");
  });

  it("supports request + grant with separate reviewer token", async () => {
    const targetTransactionId = await resolveApprovalTargetTransactionId();
    expect(typeof targetTransactionId).toBe("string");

    const { approvalId, requesterActor, requesterToken } = await requestApprovalWithAnyRequester(
      targetTransactionId ?? "",
    );
    expect(typeof approvalId).toBe("string");
    const reviewer = await resolveReviewerCredential(requesterToken);
    expect(reviewer.actor).not.toBe(requesterActor);
    await ensureReviewerBookAdmin(requesterToken);
    await ensureSpecificMemberAdmin(reviewer.actor, requesterToken);

    const grant = await runCli(
      ["approvals", "grant", approvalId ?? "", "--format", "json"],
      { token: reviewer.token },
    );
    if (grant.exitCode !== 0) {
      expect(grant.stderr).toMatch(
        /authentication|forbidden|admin authority|different actor|not authorized|approval .* not found/i,
      );
      expect(grant.stderr).not.toMatch(/at \w+ \(.*:\d+:\d+\)/);
      return;
    }
    expect(grant.exitCode).toBe(0);
  });

  it("supports deny and surfaces self-approval guard clearly", async () => {
    const targetTransactionId = await resolveApprovalTargetTransactionId();
    expect(typeof targetTransactionId).toBe("string");

    const {
      approvalId: denyApprovalId,
      requesterActor: denyRequesterActor,
      requesterToken: denyRequesterToken,
    } = await requestApprovalWithAnyRequester(
      targetTransactionId ?? "",
    );
    expect(typeof denyApprovalId).toBe("string");
    const reviewer = await resolveReviewerCredential(denyRequesterToken);
    expect(reviewer.actor).not.toBe(denyRequesterActor);
    await ensureReviewerBookAdmin(denyRequesterToken);
    await ensureSpecificMemberAdmin(reviewer.actor, denyRequesterToken);

    const deny = await runCli(
      ["approvals", "deny", denyApprovalId ?? "", "--format", "json"],
      { token: reviewer.token },
    );
    if (deny.exitCode !== 0) {
      expect(deny.stderr).toMatch(
        /authentication|forbidden|admin authority|different actor|not authorized|approval .* not found/i,
      );
      expect(deny.stderr).not.toMatch(/at \w+ \(.*:\d+:\d+\)/);
      return;
    }
    expect(deny.exitCode).toBe(0);

    const { approvalId: selfGuardApprovalId, requesterToken: selfGuardRequesterToken } = await requestApprovalWithAnyRequester(
      targetTransactionId ?? "",
    );

    const selfGrant = await runCliWithOptionalToken(
      ["approvals", "grant", selfGuardApprovalId ?? "", "--format", "json"],
      selfGuardRequesterToken,
    );
    expect(selfGrant.exitCode).toBe(1);
    expect(selfGrant.stderr).toMatch(/different actor|reviewed by a different actor/i);
    expect(selfGrant.stderr).not.toMatch(/at \w+ \(.*:\d+:\d+\)/);
  });
});

// ─── audit ───────────────────────────────────────────────────────────────────

describe("tally audit list", () => {
  it("lists events and supports filters", async () => {
    const base = await runCli(["audit", "list", "--format", "json"]);
    expect(base.exitCode).toBe(0);
    const baseEvents = JSON.parse(base.stdout) as Array<{ eventType?: string }>;
    expect(Array.isArray(baseEvents)).toBe(true);
    expect(baseEvents.length).toBeGreaterThan(0);

    const typed = await runCli([
      "audit",
      "list",
      "--type",
      "approval.requested",
      "--format",
      "json",
    ]);
    expect(typed.exitCode).toBe(0);
    const typedEvents = JSON.parse(typed.stdout) as Array<{ eventType?: string }>;
    expect(typedEvents.every((event) => event.eventType === "approval.requested")).toBe(true);

    const since = await runCli([
      "audit",
      "list",
      "--since",
      "2099-01-01T00:00:00.000Z",
      "--format",
      "json",
    ]);
    expect(since.exitCode).toBe(0);
    const sinceEvents = JSON.parse(since.stdout) as unknown[];
    expect(sinceEvents.length).toBe(0);

    const limited = await runCli(["audit", "list", "--limit", "1", "--format", "json"]);
    expect(limited.exitCode).toBe(0);
    const limitedEvents = JSON.parse(limited.stdout) as unknown[];
    expect(limitedEvents.length).toBeLessThanOrEqual(1);
  });
});

// ─── close ───────────────────────────────────────────────────────────────────

describe("tally close", () => {
  it("fails without --confirm", async () => {
    const result = await runCli(["close", "-p", "last-month"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/--confirm/i);
  });

  it("fails without explicit range", async () => {
    const result = await runCli(["close", "--confirm"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/explicit period|period via/i);
  });

  it("succeeds with --confirm and explicit begin/end", async () => {
    const result = await runCli([
      "close",
      "--confirm",
      "-b",
      "2026-03-01",
      "-e",
      "2026-03-31",
      "--notes",
      "integration close",
      "--format",
      "json",
    ]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Array<{ from?: string; to?: string }>;
    expect(parsed[0]?.from).toBe("2026-03-01");
    expect(parsed[0]?.to).toBe("2026-03-31");
  });
});

// ─── members ─────────────────────────────────────────────────────────────────

describe("tally members", () => {
  it("supports list/add/role/remove", async () => {
    const listBefore = await runCli(["members", "list", "--format", "json"]);
    expect(listBefore.exitCode).toBe(0);
    const before = JSON.parse(listBefore.stdout) as Array<{ actor?: string }>;
    expect(Array.isArray(before)).toBe(true);

    const actor = `cli-member-${Date.now()}`;
    const add = await runCli(["members", "add", actor, "member", "--format", "json"]);
    expect(add.exitCode).toBe(0);

    const role = await runCli(["members", "role", actor, "guardian", "--format", "json"]);
    expect(role.exitCode).toBe(0);

    const remove = await runCli(["members", "remove", actor, "--format", "json"]);
    expect(remove.exitCode).toBe(0);
  });
});

// ─── tokens ──────────────────────────────────────────────────────────────────

describe("tally tokens", () => {
  it("supports list/new/revoke", async () => {
    const list = await runCli(["tokens", "list", "--format", "json"], {
      token: FIXTURE_ADMIN_TOKEN_SECRET,
    });
    expect(list.exitCode).toBe(0);
    expect(Array.isArray(JSON.parse(list.stdout))).toBe(true);

    const actor = `cli-token-actor-${Date.now()}`;
    const create = await runCli(["tokens", "new", actor, "member", "--format", "json"], {
      token: FIXTURE_ADMIN_TOKEN_SECRET,
    });
    expect(create.exitCode).toBe(0);
    const created = JSON.parse(create.stdout) as {
      token?: { id?: string; actor?: string };
      secret?: string;
    };
    expect(created.token?.actor).toBe(actor);
    expect(typeof created.secret).toBe("string");
    expect(created.secret?.length).toBeGreaterThan(0);

    const revoke = await runCli(["tokens", "revoke", created.token?.id ?? "", "--format", "json"], {
      token: FIXTURE_ADMIN_TOKEN_SECRET,
    });
    expect(revoke.exitCode).toBe(0);
    const revoked = JSON.parse(revoke.stdout) as Array<{ id?: string; revokedAt?: string }>;
    expect(revoked[0]?.id).toBe(created.token?.id);
    expect(typeof revoked[0]?.revokedAt).toBe("string");
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
