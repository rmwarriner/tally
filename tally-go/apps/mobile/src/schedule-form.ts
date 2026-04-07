import type { ScheduleFrequency, ScheduledTransaction } from "@tally-core/domain";

export interface SchedulePostingFormState {
  accountId: string;
  amount: string;
  accountSearch: string;
  memo: string;
}

export interface ScheduleFormState {
  autoPost: boolean;
  description: string;
  frequency: ScheduleFrequency;
  id: string;
  name: string;
  nextDueOn: string;
  payee: string;
  postings: SchedulePostingFormState[];
}

export function createSchedulePostingForm(
  accountId = "acct-expense-housing",
  amount = "0",
  memo = "",
  accountSearch = "",
): SchedulePostingFormState {
  return {
    accountId,
    amount,
    accountSearch,
    memo,
  };
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function validateScheduleForm(scheduleForm: ScheduleFormState): string[] {
  const errors: string[] = [];

  if (!scheduleForm.id.trim()) {
    errors.push("Schedule ID is required.");
  }

  if (!scheduleForm.name.trim()) {
    errors.push("Schedule name is required.");
  }

  if (!scheduleForm.description.trim()) {
    errors.push("Schedule description is required.");
  }

  if (!isIsoDate(scheduleForm.nextDueOn.trim())) {
    errors.push("Next due date must use YYYY-MM-DD format.");
  }

  if (scheduleForm.postings.length < 2) {
    errors.push("At least two template postings are required.");
  }

  let templateBalance = 0;

  for (const [index, posting] of scheduleForm.postings.entries()) {
    if (!posting.accountId.trim()) {
      errors.push(`Posting ${index + 1} account ID is required.`);
    }

    const quantity = Number.parseFloat(posting.amount);
    if (!Number.isFinite(quantity)) {
      errors.push(`Posting ${index + 1} amount must be a valid number.`);
      continue;
    }

    templateBalance += quantity;
  }

  if (errors.every((error) => !error.includes("amount must be a valid number.")) && templateBalance !== 0) {
    errors.push("Template postings must balance to zero.");
  }

  return errors;
}

export function createScheduleForm(schedule?: ScheduledTransaction): ScheduleFormState {
  return {
    autoPost: schedule?.autoPost ?? false,
    description: schedule?.templateTransaction.description ?? "Monthly rent",
    frequency: schedule?.frequency ?? "monthly",
    id: schedule?.id ?? "sched-rent",
    name: schedule?.name ?? "Monthly Rent",
    nextDueOn: schedule?.nextDueOn ?? "2026-05-01",
    payee: schedule?.templateTransaction.payee ?? "Property Management Co.",
    postings:
      schedule?.templateTransaction.postings.map((posting) =>
        createSchedulePostingForm(
          posting.accountId,
          String(posting.amount.quantity),
          posting.memo ?? "",
        ),
      ) ?? [
        createSchedulePostingForm("acct-expense-housing", "1400"),
        createSchedulePostingForm("acct-checking", "-1400"),
      ],
  };
}

export function updateSchedulePosting(
  scheduleForm: ScheduleFormState,
  index: number,
  patch: Partial<SchedulePostingFormState>,
): ScheduleFormState {
  return {
    ...scheduleForm,
    postings: scheduleForm.postings.map((candidate, candidateIndex) =>
      candidateIndex === index ? { ...candidate, ...patch } : candidate,
    ),
  };
}

export function removeSchedulePosting(scheduleForm: ScheduleFormState, index: number): ScheduleFormState {
  return {
    ...scheduleForm,
    postings: scheduleForm.postings.filter((_, candidateIndex) => candidateIndex !== index),
  };
}

export function addSchedulePosting(scheduleForm: ScheduleFormState): ScheduleFormState {
  return {
    ...scheduleForm,
    postings: [...scheduleForm.postings, createSchedulePostingForm("", "0")],
  };
}
