export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  fields: LogFields;
}

export interface Logger {
  child(fields: LogFields): Logger;
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export interface LoggerOptions {
  minLevel?: LogLevel;
  redactKeys?: string[];
  service: string;
  sink?: (record: LogRecord) => void;
}

export type ConsoleLogFormat = "json" | "pretty";

export interface ConsoleSinkOptions {
  format?: ConsoleLogFormat;
}

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const defaultRedactKeys = [
  "password",
  "token",
  "secret",
  "authorization",
  "accountNumber",
  "routingNumber",
];

const STATIC_FIELDS = new Set([
  "dataDirectory",
  "host",
  "persistenceBackend",
  "port",
  "postgresConfigured",
  "runtimeMode",
  "sqlitePath",
  "postgresUrl",
  "service",
]);

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: "DEBUG",
  info: "INFO ",
  warn: "WARN ",
  error: "ERROR",
};

const SEPARATOR = "\u2500".repeat(48);

function redactValue(value: unknown, redactKeys: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, redactKeys));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        redactKeys.has(key) ? "[REDACTED]" : redactValue(entry, redactKeys),
      ]),
    );
  }

  return value;
}

function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
  return levelWeight[level] >= levelWeight[minLevel];
}

function createRecord(
  service: string,
  level: LogLevel,
  message: string,
  fields: LogFields,
  redactKeys: Set<string>,
): LogRecord {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    service,
    fields: redactValue(fields, redactKeys) as LogFields,
  };
}

function serializeFieldValue(value: unknown): string {
  if (typeof value === "string") {
    return value.includes(" ") ? `"${value}"` : value;
  }
  return JSON.stringify(value);
}

function extractTime(timestamp: string): string {
  const match = /T(\d{2}:\d{2}:\d{2})/.exec(timestamp);
  return match?.[1] ?? timestamp;
}

function formatStartupBlock(record: LogRecord): string {
  const date = record.timestamp.slice(0, 10);
  const time = extractTime(record.timestamp);
  const entries = Object.entries(record.fields);
  const maxKeyLen = entries.reduce((max, [k]) => Math.max(max, k.length), 0);
  const fieldLines = entries
    .map(([k, v]) => `  ${k.padEnd(maxKeyLen)}  ${serializeFieldValue(v)}`)
    .join("\n");

  const header = `${date} ${time}  ${record.service}`;
  const body = fieldLines.length > 0
    ? `  ${record.message}\n${fieldLines}`
    : `  ${record.message}`;

  return `${SEPARATOR}\n${header}\n${body}\n${SEPARATOR}`;
}

function formatCompactRecord(record: LogRecord): string {
  const time = extractTime(record.timestamp);
  const level = LEVEL_LABEL[record.level];
  const fields = Object.entries(record.fields)
    .filter(([k]) => !STATIC_FIELDS.has(k))
    .map(([k, v]) => `${k}=${serializeFieldValue(v)}`)
    .join(" ");

  const base = `${time} ${level}  ${record.message}`;
  return fields.length > 0 ? `${base}  ${fields}` : base;
}

export function createConsoleSink(options: ConsoleSinkOptions = {}): (record: LogRecord) => void {
  const format = options.format ?? "json";

  if (format === "pretty") {
    let startupEmitted = false;

    return (record: LogRecord) => {
      if (!startupEmitted) {
        startupEmitted = true;
        console.log(formatStartupBlock(record));
      } else {
        console.log(formatCompactRecord(record));
      }
    };
  }

  return (record: LogRecord) => {
    console.log(JSON.stringify(record));
  };
}

export function createLogger(options: LoggerOptions): Logger {
  const sink = options.sink ?? createConsoleSink({ format: "json" });
  const minLevel = options.minLevel ?? "info";
  const redactKeys = new Set([...(options.redactKeys ?? []), ...defaultRedactKeys]);

  function withContext(boundFields: LogFields): Logger {
    function log(level: LogLevel, message: string, fields: LogFields = {}): void {
      if (!shouldLog(level, minLevel)) {
        return;
      }

      sink(createRecord(options.service, level, message, { ...boundFields, ...fields }, redactKeys));
    }

    return {
      child(fields: LogFields): Logger {
        return withContext({ ...boundFields, ...fields });
      },
      debug(message: string, fields?: LogFields): void {
        log("debug", message, fields);
      },
      info(message: string, fields?: LogFields): void {
        log("info", message, fields);
      },
      warn(message: string, fields?: LogFields): void {
        log("warn", message, fields);
      },
      error(message: string, fields?: LogFields): void {
        log("error", message, fields);
      },
    };
  }

  return withContext({});
}

export function createNoopLogger(): Logger {
  const logger: Logger = {
    child(): Logger {
      return logger;
    },
    debug(): void {},
    info(): void {},
    warn(): void {},
    error(): void {},
  };

  return logger;
}
