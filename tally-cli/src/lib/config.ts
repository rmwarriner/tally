import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { GlobalOptions, ResolvedConfig } from "./types";

interface RawConfig {
  apiUrl?: unknown;
  currentBook?: unknown;
  token?: unknown;
}

export function getConfigPath(): string {
  return join(homedir(), ".tally", "config.json");
}

function readRawConfig(path: string): RawConfig {
  if (!existsSync(path)) {
    return {};
  }

  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid config file at ${path}: expected a JSON object.`);
  }

  return parsed as RawConfig;
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveConfig(
  options: GlobalOptions,
  requirements: { requireBook?: boolean } = {},
): ResolvedConfig & { currentBook: string } | ResolvedConfig {
  const configPath = getConfigPath();
  const fileConfig = readRawConfig(configPath);

  const apiUrl =
    asOptionalString(options.api) ??
    asOptionalString(process.env.TALLY_API_URL) ??
    asOptionalString(fileConfig.apiUrl);

  const token =
    asOptionalString(options.token) ??
    asOptionalString(process.env.TALLY_TOKEN) ??
    asOptionalString(fileConfig.token);

  const currentBook =
    asOptionalString(options.book) ??
    asOptionalString(process.env.TALLY_BOOK) ??
    asOptionalString(fileConfig.currentBook);

  if (!apiUrl) {
    throw new Error("Missing API URL. Set --api, TALLY_API_URL, or ~/.tally/config.json apiUrl.");
  }

  if (!token) {
    throw new Error("Missing API token. Set --token, TALLY_TOKEN, or ~/.tally/config.json token.");
  }

  if (requirements.requireBook && !currentBook) {
    throw new Error("Missing book ID. Set --book, TALLY_BOOK, or run `tally use <bookId>`.");
  }

  if (currentBook) {
    return {
      apiUrl,
      currentBook,
      token,
    };
  }

  return {
    apiUrl,
    token,
  };
}

export function writeConfig(update: { apiUrl?: string; currentBook?: string; token?: string }): void {
  const configPath = getConfigPath();
  const parent = dirname(configPath);

  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const existing = readRawConfig(configPath);

  const merged = {
    apiUrl: update.apiUrl ?? asOptionalString(existing.apiUrl),
    currentBook: update.currentBook ?? asOptionalString(existing.currentBook),
    token: update.token ?? asOptionalString(existing.token),
  };

  const payload = JSON.stringify(merged, null, 2);
  writeFileSync(configPath, `${payload}\n`, { mode: 0o600 });
  chmodSync(configPath, 0o600);
}
