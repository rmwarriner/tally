import { describe, expect, it } from "vitest";
import {
  validateAccountRequestBody,
  validateAddHouseholdMemberBody,
  validateApplyScheduledTransactionExceptionRequestBody,
  validateBaselineBudgetLineRequestBody,
  validateClosePeriodRequestBody,
  validateCoverOverspendRequestBody,
  validateGnuCashXmlImportRequestBody,
  validateCsvImportRequestBody,
  validateEnvelopeAllocationRequestBody,
  validateEnvelopeRequestBody,
  validateExecuteScheduledTransactionRequestBody,
  validateCloseSummaryQuery,
  validateGetTransactionsQuery,
  validateQifExportQuery,
  validateQifImportRequestBody,
  validateReconciliationRequestBody,
  validateReportQuery,
  validateScheduledTransactionRequestBody,
  validateLinkTransactionAttachmentBody,
  validateSetHouseholdMemberRoleBody,
  validateStatementExportQuery,
  validateStatementImportRequestBody,
  validateTransactionRequestBody,
} from "./validation";

describe("api request validation", () => {
  it("accepts a valid transaction payload", () => {
    const result = validateTransactionRequestBody({
      transaction: {
        description: "Valid transaction",
        id: "txn-valid-1",
        occurredOn: "2026-04-04",
        postings: [
          {
            accountId: "acct-expense-groceries",
            amount: { commodityCode: "USD", quantity: 45.12 },
          },
          {
            accountId: "acct-checking",
            amount: { commodityCode: "USD", quantity: -45.12 },
          },
        ],
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.value?.transaction.id).toBe("txn-valid-1");
  });

  it("rejects missing transaction payloads and malformed postings", () => {
    expect(validateTransactionRequestBody(undefined).errors).toEqual(["transaction payload is required."]);

    const result = validateTransactionRequestBody({
      transaction: {
        description: " ",
        id: "",
        occurredOn: "04/04/2026",
        postings: [
          "bad-posting",
          {
            accountId: "",
            amount: { commodityCode: "", quantity: "bad" },
          },
        ],
      },
    });

    expect(result.errors).toContain("transaction.id is required.");
    expect(result.errors).toContain("transaction.description is required.");
    expect(result.errors).toContain("transaction.occurredOn must use YYYY-MM-DD format.");
    expect(result.errors).toContain("transaction.postings[0] must be an object.");
    expect(result.errors).toContain("transaction.postings[1].accountId is required.");
    expect(result.errors).toContain("transaction.postings[1].amount.commodityCode is required.");
    expect(result.errors).toContain("transaction.postings[1].amount.quantity must be a finite number.");
  });

  it("rejects caller-supplied transaction deletion metadata", () => {
    const result = validateTransactionRequestBody({
      transaction: {
        deletion: {
          deletedAt: "2026-04-03T12:00:00Z",
          deletedBy: "Primary",
        },
        description: "Attempted spoof",
        id: "txn-invalid-delete-1",
        occurredOn: "2026-04-03",
        postings: [
          {
            accountId: "acct-expense-groceries",
            amount: { commodityCode: "USD", quantity: 15 },
          },
          {
            accountId: "acct-checking",
            amount: { commodityCode: "USD", quantity: -15 },
          },
        ],
      },
    });

    expect(result.errors).toContain("transaction.deletion is managed by the service and cannot be supplied.");
  });

  it("validates posting reconciledAt when provided", () => {
    const valid = validateTransactionRequestBody({
      transaction: {
        description: "Reconciled posting",
        id: "txn-valid-reconciled-at",
        occurredOn: "2026-04-04",
        postings: [
          {
            accountId: "acct-expense-groceries",
            amount: { commodityCode: "USD", quantity: 45.12 },
            reconciledAt: "2026-04-04T12:00:00.000Z",
          },
          {
            accountId: "acct-checking",
            amount: { commodityCode: "USD", quantity: -45.12 },
            reconciledAt: "2026-04-04T12:00:00.000Z",
          },
        ],
      },
    });
    expect(valid.errors).toEqual([]);

    const invalid = validateTransactionRequestBody({
      transaction: {
        description: "Invalid reconciledAt",
        id: "txn-invalid-reconciled-at",
        occurredOn: "2026-04-04",
        postings: [
          {
            accountId: "acct-expense-groceries",
            amount: { commodityCode: "USD", quantity: 45.12 },
            reconciledAt: "not-a-date",
          },
          {
            accountId: "acct-checking",
            amount: { commodityCode: "USD", quantity: -45.12 },
          },
        ],
      },
    });

    expect(invalid.errors).toContain(
      "transaction.postings[0].reconciledAt must be a valid ISO 8601 date string.",
    );
  });

  it("accepts valid reconciliation payloads and rejects invalid optional ids", () => {
    const valid = validateReconciliationRequestBody({
      payload: {
        accountId: "acct-checking",
        clearedTransactionIds: ["txn-1", "txn-2"],
        reconciliationId: "recon-1",
        statementBalance: 10,
        statementDate: "2026-04-04",
      },
    });

    expect(valid.errors).toEqual([]);
    expect(valid.value?.payload.reconciliationId).toBe("recon-1");

    const invalid = validateReconciliationRequestBody({
      payload: {
        accountId: "",
        clearedTransactionIds: ["txn-1", ""],
        reconciliationId: " ",
        statementBalance: "bad",
        statementDate: "2026/04/04",
      },
    });

    expect(invalid.errors).toContain("payload.accountId is required.");
    expect(invalid.errors).toContain("payload.clearedTransactionIds must contain only non-empty strings.");
    expect(invalid.errors).toContain("payload.statementBalance must be a finite number.");
    expect(invalid.errors).toContain("payload.statementDate must use YYYY-MM-DD format.");
    expect(invalid.errors).toContain("payload.reconciliationId must be a non-empty string when provided.");
  });

  it("accepts valid csv import payloads and rejects malformed rows", () => {
    const valid = validateCsvImportRequestBody({
      payload: {
        batchId: "batch-1",
        importedAt: "2026-04-04T12:00:00.000Z",
        rows: [
          {
            amount: 25,
            cashAccountId: "acct-checking",
            counterpartAccountId: "acct-expense-groceries",
            description: "Groceries",
            occurredOn: "2026-04-04",
          },
        ],
        sourceLabel: "bank-csv",
      },
    });

    expect(valid.errors).toEqual([]);

    const invalid = validateCsvImportRequestBody({
      payload: {
        batchId: "",
        importedAt: "not-a-date",
        rows: [
          "bad-row",
          {
            amount: "bad",
            cashAccountId: "",
            counterpartAccountId: "",
            description: "",
            occurredOn: "2026/04/04",
          },
        ],
        sourceLabel: "",
      },
    });

    expect(invalid.errors).toContain("payload.batchId is required.");
    expect(invalid.errors).toContain("payload.sourceLabel is required.");
    expect(invalid.errors).toContain("payload.importedAt must be a valid ISO timestamp.");
    expect(invalid.errors).toContain("payload.rows[0] must be an object.");
    expect(invalid.errors).toContain("payload.rows[1].occurredOn must use YYYY-MM-DD format.");
    expect(invalid.errors).toContain("payload.rows[1].description is required.");
    expect(invalid.errors).toContain("payload.rows[1].amount must be a finite number.");
    expect(invalid.errors).toContain("payload.rows[1].counterpartAccountId is required.");
    expect(invalid.errors).toContain("payload.rows[1].cashAccountId is required.");
  });

  it("accepts valid qif import payloads and rejects malformed category mappings", () => {
    const valid = validateQifImportRequestBody({
      payload: {
        batchId: "batch-1",
        cashAccountId: "acct-checking",
        categoryMappings: {
          Salary: "acct-income-salary",
        },
        defaultCounterpartAccountId: "acct-expense-misc",
        importedAt: "2026-04-04T12:00:00.000Z",
        qif: "!Type:Bank\n^\n",
        sourceLabel: "checking.qif",
      },
    });

    expect(valid.errors).toEqual([]);

    const invalid = validateQifImportRequestBody({
      payload: {
        batchId: "",
        cashAccountId: "",
        categoryMappings: {
          Salary: "",
        },
        defaultCounterpartAccountId: "",
        importedAt: "not-a-date",
        qif: "",
        sourceLabel: "",
      },
    });

    expect(invalid.errors).toContain("payload.batchId is required.");
    expect(invalid.errors).toContain("payload.sourceLabel is required.");
    expect(invalid.errors).toContain("payload.importedAt must be a valid ISO timestamp.");
    expect(invalid.errors).toContain("payload.cashAccountId is required.");
    expect(invalid.errors).toContain("payload.defaultCounterpartAccountId is required.");
    expect(invalid.errors).toContain("payload.qif is required.");
    expect(invalid.errors).toContain("payload.categoryMappings must contain only non-empty string keys and values.");
  });

  it("validates qif export query parameters", () => {
    expect(
      validateQifExportQuery({
        accountId: "acct-checking",
        from: "2026-04-01",
        to: "2026-04-30",
      }).errors,
    ).toEqual([]);

    expect(
      validateQifExportQuery({
        accountId: null,
        from: "2026/04/01",
        to: null,
      }).errors,
    ).toEqual([
      "accountId is required.",
      "from must use YYYY-MM-DD format.",
      "to must use YYYY-MM-DD format.",
    ]);
  });

  it("validates statement import payloads", () => {
    expect(
      validateStatementImportRequestBody({
        payload: {
          batchId: "stmt-1",
          cashAccountId: "acct-checking",
          defaultCounterpartAccountId: "acct-expense-groceries",
          format: "ofx",
          importedAt: "2026-04-05T00:00:00Z",
          sourceLabel: "checking.ofx",
          statement: "<OFX />",
        },
      }).errors,
    ).toEqual([]);
  });

  it("validates statement export query params", () => {
    expect(
      validateStatementExportQuery({
        accountId: "acct-checking",
        format: "qfx",
        from: "2026-04-01",
        to: "2026-04-30",
      }).errors,
    ).toEqual([]);
  });

  it("validates gnucash xml import payloads", () => {
    expect(
      validateGnuCashXmlImportRequestBody({
        payload: {
          importedAt: "2026-04-05T00:00:00Z",
          sourceLabel: "workspace.gnucash.xml",
          xml: "<gnc-v2 />",
        },
      }).errors,
    ).toEqual([]);
  });

  it("validates close-period payloads", () => {
    expect(
      validateClosePeriodRequestBody({
        payload: {
          closedAt: "2026-04-01T00:00:00Z",
          from: "2026-03-01",
          to: "2026-03-31",
        },
      }).errors,
    ).toEqual([]);
  });

  it("validates report and close-summary query parameters", () => {
    expect(
      validateReportQuery({
        from: "2026-04-01",
        kind: "income-statement",
        to: "2026-04-30",
      }).errors,
    ).toEqual([]);

    expect(
      validateCloseSummaryQuery({
        from: "2026-04-01",
        to: "2026-04-30",
      }).errors,
    ).toEqual([]);

    expect(
      validateReportQuery({
        from: "2026/04/01",
        kind: "cash-flow",
        to: null,
      }).errors,
    ).toEqual([
      "from must use YYYY-MM-DD format.",
      "to must use YYYY-MM-DD format.",
    ]);
  });

  it("validates baseline budget lines including optional notes", () => {
    const valid = validateBaselineBudgetLineRequestBody({
      line: {
        accountId: "acct-expense-groceries",
        budgetPeriod: "monthly",
        notes: "Seasonal increase",
        period: "2026-04",
        plannedAmount: { commodityCode: "USD", quantity: 500 },
      },
    });

    expect(valid.errors).toEqual([]);

    const invalid = validateBaselineBudgetLineRequestBody({
      line: {
        accountId: "",
        budgetPeriod: "weekly",
        notes: 123,
        period: "",
        plannedAmount: { commodityCode: "", quantity: "bad" },
      },
    });

    expect(invalid.errors).toContain("line.accountId is required.");
    expect(invalid.errors).toContain("line.period is required.");
    expect(invalid.errors).toContain("line.budgetPeriod must be monthly, quarterly, or annually.");
    expect(invalid.errors).toContain("line.plannedAmount.commodityCode is required.");
    expect(invalid.errors).toContain("line.plannedAmount.quantity must be a finite number.");
    expect(invalid.errors).toContain("line.notes must be a string when provided.");
  });

  it("validates envelope payloads including optional target amounts", () => {
    const valid = validateEnvelopeRequestBody({
      envelope: {
        availableAmount: { commodityCode: "USD", quantity: 120 },
        expenseAccountId: "acct-expense-housing",
        fundingAccountId: "acct-checking",
        id: "env-1",
        name: "Housing",
        rolloverEnabled: true,
        targetAmount: { commodityCode: "USD", quantity: 200 },
      },
    });

    expect(valid.errors).toEqual([]);

    const invalid = validateEnvelopeRequestBody({
      envelope: {
        availableAmount: null,
        expenseAccountId: "",
        fundingAccountId: "",
        id: "",
        name: "",
        rolloverEnabled: "true",
        targetAmount: { commodityCode: "", quantity: "bad" },
      },
    });

    expect(invalid.errors).toContain("envelope.id is required.");
    expect(invalid.errors).toContain("envelope.name is required.");
    expect(invalid.errors).toContain("envelope.expenseAccountId is required.");
    expect(invalid.errors).toContain("envelope.fundingAccountId is required.");
    expect(invalid.errors).toContain("envelope.availableAmount is required.");
    expect(invalid.errors).toContain("envelope.targetAmount.commodityCode is required.");
    expect(invalid.errors).toContain("envelope.targetAmount.quantity must be a finite number.");
    expect(invalid.errors).toContain("envelope.rolloverEnabled must be a boolean.");
  });

  it("validates envelope allocations including optional notes", () => {
    const valid = validateEnvelopeAllocationRequestBody({
      allocation: {
        amount: { commodityCode: "USD", quantity: 25 },
        envelopeId: "env-1",
        id: "alloc-1",
        note: "Move extra cash",
        occurredOn: "2026-04-04",
        type: "cover-overspend",
      },
    });

    expect(valid.errors).toEqual([]);

    const invalid = validateEnvelopeAllocationRequestBody({
      allocation: {
        amount: { commodityCode: "", quantity: "bad" },
        envelopeId: "",
        id: "",
        note: 42,
        occurredOn: "2026/04/04",
        type: "bad",
      },
    });

    expect(invalid.errors).toContain("allocation.id is required.");
    expect(invalid.errors).toContain("allocation.envelopeId is required.");
    expect(invalid.errors).toContain("allocation.occurredOn must use YYYY-MM-DD format.");
    expect(invalid.errors).toContain("allocation.type must be fund, release, or cover-overspend.");
    expect(invalid.errors).toContain("allocation.amount.commodityCode is required.");
    expect(invalid.errors).toContain("allocation.amount.quantity must be a finite number.");
    expect(invalid.errors).toContain("allocation.note must be a string when provided.");
  });

  it("validates cover-overspend payloads", () => {
    const valid = validateCoverOverspendRequestBody({
      amount: { commodityCode: "USD", quantity: 25 },
      fromEnvelopeId: "env-groceries",
      note: "cover shortfall",
      occurredOn: "2026-04-15",
      toEnvelopeId: "env-utilities",
    });

    expect(valid.errors).toEqual([]);

    const invalid = validateCoverOverspendRequestBody({
      amount: { commodityCode: "", quantity: "bad" },
      fromEnvelopeId: "",
      note: 42,
      occurredOn: "2026/04/15",
      toEnvelopeId: "",
    });

    expect(invalid.errors).toContain("fromEnvelopeId is required.");
    expect(invalid.errors).toContain("toEnvelopeId is required.");
    expect(invalid.errors).toContain("occurredOn must use YYYY-MM-DD format.");
    expect(invalid.errors).toContain("amount.commodityCode is required.");
    expect(invalid.errors).toContain("amount.quantity must be a finite number.");
    expect(invalid.errors).toContain("note must be a string when provided.");
  });

  it("validates scheduled transactions including posting object checks", () => {
    const valid = validateScheduledTransactionRequestBody({
      schedule: {
        autoPost: false,
        frequency: "monthly",
        id: "sched-1",
        name: "Utilities",
        nextDueOn: "2026-05-01",
        templateTransaction: {
          description: "Monthly utilities",
          postings: [
            {
              accountId: "acct-expense-utilities",
              amount: { commodityCode: "USD", quantity: 100 },
            },
            {
              accountId: "acct-checking",
              amount: { commodityCode: "USD", quantity: -100 },
            },
          ],
        },
      },
    });

    expect(valid.errors).toEqual([]);

    const invalid = validateScheduledTransactionRequestBody({
      schedule: {
        autoPost: "false",
        frequency: "yearly",
        id: "",
        name: "",
        nextDueOn: "2026/05/01",
        templateTransaction: {
          description: "",
          postings: [
            "bad-posting",
            {
              accountId: "",
              amount: { commodityCode: "", quantity: "bad" },
            },
          ],
        },
      },
    });

    expect(invalid.errors).toContain("schedule.id is required.");
    expect(invalid.errors).toContain("schedule.name is required.");
    expect(invalid.errors).toContain(
      "schedule.frequency must be daily, weekly, biweekly, monthly, quarterly, or annually.",
    );
    expect(invalid.errors).toContain("schedule.nextDueOn must use YYYY-MM-DD format.");
    expect(invalid.errors).toContain("schedule.autoPost must be a boolean.");
    expect(invalid.errors).toContain("schedule.templateTransaction.description is required.");
    expect(invalid.errors).toContain("schedule.templateTransaction.postings[0] must be an object.");
    expect(invalid.errors).toContain("schedule.templateTransaction.postings[1].accountId is required.");
    expect(invalid.errors).toContain(
      "schedule.templateTransaction.postings[1].amount.commodityCode is required.",
    );
    expect(invalid.errors).toContain(
      "schedule.templateTransaction.postings[1].amount.quantity must be a finite number.",
    );
  });

  it("rejects missing scheduled transaction payload sections", () => {
    expect(validateScheduledTransactionRequestBody({}).errors).toEqual(["schedule payload is required."]);

    const missingTemplate = validateScheduledTransactionRequestBody({
      schedule: {
        autoPost: true,
        frequency: "monthly",
        id: "sched-2",
        name: "Missing template",
        nextDueOn: "2026-05-01",
      },
    });

    expect(missingTemplate.errors).toContain("schedule.templateTransaction is required.");
  });

  it("validates execute scheduled transaction payloads", () => {
    const valid = validateExecuteScheduledTransactionRequestBody({
      payload: {
        occurredOn: "2026-05-01",
        transactionId: "txn-1",
      },
    });

    expect(valid.errors).toBeUndefined();
    expect(valid.value?.payload.transactionId).toBe("txn-1");

    expect(validateExecuteScheduledTransactionRequestBody({}).errors).toEqual(["payload is required."]);

    const invalid = validateExecuteScheduledTransactionRequestBody({
      payload: {
        occurredOn: "2026/05/01",
        transactionId: " ",
      },
    });

    expect(invalid.errors).toContain("payload.occurredOn must use YYYY-MM-DD format.");
    expect(invalid.errors).toContain("payload.transactionId must be a non-empty string when provided.");
  });

  it("validates schedule exception payloads", () => {
    const valid = validateApplyScheduledTransactionExceptionRequestBody({
      payload: {
        action: "defer",
        effectiveOn: "2026-05-01",
        nextDueOn: "2026-05-03",
        note: "Grace period",
      },
    });

    expect(valid.errors).toBeUndefined();
    expect(valid.value?.payload.action).toBe("defer");

    expect(validateApplyScheduledTransactionExceptionRequestBody({}).errors).toEqual([
      "payload is required.",
    ]);

    const invalid = validateApplyScheduledTransactionExceptionRequestBody({
      payload: {
        action: "pause",
        effectiveOn: "2026/05/01",
        nextDueOn: "2026/05/03",
        note: 5,
      },
    });

    expect(invalid.errors).toContain("payload.action must be skip-next or defer.");
    expect(invalid.errors).toContain("payload.effectiveOn must use YYYY-MM-DD format when provided.");
    expect(invalid.errors).toContain("payload.nextDueOn must use YYYY-MM-DD format when provided.");
    expect(invalid.errors).toContain("payload.note must be a string when provided.");
  });

  it("validates add household member payloads", () => {
    const valid = validateAddHouseholdMemberBody({ payload: { actor: "Alice", role: "guardian" } });
    if ("errors" in valid) throw new Error("expected valid");
    expect(valid.value.payload.actor).toBe("Alice");

    const withoutRole = validateAddHouseholdMemberBody({ payload: { actor: "Bob" } });
    expect("errors" in withoutRole).toBe(false);

    const missingPayload = validateAddHouseholdMemberBody({});
    if (!("errors" in missingPayload)) throw new Error("expected errors");
    expect(missingPayload.errors).toEqual(["payload is required."]);

    const missingActor = validateAddHouseholdMemberBody({ payload: {} });
    if (!("errors" in missingActor)) throw new Error("expected errors");
    expect(missingActor.errors).toContain("payload.actor is required.");

    const invalidRole = validateAddHouseholdMemberBody({ payload: { actor: "Carol", role: "superuser" } });
    if (!("errors" in invalidRole)) throw new Error("expected errors");
    expect(invalidRole.errors).toContain("payload.role must be admin, guardian, or member when provided.");
  });

  it("validates set household member role payloads", () => {
    const valid = validateSetHouseholdMemberRoleBody({ payload: { role: "admin" } });
    expect("errors" in valid).toBe(false);

    const missingPayload = validateSetHouseholdMemberRoleBody({});
    if (!("errors" in missingPayload)) throw new Error("expected errors");
    expect(missingPayload.errors).toEqual(["payload is required."]);

    const invalidRole = validateSetHouseholdMemberRoleBody({ payload: { role: "superuser" } });
    if (!("errors" in invalidRole)) throw new Error("expected errors");
    expect(invalidRole.errors).toContain("payload.role must be admin, guardian, or member.");
  });

  it("accepts a valid account payload", () => {
    const result = validateAccountRequestBody({
      account: { id: "acct-1", code: "1000", name: "Cash", type: "asset" },
    });
    if ("errors" in result) throw new Error("expected value");
    expect(result.value.account.id).toBe("acct-1");
    expect(result.value.account.type).toBe("asset");
  });

  it("accepts a full account payload with optional fields", () => {
    const result = validateAccountRequestBody({
      account: {
        id: "acct-2",
        code: "2000",
        name: "Savings",
        type: "asset",
        parentAccountId: "acct-1",
        taxCategory: "checking",
        isEnvelopeFundingSource: true,
      },
    });
    if ("errors" in result) throw new Error("expected value");
    expect(result.value.account.isEnvelopeFundingSource).toBe(true);
  });

  it("rejects account payload missing required fields", () => {
    const missing = validateAccountRequestBody({});
    if (!("errors" in missing)) throw new Error("expected errors");
    expect(missing.errors).toEqual(["account payload is required."]);

    const missingCode = validateAccountRequestBody({
      account: { id: "x", code: "", name: "X", type: "asset" },
    });
    if (!("errors" in missingCode)) throw new Error("expected errors");
    expect(missingCode.errors).toContain("account.code is required.");

    const invalidType = validateAccountRequestBody({
      account: { id: "x", code: "1000", name: "X", type: "bogus" },
    });
    if (!("errors" in invalidType)) throw new Error("expected errors");
    expect(invalidType.errors).toContain(
      "account.type must be asset, liability, equity, income, or expense.",
    );
  });

  it("validates transaction list query params", () => {
    const valid = validateGetTransactionsQuery({
      accountId: "acct-checking",
      cursor: "abc123",
      from: "2026-04-01",
      limit: "100",
      status: "pending",
      to: "2026-04-30",
    });

    expect(valid.errors).toEqual([]);
    expect(valid.value?.limit).toBe(100);

    const invalid = validateGetTransactionsQuery({
      accountId: "",
      cursor: "",
      from: "2026/04/01",
      limit: "500",
      status: "bad-status",
      to: "2026/04/30",
    });

    expect(invalid.errors).toContain("accountId must be a non-empty string when provided.");
    expect(invalid.errors).toContain("from must use YYYY-MM-DD format.");
    expect(invalid.errors).toContain("to must use YYYY-MM-DD format.");
    expect(invalid.errors).toContain("status must be one of cleared, pending, or deleted.");
    expect(invalid.errors).toContain("limit must be an integer between 1 and 200.");
    expect(invalid.errors).toContain("cursor must be a non-empty string when provided.");
  });

  it("validates transaction attachment link payload", () => {
    const valid = validateLinkTransactionAttachmentBody({ payload: { attachmentId: "att-1" } });
    expect("errors" in valid).toBe(false);

    const missing = validateLinkTransactionAttachmentBody({});
    expect("errors" in missing).toBe(true);
    if ("errors" in missing) {
      expect(missing.errors).toContain("payload is required.");
    }
  });
});
