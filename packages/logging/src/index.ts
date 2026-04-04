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

export function createLogger(options: LoggerOptions): Logger {
  const sink = options.sink ?? ((record: LogRecord) => console.log(JSON.stringify(record)));
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
