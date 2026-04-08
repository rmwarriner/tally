import type {
  AddHouseholdMemberRequest,
  ApplyScheduledTransactionExceptionRequest,
  ExecuteScheduledTransactionRequest,
  GetCloseSummaryRequest,
  GetStatementExportRequest,
  GetQifExportRequest,
  GetReportRequest,
  PostBaselineBudgetLineRequest,
  PostClosePeriodRequest,
  PostCsvImportRequest,
  PostEnvelopeAllocationRequest,
  PostEnvelopeRequest,
  PostGnuCashXmlImportRequest,
  PostQifImportRequest,
  PostReconciliationRequest,
  PostScheduledTransactionRequest,
  PostStatementImportRequest,
  PostTransactionRequest,
  RequestApprovalRequest,
  SetHouseholdMemberRoleRequest,
} from "./types";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const implementedReportKinds = new Set([
  "budget-vs-actual",
  "cash-flow",
  "envelope-summary",
  "income-statement",
  "net-worth",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && isoDatePattern.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isStatementFormat(value: unknown): value is "ofx" | "qfx" {
  return value === "ofx" || value === "qfx";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isBudgetPeriod(value: unknown): value is "monthly" | "quarterly" | "annually" {
  return value === "monthly" || value === "quarterly" || value === "annually";
}

function isScheduleFrequency(
  value: unknown,
): value is "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "annually" {
  return (
    value === "daily" ||
    value === "weekly" ||
    value === "biweekly" ||
    value === "monthly" ||
    value === "quarterly" ||
    value === "annually"
  );
}

function isEnvelopeAllocationType(value: unknown): value is "fund" | "release" | "cover-overspend" {
  return value === "fund" || value === "release" || value === "cover-overspend";
}

function validateMoneyAmount(value: unknown, path: string, errors: string[]): void {
  if (!isObject(value)) {
    errors.push(`${path} is required.`);
    return;
  }

  if (!isNonEmptyString(value.commodityCode)) {
    errors.push(`${path}.commodityCode is required.`);
  }

  if (!isFiniteNumber(value.quantity)) {
    errors.push(`${path}.quantity must be a finite number.`);
  }
}

function validatePostings(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value) || value.length < 2) {
    errors.push(`${path} must contain at least two postings.`);
    return;
  }

  for (const [index, posting] of value.entries()) {
    if (!isObject(posting)) {
      errors.push(`${path}[${index}] must be an object.`);
      continue;
    }

    if (!isNonEmptyString(posting.accountId)) {
      errors.push(`${path}[${index}].accountId is required.`);
    }

    validateMoneyAmount(posting.amount, `${path}[${index}].amount`, errors);
  }
}

export function validateTransactionRequestBody(body: unknown): {
  errors: string[];
  value?: Pick<PostTransactionRequest, "transaction">;
} {
  const errors: string[] = [];

  if (!isObject(body) || !isObject(body.transaction)) {
    return {
      errors: ["transaction payload is required."],
    };
  }

  const transaction = body.transaction;

  if (!isNonEmptyString(transaction.id)) {
    errors.push("transaction.id is required.");
  }

  if (!isNonEmptyString(transaction.description)) {
    errors.push("transaction.description is required.");
  }

  if (!isIsoDate(transaction.occurredOn)) {
    errors.push("transaction.occurredOn must use YYYY-MM-DD format.");
  }

  if (transaction.deletion !== undefined) {
    errors.push("transaction.deletion is managed by the service and cannot be supplied.");
  }

  if (!Array.isArray(transaction.postings) || transaction.postings.length < 2) {
    errors.push("transaction.postings must contain at least two postings.");
  } else {
    for (const [index, posting] of transaction.postings.entries()) {
      if (!isObject(posting)) {
        errors.push(`transaction.postings[${index}] must be an object.`);
        continue;
      }

      if (!isNonEmptyString(posting.accountId)) {
        errors.push(`transaction.postings[${index}].accountId is required.`);
      }

      if (!isObject(posting.amount)) {
        errors.push(`transaction.postings[${index}].amount is required.`);
        continue;
      }

      if (!isNonEmptyString(posting.amount.commodityCode)) {
        errors.push(`transaction.postings[${index}].amount.commodityCode is required.`);
      }

      if (!isFiniteNumber(posting.amount.quantity)) {
        errors.push(`transaction.postings[${index}].amount.quantity must be a finite number.`);
      }
    }
  }

  return errors.length > 0
    ? { errors }
    : {
        errors: [],
        value: body as Pick<PostTransactionRequest, "transaction">,
      };
}

export function validateReconciliationRequestBody(body: unknown): {
  errors: string[];
  value?: Pick<PostReconciliationRequest, "payload">;
} {
  const errors: string[] = [];

  if (!isObject(body) || !isObject(body.payload)) {
    return {
      errors: ["payload is required."],
    };
  }

  const payload = body.payload;

  if (!isNonEmptyString(payload.accountId)) {
    errors.push("payload.accountId is required.");
  }

  if (!Array.isArray(payload.clearedTransactionIds)) {
    errors.push("payload.clearedTransactionIds must be an array.");
  } else if (
    payload.clearedTransactionIds.some((value) => !isNonEmptyString(value))
  ) {
    errors.push("payload.clearedTransactionIds must contain only non-empty strings.");
  }

  if (!isFiniteNumber(payload.statementBalance)) {
    errors.push("payload.statementBalance must be a finite number.");
  }

  if (!isIsoDate(payload.statementDate)) {
    errors.push("payload.statementDate must use YYYY-MM-DD format.");
  }

  if (payload.reconciliationId !== undefined && !isNonEmptyString(payload.reconciliationId)) {
    errors.push("payload.reconciliationId must be a non-empty string when provided.");
  }

  return errors.length > 0
    ? { errors }
    : {
        errors: [],
        value: body as Pick<PostReconciliationRequest, "payload">,
      };
}

export function validateCsvImportRequestBody(body: unknown): {
  errors: string[];
  value?: Pick<PostCsvImportRequest, "payload">;
} {
  const errors: string[] = [];

  if (!isObject(body) || !isObject(body.payload)) {
    return {
      errors: ["payload is required."],
    };
  }

  const payload = body.payload;

  if (!isNonEmptyString(payload.batchId)) {
    errors.push("payload.batchId is required.");
  }

  if (!isNonEmptyString(payload.sourceLabel)) {
    errors.push("payload.sourceLabel is required.");
  }

  if (!isIsoTimestamp(payload.importedAt)) {
    errors.push("payload.importedAt must be a valid ISO timestamp.");
  }

  if (!Array.isArray(payload.rows)) {
    errors.push("payload.rows must be an array.");
  } else {
    for (const [index, row] of payload.rows.entries()) {
      if (!isObject(row)) {
        errors.push(`payload.rows[${index}] must be an object.`);
        continue;
      }

      if (!isIsoDate(row.occurredOn)) {
        errors.push(`payload.rows[${index}].occurredOn must use YYYY-MM-DD format.`);
      }

      if (!isNonEmptyString(row.description)) {
        errors.push(`payload.rows[${index}].description is required.`);
      }

      if (!isFiniteNumber(row.amount)) {
        errors.push(`payload.rows[${index}].amount must be a finite number.`);
      }

      if (!isNonEmptyString(row.counterpartAccountId)) {
        errors.push(`payload.rows[${index}].counterpartAccountId is required.`);
      }

      if (!isNonEmptyString(row.cashAccountId)) {
        errors.push(`payload.rows[${index}].cashAccountId is required.`);
      }
    }
  }

  return errors.length > 0
    ? { errors }
    : {
        errors: [],
        value: body as Pick<PostCsvImportRequest, "payload">,
      };
}

export function validateQifImportRequestBody(body: unknown): {
  errors: string[];
  value?: Pick<PostQifImportRequest, "payload">;
} {
  const errors: string[] = [];

  if (!isObject(body) || !isObject(body.payload)) {
    return {
      errors: ["payload is required."],
    };
  }

  const payload = body.payload;

  if (!isNonEmptyString(payload.batchId)) {
    errors.push("payload.batchId is required.");
  }

  if (!isNonEmptyString(payload.sourceLabel)) {
    errors.push("payload.sourceLabel is required.");
  }

  if (!isIsoTimestamp(payload.importedAt)) {
    errors.push("payload.importedAt must be a valid ISO timestamp.");
  }

  if (!isNonEmptyString(payload.cashAccountId)) {
    errors.push("payload.cashAccountId is required.");
  }

  if (!isNonEmptyString(payload.defaultCounterpartAccountId)) {
    errors.push("payload.defaultCounterpartAccountId is required.");
  }

  if (!isNonEmptyString(payload.qif)) {
    errors.push("payload.qif is required.");
  }

  if (payload.categoryMappings !== undefined) {
    if (!isObject(payload.categoryMappings)) {
      errors.push("payload.categoryMappings must be an object when provided.");
    } else {
      for (const [key, value] of Object.entries(payload.categoryMappings)) {
        if (!isNonEmptyString(key) || !isNonEmptyString(value)) {
          errors.push("payload.categoryMappings must contain only non-empty string keys and values.");
          break;
        }
      }
    }
  }

  return errors.length > 0
    ? { errors }
    : {
        errors: [],
        value: body as Pick<PostQifImportRequest, "payload">,
      };
}

export function validateQifExportQuery(query: {
  accountId: string | null;
  from: string | null;
  to: string | null;
}): {
  errors: string[];
  value?: Pick<GetQifExportRequest, "accountId" | "from" | "to">;
} {
  const errors: string[] = [];

  if (!isNonEmptyString(query.accountId)) {
    errors.push("accountId is required.");
  }

  if (!isIsoDate(query.from)) {
    errors.push("from must use YYYY-MM-DD format.");
  }

  if (!isIsoDate(query.to)) {
    errors.push("to must use YYYY-MM-DD format.");
  }

  return errors.length > 0 || !query.accountId || !query.from || !query.to
    ? { errors }
    : {
        errors: [],
        value: {
          accountId: query.accountId,
          from: query.from,
          to: query.to,
        },
      };
}

export function validateStatementImportRequestBody(body: unknown): {
  errors: string[];
  value?: Pick<PostStatementImportRequest, "payload">;
} {
  const errors: string[] = [];

  if (!isObject(body) || !isObject(body.payload)) {
    return {
      errors: ["payload is required."],
    };
  }

  const payload = body.payload;

  if (!isNonEmptyString(payload.batchId)) {
    errors.push("payload.batchId is required.");
  }

  if (!isStatementFormat(payload.format)) {
    errors.push("payload.format must be ofx or qfx.");
  }

  if (!isNonEmptyString(payload.sourceLabel)) {
    errors.push("payload.sourceLabel is required.");
  }

  if (!isIsoTimestamp(payload.importedAt)) {
    errors.push("payload.importedAt must be a valid ISO timestamp.");
  }

  if (!isNonEmptyString(payload.cashAccountId)) {
    errors.push("payload.cashAccountId is required.");
  }

  if (!isNonEmptyString(payload.defaultCounterpartAccountId)) {
    errors.push("payload.defaultCounterpartAccountId is required.");
  }

  if (!isNonEmptyString(payload.statement)) {
    errors.push("payload.statement is required.");
  }

  if (payload.nameMappings !== undefined) {
    if (!isObject(payload.nameMappings)) {
      errors.push("payload.nameMappings must be an object when provided.");
    } else {
      for (const [key, value] of Object.entries(payload.nameMappings)) {
        if (!isNonEmptyString(key) || !isNonEmptyString(value)) {
          errors.push("payload.nameMappings must contain only non-empty string keys and values.");
          break;
        }
      }
    }
  }

  return errors.length > 0
    ? { errors }
    : {
        errors: [],
        value: body as Pick<PostStatementImportRequest, "payload">,
      };
}

export function validateStatementExportQuery(query: {
  accountId: string | null;
  format: string | null;
  from: string | null;
  to: string | null;
}): {
  errors: string[];
  value?: Pick<GetStatementExportRequest, "accountId" | "format" | "from" | "to">;
} {
  const errors: string[] = [];

  if (!isStatementFormat(query.format)) {
    errors.push("format must be ofx or qfx.");
  }

  if (!isNonEmptyString(query.accountId)) {
    errors.push("accountId is required.");
  }

  if (!isIsoDate(query.from)) {
    errors.push("from must use YYYY-MM-DD format.");
  }

  if (!isIsoDate(query.to)) {
    errors.push("to must use YYYY-MM-DD format.");
  }

  return errors.length > 0 || !query.accountId || !query.from || !query.to || !query.format
    ? { errors }
    : {
        errors: [],
        value: {
          accountId: query.accountId,
          format: query.format as GetStatementExportRequest["format"],
          from: query.from,
          to: query.to,
        },
      };
}

export function validateGnuCashXmlImportRequestBody(body: unknown): {
  errors: string[];
  value?: Pick<PostGnuCashXmlImportRequest, "payload">;
} {
  const errors: string[] = [];

  if (!isObject(body) || !isObject(body.payload)) {
    return {
      errors: ["payload is required."],
    };
  }

  const payload = body.payload;

  if (!isNonEmptyString(payload.sourceLabel)) {
    errors.push("payload.sourceLabel is required.");
  }

  if (!isIsoTimestamp(payload.importedAt)) {
    errors.push("payload.importedAt must be a valid ISO timestamp.");
  }

  if (!isNonEmptyString(payload.xml)) {
    errors.push("payload.xml is required.");
  }

  return errors.length > 0
    ? { errors }
    : {
        errors: [],
        value: body as Pick<PostGnuCashXmlImportRequest, "payload">,
      };
}

export function validateClosePeriodRequestBody(body: unknown): {
  errors: string[];
  value?: Pick<PostClosePeriodRequest, "payload">;
} {
  const errors: string[] = [];

  if (!isObject(body) || !isObject(body.payload)) {
    return {
      errors: ["payload is required."],
    };
  }

  const payload = body.payload;

  if (!isIsoDate(payload.from)) {
    errors.push("payload.from must use YYYY-MM-DD format.");
  }

  if (!isIsoDate(payload.to)) {
    errors.push("payload.to must use YYYY-MM-DD format.");
  }

  if (!isIsoTimestamp(payload.closedAt)) {
    errors.push("payload.closedAt must be a valid ISO timestamp.");
  }

  if (payload.id !== undefined && !isNonEmptyString(payload.id)) {
    errors.push("payload.id must be a non-empty string when provided.");
  }

  if (payload.notes !== undefined && typeof payload.notes !== "string") {
    errors.push("payload.notes must be a string when provided.");
  }

  return errors.length > 0
    ? { errors }
    : {
        errors: [],
        value: body as Pick<PostClosePeriodRequest, "payload">,
      };
}

export function validateReportQuery(input: {
  from: string | null;
  kind: string | null;
  to: string | null;
}): {
  errors: string[];
  value?: Pick<GetReportRequest, "from" | "kind" | "to">;
} {
  const errors: string[] = [];

  if (!input.kind || !implementedReportKinds.has(input.kind)) {
    errors.push("Report kind must be one of budget-vs-actual, cash-flow, envelope-summary, income-statement, or net-worth.");
  }

  if (!isIsoDate(input.from)) {
    errors.push("from must use YYYY-MM-DD format.");
  }

  if (!isIsoDate(input.to)) {
    errors.push("to must use YYYY-MM-DD format.");
  }

  return errors.length > 0 || !input.kind || !input.from || !input.to
    ? { errors }
    : {
        errors: [],
        value: {
          from: input.from,
          kind: input.kind as GetReportRequest["kind"],
          to: input.to,
        },
      };
}

export function validateCloseSummaryQuery(input: {
  from: string | null;
  to: string | null;
}): {
  errors: string[];
  value?: Pick<GetCloseSummaryRequest, "from" | "to">;
} {
  const errors: string[] = [];

  if (!isIsoDate(input.from)) {
    errors.push("from must use YYYY-MM-DD format.");
  }

  if (!isIsoDate(input.to)) {
    errors.push("to must use YYYY-MM-DD format.");
  }

  return errors.length > 0 || !input.from || !input.to
    ? { errors }
    : {
        errors: [],
        value: {
          from: input.from,
          to: input.to,
        },
      };
}

export function validateBaselineBudgetLineRequestBody(body: unknown): {
  errors: string[];
  value?: Pick<PostBaselineBudgetLineRequest, "line">;
} {
  const errors: string[] = [];

  if (!isObject(body) || !isObject(body.line)) {
    return { errors: ["line payload is required."] };
  }

  const line = body.line;

  if (!isNonEmptyString(line.accountId)) {
    errors.push("line.accountId is required.");
  }

  if (!isNonEmptyString(line.period)) {
    errors.push("line.period is required.");
  }

  if (!isBudgetPeriod(line.budgetPeriod)) {
    errors.push("line.budgetPeriod must be monthly, quarterly, or annually.");
  }

  validateMoneyAmount(line.plannedAmount, "line.plannedAmount", errors);

  if (line.notes !== undefined && typeof line.notes !== "string") {
    errors.push("line.notes must be a string when provided.");
  }

  return errors.length > 0
    ? { errors }
    : {
        errors: [],
        value: body as Pick<PostBaselineBudgetLineRequest, "line">,
      };
}

export function validateEnvelopeRequestBody(body: unknown): {
  errors: string[];
  value?: Pick<PostEnvelopeRequest, "envelope">;
} {
  const errors: string[] = [];

  if (!isObject(body) || !isObject(body.envelope)) {
    return { errors: ["envelope payload is required."] };
  }

  const envelope = body.envelope;

  if (!isNonEmptyString(envelope.id)) {
    errors.push("envelope.id is required.");
  }

  if (!isNonEmptyString(envelope.name)) {
    errors.push("envelope.name is required.");
  }

  if (!isNonEmptyString(envelope.expenseAccountId)) {
    errors.push("envelope.expenseAccountId is required.");
  }

  if (!isNonEmptyString(envelope.fundingAccountId)) {
    errors.push("envelope.fundingAccountId is required.");
  }

  validateMoneyAmount(envelope.availableAmount, "envelope.availableAmount", errors);

  if (envelope.targetAmount !== undefined) {
    validateMoneyAmount(envelope.targetAmount, "envelope.targetAmount", errors);
  }

  if (!isBoolean(envelope.rolloverEnabled)) {
    errors.push("envelope.rolloverEnabled must be a boolean.");
  }

  return errors.length > 0
    ? { errors }
    : {
        errors: [],
        value: body as Pick<PostEnvelopeRequest, "envelope">,
      };
}

export function validateEnvelopeAllocationRequestBody(body: unknown): {
  errors: string[];
  value?: Pick<PostEnvelopeAllocationRequest, "allocation">;
} {
  const errors: string[] = [];

  if (!isObject(body) || !isObject(body.allocation)) {
    return { errors: ["allocation payload is required."] };
  }

  const allocation = body.allocation;

  if (!isNonEmptyString(allocation.id)) {
    errors.push("allocation.id is required.");
  }

  if (!isNonEmptyString(allocation.envelopeId)) {
    errors.push("allocation.envelopeId is required.");
  }

  if (!isIsoDate(allocation.occurredOn)) {
    errors.push("allocation.occurredOn must use YYYY-MM-DD format.");
  }

  if (!isEnvelopeAllocationType(allocation.type)) {
    errors.push("allocation.type must be fund, release, or cover-overspend.");
  }

  validateMoneyAmount(allocation.amount, "allocation.amount", errors);

  if (allocation.note !== undefined && typeof allocation.note !== "string") {
    errors.push("allocation.note must be a string when provided.");
  }

  return errors.length > 0
    ? { errors }
    : {
        errors: [],
        value: body as Pick<PostEnvelopeAllocationRequest, "allocation">,
      };
}

export function validateScheduledTransactionRequestBody(body: unknown): {
  errors: string[];
  value?: Pick<PostScheduledTransactionRequest, "schedule">;
} {
  const errors: string[] = [];

  if (!isObject(body) || !isObject(body.schedule)) {
    return { errors: ["schedule payload is required."] };
  }

  const schedule = body.schedule;

  if (!isNonEmptyString(schedule.id)) {
    errors.push("schedule.id is required.");
  }

  if (!isNonEmptyString(schedule.name)) {
    errors.push("schedule.name is required.");
  }

  if (!isScheduleFrequency(schedule.frequency)) {
    errors.push("schedule.frequency must be daily, weekly, biweekly, monthly, quarterly, or annually.");
  }

  if (!isIsoDate(schedule.nextDueOn)) {
    errors.push("schedule.nextDueOn must use YYYY-MM-DD format.");
  }

  if (!isBoolean(schedule.autoPost)) {
    errors.push("schedule.autoPost must be a boolean.");
  }

  if (!isObject(schedule.templateTransaction)) {
    errors.push("schedule.templateTransaction is required.");
  } else {
    if (!isNonEmptyString(schedule.templateTransaction.description)) {
      errors.push("schedule.templateTransaction.description is required.");
    }

    validatePostings(
      schedule.templateTransaction.postings,
      "schedule.templateTransaction.postings",
      errors,
    );
  }

  return errors.length > 0
    ? { errors }
    : {
        errors: [],
        value: body as Pick<PostScheduledTransactionRequest, "schedule">,
  };
}

export function validateExecuteScheduledTransactionRequestBody(body: unknown): {
  errors?: string[];
  value?: Pick<ExecuteScheduledTransactionRequest, "payload">;
} {
  if (!isObject(body) || !isObject(body.payload)) {
    return { errors: ["payload is required."] };
  }

  const errors: string[] = [];
  const payload = body.payload;

  if (!isIsoDate(payload.occurredOn)) {
    errors.push("payload.occurredOn must use YYYY-MM-DD format.");
  }

  if (payload.transactionId !== undefined && !isNonEmptyString(payload.transactionId)) {
    errors.push("payload.transactionId must be a non-empty string when provided.");
  }

  return errors.length > 0
    ? { errors }
    : {
        value: body as Pick<ExecuteScheduledTransactionRequest, "payload">,
      };
}

export function validateApplyScheduledTransactionExceptionRequestBody(body: unknown): {
  errors?: string[];
  value?: Pick<ApplyScheduledTransactionExceptionRequest, "payload">;
} {
  if (!isObject(body) || !isObject(body.payload)) {
    return { errors: ["payload is required."] };
  }

  const errors: string[] = [];
  const payload = body.payload;

  if (payload.action !== "skip-next" && payload.action !== "defer") {
    errors.push("payload.action must be skip-next or defer.");
  }

  if (payload.effectiveOn !== undefined && !isIsoDate(payload.effectiveOn)) {
    errors.push("payload.effectiveOn must use YYYY-MM-DD format when provided.");
  }

  if (payload.nextDueOn !== undefined && !isIsoDate(payload.nextDueOn)) {
    errors.push("payload.nextDueOn must use YYYY-MM-DD format when provided.");
  }

  if (payload.note !== undefined && typeof payload.note !== "string") {
    errors.push("payload.note must be a string when provided.");
  }

  return errors.length > 0
    ? { errors }
    : {
        value: body as Pick<ApplyScheduledTransactionExceptionRequest, "payload">,
      };
}

function isHouseholdMemberRole(
  value: unknown,
): value is "admin" | "guardian" | "member" {
  return value === "admin" || value === "guardian" || value === "member";
}

export function validateAddHouseholdMemberBody(body: unknown):
  | { errors: string[] }
  | { value: Pick<AddHouseholdMemberRequest, "payload"> } {
  if (!isObject(body) || !isObject(body.payload)) {
    return { errors: ["payload is required."] };
  }

  const errors: string[] = [];
  const payload = body.payload;

  if (!isNonEmptyString(payload.actor)) {
    errors.push("payload.actor is required.");
  }

  if (payload.role !== undefined && !isHouseholdMemberRole(payload.role)) {
    errors.push("payload.role must be admin, guardian, or member when provided.");
  }

  return errors.length > 0
    ? { errors }
    : { value: body as Pick<AddHouseholdMemberRequest, "payload"> };
}

export function validateSetHouseholdMemberRoleBody(body: unknown):
  | { errors: string[] }
  | { value: Pick<SetHouseholdMemberRoleRequest, "payload"> } {
  if (!isObject(body) || !isObject(body.payload)) {
    return { errors: ["payload is required."] };
  }

  const errors: string[] = [];
  const payload = body.payload;

  if (!isHouseholdMemberRole(payload.role)) {
    errors.push("payload.role must be admin, guardian, or member.");
  }

  return errors.length > 0
    ? { errors }
    : { value: body as Pick<SetHouseholdMemberRoleRequest, "payload"> };
}

function isApprovalKind(value: unknown): value is "destroy-transaction" {
  return value === "destroy-transaction";
}

export function validateRequestApprovalBody(body: unknown):
  | { errors: string[] }
  | { value: Pick<RequestApprovalRequest, "payload"> } {
  if (!isObject(body) || !isObject(body.payload)) {
    return { errors: ["payload is required."] };
  }

  const errors: string[] = [];
  const payload = body.payload;

  if (!isNonEmptyString(payload.approvalId)) {
    errors.push("payload.approvalId is required.");
  }

  if (!isApprovalKind(payload.kind)) {
    errors.push("payload.kind must be destroy-transaction.");
  }

  if (!isNonEmptyString(payload.entityId)) {
    errors.push("payload.entityId is required.");
  }

  return errors.length > 0
    ? { errors }
    : { value: body as Pick<RequestApprovalRequest, "payload"> };
}
