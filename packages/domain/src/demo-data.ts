import { createMoney } from "./accounting";
import type {
  BaselineBudgetLine,
  Envelope,
  EnvelopeAllocation,
  ScheduledTransaction,
  Transaction,
} from "./types";

export const demoTransactions: Transaction[] = [
  {
    id: "txn-paycheck-1",
    occurredOn: "2026-04-01",
    description: "April paycheck",
    payee: "Employer Inc.",
    postings: [
      { accountId: "acct-checking", amount: createMoney("USD", 3200) },
      { accountId: "acct-income-salary", amount: createMoney("USD", -3200) }
    ],
    tags: ["income", "payroll"]
  },
  {
    id: "txn-grocery-1",
    occurredOn: "2026-04-02",
    description: "Weekly groceries",
    payee: "Neighborhood Market",
    postings: [
      { accountId: "acct-expense-groceries", amount: createMoney("USD", 148.42) },
      { accountId: "acct-checking", amount: createMoney("USD", -148.42), cleared: true }
    ],
    tags: ["household"]
  }
];

export const demoBaselineBudget: BaselineBudgetLine[] = [
  {
    accountId: "acct-expense-housing",
    period: "2026-04",
    budgetPeriod: "monthly",
    plannedAmount: createMoney("USD", 1400)
  },
  {
    accountId: "acct-expense-groceries",
    period: "2026-04",
    budgetPeriod: "monthly",
    plannedAmount: createMoney("USD", 650)
  },
  {
    accountId: "acct-expense-utilities",
    period: "2026-04",
    budgetPeriod: "monthly",
    plannedAmount: createMoney("USD", 300)
  }
];

export const demoEnvelopes: Envelope[] = [
  {
    id: "env-groceries",
    name: "Groceries",
    expenseAccountId: "acct-expense-groceries",
    fundingAccountId: "acct-checking",
    targetAmount: createMoney("USD", 650),
    availableAmount: createMoney("USD", 501.58),
    rolloverEnabled: true
  },
  {
    id: "env-utilities",
    name: "Utilities",
    expenseAccountId: "acct-expense-utilities",
    fundingAccountId: "acct-checking",
    targetAmount: createMoney("USD", 300),
    availableAmount: createMoney("USD", 300),
    rolloverEnabled: true
  }
];

export const demoEnvelopeAllocations: EnvelopeAllocation[] = [
  {
    id: "alloc-groceries-april",
    envelopeId: "env-groceries",
    occurredOn: "2026-04-01",
    amount: createMoney("USD", 650),
    type: "fund",
    note: "Monthly grocery funding"
  },
  {
    id: "alloc-utilities-april",
    envelopeId: "env-utilities",
    occurredOn: "2026-04-01",
    amount: createMoney("USD", 300),
    type: "fund",
    note: "Monthly utilities funding"
  }
];

export const demoSchedules: ScheduledTransaction[] = [
  {
    id: "sched-rent",
    name: "Monthly Rent",
    frequency: "monthly",
    nextDueOn: "2026-05-01",
    autoPost: false,
    templateTransaction: {
      description: "Monthly rent",
      payee: "Property Management Co.",
      postings: [
        { accountId: "acct-expense-housing", amount: createMoney("USD", 1400) },
        { accountId: "acct-checking", amount: createMoney("USD", -1400) }
      ],
      tags: ["housing", "scheduled"]
    }
  }
];
