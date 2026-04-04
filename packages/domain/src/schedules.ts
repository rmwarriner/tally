import type { ScheduledTransaction, Transaction } from "./types";

function toDateParts(isoDate: string): [number, number, number] {
  const [year, month, day] = isoDate.split("-").map(Number);

  return [year, month, day];
}

function fromDateParts(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = toDateParts(isoDate);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return date.toISOString().slice(0, 10);
}

function addMonths(isoDate: string, monthsToAdd: number): string {
  const [year, month, day] = toDateParts(isoDate);
  const targetMonthIndex = month - 1 + monthsToAdd;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const targetMonth = normalizedMonthIndex + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));

  return fromDateParts(targetYear, targetMonth, targetDay);
}

export function advanceSchedule(schedule: ScheduledTransaction): ScheduledTransaction {
  const nextDueOn = (() => {
    switch (schedule.frequency) {
      case "daily":
        return addDays(schedule.nextDueOn, 1);
      case "weekly":
        return addDays(schedule.nextDueOn, 7);
      case "biweekly":
        return addDays(schedule.nextDueOn, 14);
      case "monthly":
        return addMonths(schedule.nextDueOn, 1);
      case "quarterly":
        return addMonths(schedule.nextDueOn, 3);
      case "annually":
        return addMonths(schedule.nextDueOn, 12);
      default:
        return schedule.nextDueOn;
    }
  })();

  return {
    ...schedule,
    nextDueOn,
  };
}

export function isScheduleDue(schedule: ScheduledTransaction, asOf: string): boolean {
  return schedule.nextDueOn <= asOf;
}

export function materializeScheduledTransaction(
  schedule: ScheduledTransaction,
  occurredOn: string,
  transactionId: string,
): Transaction {
  return {
    ...schedule.templateTransaction,
    id: transactionId,
    occurredOn,
    scheduleId: schedule.id,
  };
}

export function materializeDueTransactions(
  schedules: ScheduledTransaction[],
  asOf: string,
): Transaction[] {
  return schedules
    .filter((schedule) => isScheduleDue(schedule, asOf))
    .map((schedule) =>
      materializeScheduledTransaction(
        schedule,
        schedule.nextDueOn,
        `${schedule.id}:${schedule.nextDueOn}`,
      ),
    );
}
