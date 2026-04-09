/**
 * Integration test helpers for tally-cli.
 * Spawns the CLI as a subprocess and captures output/exit code.
 * Requires TALLY_API_URL, TALLY_TOKEN, TALLY_BOOK env vars (or test defaults).
 */
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CLI_ENTRY = resolve(import.meta.dirname, "../../src/index.ts");
const TSX_BIN = resolve(import.meta.dirname, "../../../../node_modules/.bin/tsx");

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CliEnv {
  apiUrl?: string;
  token?: string;
  book?: string;
  /** Override HOME so tally reads/writes config from a temp dir instead of ~/.tally */
  configHome?: string;
}

const DEFAULT_ENV: CliEnv = {
  apiUrl: process.env.TALLY_API_URL ?? "http://127.0.0.1:3000",
  token: process.env.TALLY_TOKEN ?? "dev-token",
  book: process.env.TALLY_BOOK ?? process.env.TEST_BOOK_ID,
};

export async function runCli(args: string[], env: CliEnv = {}): Promise<CliResult> {
  const resolved = { ...DEFAULT_ENV, ...env };

  const childEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    NO_COLOR: "1",
  };

  if (resolved.apiUrl) childEnv.TALLY_API_URL = resolved.apiUrl;
  if (resolved.token) childEnv.TALLY_TOKEN = resolved.token;
  if (resolved.book) childEnv.TALLY_BOOK = resolved.book;
  // Override HOME so config reads/writes go to the temp dir, not ~/.tally
  if (resolved.configHome) childEnv.HOME = resolved.configHome;

  // Remove interactive TTY assumption — integration tests always run non-TTY
  delete childEnv.TERM;
  // Remove book env if explicitly passed as undefined (test wants to verify missing-book error)
  if ("book" in env && env.book === undefined) delete childEnv.TALLY_BOOK;

  try {
    const result = await execFileAsync(TSX_BIN, [CLI_ENTRY, ...args], {
      env: childEnv,
      timeout: 10000,
    });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number | string };
    return {
      exitCode: typeof e.code === "number" ? e.code : 1,
      stderr: e.stderr ?? "",
      stdout: e.stdout ?? "",
    };
  }
}

/**
 * Check that the dev API is reachable before running integration tests.
 * Call this in beforeAll — if it throws, skip the suite cleanly.
 */
export async function requireDevApi(): Promise<void> {
  const url = DEFAULT_ENV.apiUrl ?? "http://localhost:3000";
  try {
    const res = await fetch(`${url}/healthz`);
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  } catch {
    throw new Error(
      `Dev API not reachable at ${url}. Run pnpm dev:api before integration tests.`,
    );
  }
}
