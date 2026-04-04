import { describe, expect, it } from "vitest";
import { demoSchedules } from "./demo-data";
import { advanceSchedule, materializeDueTransactions } from "./schedules";

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
});
