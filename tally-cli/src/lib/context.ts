import type { Command } from "commander";
import { ApiClient } from "./api-client";
import { resolveConfig } from "./config";
import { resolveOutputFormat } from "./output";
import type { GlobalOptions, OutputFormat } from "./types";

export interface CommandContext {
  api: ApiClient;
  bookId?: string;
  color: boolean;
  format: OutputFormat;
}

export function getGlobalOptions(command: Command): GlobalOptions {
  const opts = command.optsWithGlobals() as GlobalOptions;
  const color = opts.color ?? !opts.noColor;
  return {
    api: opts.api,
    book: opts.book,
    color,
    format: opts.format,
    noColor: opts.noColor,
    token: opts.token,
  };
}

export function buildContext(
  command: Command,
  requirements: { requireBook?: boolean } = {},
): CommandContext {
  const globalOptions = getGlobalOptions(command);
  const config = resolveConfig(globalOptions, requirements);
  const format = resolveOutputFormat(globalOptions.format, process.stdout.isTTY === true);

  return {
    api: new ApiClient(config.apiUrl, config.token),
    bookId: "currentBook" in config ? config.currentBook : undefined,
    color: globalOptions.color !== false,
    format,
  };
}
