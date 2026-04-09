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
const TSX_BIN = resolve(import.meta.dirname, "../../../node_modules/.bin/tsx");

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
  apiUrl: process.env.TALLY_API_URL ?? "http://127.0.0.1:4000",
  token: process.env.TALLY_TOKEN,
  book: process.env.TALLY_BOOK ?? process.env.TEST_BOOK_ID,
};

let resolvedDefaults: CliEnv = { ...DEFAULT_ENV };

function candidateApiUrls(): string[] {
  const urls = [
    process.env.TALLY_API_URL,
    "http://127.0.0.1:4000",
    "http://localhost:3000",
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  return [...new Set(urls)];
}

function candidateTokens(): Array<string | undefined> {
  const values = [
    process.env.TALLY_TOKEN,
    process.env.TALLY_API_AUTH_TOKEN,
    "top-secret",
    "dev-token",
    undefined,
  ];
  const deduped = new Set<string>();
  const ordered: Array<string | undefined> = [];
  for (const value of values) {
    if (value === undefined) {
      ordered.push(undefined);
      continue;
    }
    if (!deduped.has(value)) {
      deduped.add(value);
      ordered.push(value);
    }
  }
  return ordered;
}

function withAuthHeaders(token: string | undefined): HeadersInit {
  const headers = new Headers();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return headers;
}

export function getResolvedDefaults(): CliEnv {
  return { ...resolvedDefaults };
}

export async function runCli(args: string[], env: CliEnv = {}): Promise<CliResult> {
  const resolved = { ...resolvedDefaults, ...env };

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
  let chosenApiUrl: string | undefined;
  for (const url of candidateApiUrls()) {
    try {
      const res = await fetch(`${url}/healthz`);
      if (res.ok) {
        chosenApiUrl = url;
        break;
      }
    } catch {
      // Try next URL candidate.
    }
  }

  if (!chosenApiUrl) {
    throw new Error(
      "Dev API not reachable. Set TALLY_API_URL and run pnpm dev:api before integration tests.",
    );
  }

  let chosenToken: string | undefined;
  let chosenBook: string | undefined;

  for (const token of candidateTokens()) {
    try {
      const res = await fetch(`${chosenApiUrl}/api/books`, {
        headers: withAuthHeaders(token),
      });
      if (!res.ok) {
        continue;
      }

      const body = (await res.json()) as {
        books?: Array<{ id: string }>;
      };
      const firstBook = body.books?.[0]?.id;
      if (firstBook) {
        chosenToken = token;
        chosenBook = process.env.TALLY_BOOK ?? process.env.TEST_BOOK_ID ?? firstBook;
        break;
      }
    } catch {
      // Continue probing candidates.
    }
  }

  if (!chosenToken || !chosenBook) {
    throw new Error(
      "Could not resolve a valid auth token/book for integration tests. Set TALLY_TOKEN and TALLY_BOOK explicitly.",
    );
  }

  resolvedDefaults = {
    apiUrl: chosenApiUrl,
    book: chosenBook,
    token: chosenToken,
  };
}
