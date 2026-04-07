import { describe, expect, it } from "vitest";
import { demoSchedules } from "./demo-data";
import {
  advanceSchedule,
  isScheduleDue,
  materializeDueTransactions,
  materializeScheduledTransaction,
} from "./schedules";

describe("schedules", () => {
  it("advances monthly schedules while preserving end-of-month constraints", () => {
    const schedule = {
      ...demoSchedules[0],
      nextDueOn: "2026-01-31",
    };

    const advanced = advanceSchedule(schedule);

    expect(advanced.nextDueOn).toBe("2026-02-28");
  });

  it("materializes only due transactions", () => {
    const due = materializeDueTransactions(demoSchedules, "2026-05-02");

    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      id: "sched-rent:2026-05-01",
      occurredOn: "2026-05-01",
      scheduleId: "sched-rent",
    });
  });

  it("advances each supported frequency and preserves annual month ends", () => {
    expect(advanceSchedule({ ...demoSchedules[0], frequency: "daily", nextDueOn: "2026-05-01" }).nextDueOn).toBe(
      "2026-05-02",
    );
    expect(advanceSchedule({ ...demoSchedules[0], frequency: "weekly", nextDueOn: "2026-05-01" }).nextDueOn).toBe(
      "2026-05-08",
    );
    expect(
      advanceSchedule({ ...demoSchedules[0], frequency: "biweekly", nextDueOn: "2026-05-01" }).nextDueOn,
    ).toBe("2026-05-15");
    expect(advanceSchedule({ ...demoSchedules[0], frequency: "quarterly", nextDueOn: "2026-01-31" }).nextDueOn).toBe(
      "2026-04-30",
    );
    expect(advanceSchedule({ ...demoSchedules[0], frequency: "annually", nextDueOn: "2024-02-29" }).nextDueOn).toBe(
      "2025-02-28",
    );
  });

  it("checks due status and materializes explicit schedule instances", () => {
    expect(isScheduleDue(demoSchedules[0], "2026-04-30")).toBe(false);
    expect(isScheduleDue(demoSchedules[0], "2026-05-01")).toBe(true);

    expect(materializeScheduledTransaction(demoSchedules[0], "2026-05-01", "sched-rent:manual")).toMatchObject({
      description: demoSchedules[0]?.templateTransaction.description,
      id: "sched-rent:manual",
      occurredOn: "2026-05-01",
      scheduleId: demoSchedules[0]?.id,
    });
  });
});
