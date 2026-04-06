import { useState } from "react";

export interface ReconciliationFormState {
  accountId: string;
  statementBalance: string;
  statementDate: string;
}

export interface BudgetLineFormState {
  accountId: string;
  budgetPeriod: "annually" | "monthly" | "quarterly";
  period: string;
  plannedAmount: string;
}

export interface CsvFormState {
  csvText: string;
  sourceLabel: string;
}

export interface EnvelopeFormState {
  availableAmount: string;
  expenseAccountId: string;
  fundingAccountId: string;
  id: string;
  name: string;
  rolloverEnabled: boolean;
  targetAmount: string;
}

export interface EnvelopeAllocationFormState {
  amount: string;
  envelopeId: string;
  note: string;
  occurredOn: string;
  type: "cover-overspend" | "fund" | "release";
}

export interface ScheduleFormState {
  amount: string;
  autoPost: boolean;
  description: string;
  expenseAccountId: string;
  frequency: "annually" | "biweekly" | "daily" | "monthly" | "quarterly" | "weekly";
  fundingAccountId: string;
  id: string;
  name: string;
  nextDueOn: string;
  payee: string;
}

export function useNonLedgerFormState() {
  const [reconciliationForm, setReconciliationForm] = useState<ReconciliationFormState>({
    accountId: "acct-checking",
    statementBalance: "3051.58",
    statementDate: "2026-04-02",
  });
  const [selectedReconciliationTransactionIds, setSelectedReconciliationTransactionIds] = useState<
    Record<string, boolean>
  >({
    "txn-grocery-1": true,
    "txn-paycheck-1": true,
  });
  const [csvForm, setCsvForm] = useState<CsvFormState>({
    csvText: "2026-04-04,Bus pass,45,acct-expense-transport,acct-checking",
    sourceLabel: "manual.csv",
  });
  const [budgetLineForm, setBudgetLineForm] = useState<BudgetLineFormState>({
    accountId: "acct-expense-groceries",
    budgetPeriod: "monthly",
    period: "2026-05",
    plannedAmount: "700",
  });
  const [envelopeForm, setEnvelopeForm] = useState<EnvelopeFormState>({
    availableAmount: "150",
    expenseAccountId: "acct-expense-housing",
    fundingAccountId: "acct-checking",
    id: "env-housing",
    name: "Housing Buffer",
    rolloverEnabled: true,
    targetAmount: "150",
  });
  const [envelopeAllocationForm, setEnvelopeAllocationForm] =
    useState<EnvelopeAllocationFormState>({
    amount: "50",
    envelopeId: "env-groceries",
    note: "Mid-month top-up",
    occurredOn: "2026-04-15",
    type: "fund",
  });
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>({
    amount: "120",
    autoPost: false,
    description: "Monthly utilities",
    expenseAccountId: "acct-expense-utilities",
    frequency: "monthly",
    fundingAccountId: "acct-checking",
    id: "sched-utilities",
    name: "Monthly Utilities",
    nextDueOn: "2026-05-15",
    payee: "City Utilities",
  });

  return {
    budgetLineForm,
    csvForm,
    envelopeAllocationForm,
    envelopeForm,
    reconciliationForm,
    scheduleForm,
    selectedReconciliationTransactionIds,
    setBudgetLineForm,
    setCsvForm,
    setEnvelopeAllocationForm,
    setEnvelopeForm,
    setReconciliationForm,
    setScheduleForm,
    setSelectedReconciliationTransactionIds,
  };
}
