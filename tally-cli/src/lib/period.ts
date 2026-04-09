import type { DateRange, DateRangeOptions } from "./types";

const weekdayNames = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatIsoDate(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function atLocalMidday(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
}

function monthStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
}

function quarterStart(now: Date): Date {
  const quarter = Math.floor(now.getMonth() / 3);
  return new Date(now.getFullYear(), quarter * 3, 1, 12, 0, 0, 0);
}

function quarterRangeFor(year: number, quarterIndex: number): DateRange {
  const start = new Date(year, quarterIndex * 3, 1, 12, 0, 0, 0);
  const end = new Date(year, quarterIndex * 3 + 3, 0, 12, 0, 0, 0);
  return { from: formatIsoDate(start), to: formatIsoDate(end) };
}

function parseRelativePhrase(raw: string, now: Date): Date | undefined {
  const value = raw.trim().toLowerCase();

  if (value === "today") {
    return atLocalMidday(now);
  }

  if (value === "yesterday") {
    const date = atLocalMidday(now);
    date.setDate(date.getDate() - 1);
    return date;
  }

  if (value === "tomorrow") {
    const date = atLocalMidday(now);
    date.setDate(date.getDate() + 1);
    return date;
  }

  const daysAgoMatch = value.match(/^(\d+)\s+days?\s+ago$/);
  if (daysAgoMatch) {
    const days = Number.parseInt(daysAgoMatch[1] ?? "0", 10);
    const date = atLocalMidday(now);
    date.setDate(date.getDate() - days);
    return date;
  }

  const lastWeekdayMatch = value.match(
    /^last\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/,
  );
  if (lastWeekdayMatch) {
    const targetName = lastWeekdayMatch[1] as (typeof weekdayNames)[number];
    const targetDay = weekdayNames.indexOf(targetName);
    const date = atLocalMidday(now);
    const delta = (date.getDay() - targetDay + 7) % 7 || 7;
    date.setDate(date.getDate() - delta);
    return date;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return atLocalMidday(parsed);
  }

  return undefined;
}

export function parseHumanDate(input: string, now: Date = new Date()): string {
  const maybeIso = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(maybeIso)) {
    return maybeIso;
  }

  const parsed = parseRelativePhrase(maybeIso, now);
  if (!parsed) {
    throw new Error(`Could not parse date value: ${input}`);
  }

  return formatIsoDate(parsed);
}

export function resolvePeriodExpression(expression: string, now: Date = new Date()): DateRange {
  const value = expression.trim().toLowerCase();

  if (value === "this-month") {
    return { from: formatIsoDate(monthStart(now)), to: formatIsoDate(now) };
  }

  if (value === "last-month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 12, 0, 0, 0);
    return { from: formatIsoDate(start), to: formatIsoDate(end) };
  }

  if (value === "this-quarter") {
    return { from: formatIsoDate(quarterStart(now)), to: formatIsoDate(now) };
  }

  if (value === "last-quarter") {
    const thisQuarter = Math.floor(now.getMonth() / 3);
    const quarterIndex = (thisQuarter + 3) % 4;
    const year = thisQuarter === 0 ? now.getFullYear() - 1 : now.getFullYear();
    return quarterRangeFor(year, quarterIndex);
  }

  if (value === "ytd") {
    return { from: `${now.getFullYear()}-01-01`, to: formatIsoDate(now) };
  }

  if (value === "last-year") {
    const year = now.getFullYear() - 1;
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }

  const quarterMatch = value.match(/^q([1-4])$/);
  if (quarterMatch) {
    const quarter = Number.parseInt(quarterMatch[1] ?? "1", 10);
    return quarterRangeFor(now.getFullYear(), quarter - 1);
  }

  const yearMatch = value.match(/^(\d{4})$/);
  if (yearMatch) {
    const year = yearMatch[1] as string;
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }

  const monthMatch = value.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const year = Number.parseInt(monthMatch[1] ?? "1970", 10);
    const month = Number.parseInt(monthMatch[2] ?? "1", 10);
    if (month < 1 || month > 12) {
      throw new Error(`Invalid period month: ${expression}`);
    }
    const start = new Date(year, month - 1, 1, 12, 0, 0, 0);
    const end = new Date(year, month, 0, 12, 0, 0, 0);
    return { from: formatIsoDate(start), to: formatIsoDate(end) };
  }

  throw new Error(`Unsupported period expression: ${expression}`);
}

export function resolveDateRange(
  options: DateRangeOptions,
  now: Date = new Date(),
): DateRange | undefined {
  const from = options.begin ? parseHumanDate(options.begin, now) : undefined;
  const to = options.end ? parseHumanDate(options.end, now) : undefined;

  let periodRange: DateRange | undefined;
  if (options.period) {
    periodRange = resolvePeriodExpression(options.period, now);
  }

  const resolvedFrom = from ?? periodRange?.from;
  const resolvedTo = to ?? periodRange?.to;

  if (!resolvedFrom && !resolvedTo) {
    return undefined;
  }

  if (!resolvedFrom || !resolvedTo) {
    throw new Error("Date range requires both begin and end values.");
  }

  if (resolvedFrom > resolvedTo) {
    throw new Error("Begin date must be less than or equal to end date.");
  }

  return { from: resolvedFrom, to: resolvedTo };
}

export function currentMonthToDate(now: Date = new Date()): DateRange {
  return {
    from: formatIsoDate(monthStart(now)),
    to: formatIsoDate(now),
  };
}
