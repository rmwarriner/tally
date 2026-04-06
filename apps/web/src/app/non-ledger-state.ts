import { useState } from "react";

export function useNonLedgerFormState() {
  const [reconciliationForm, setReconciliationForm] = useState({
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
  const [csvForm, setCsvForm] = useState({
    csvText: "2026-04-04,Bus pass,45,acct-expense-transport,acct-checking",
    sourceLabel: "manual.csv",
  });
  const [budgetLineForm, setBudgetLineForm] = useState({
    accountId: "acct-expense-groceries",
    budgetPeriod: "monthly",
    period: "2026-05",
    plannedAmount: "700",
  });
  const [envelopeForm, setEnvelopeForm] = useState({
    availableAmount: "150",
    expenseAccountId: "acct-expense-housing",
    fundingAccountId: "acct-checking",
    id: "env-housing",
    name: "Housing Buffer",
    rolloverEnabled: true,
    targetAmount: "150",
  });
  const [envelopeAllocationForm, setEnvelopeAllocationForm] = useState({
    amount: "50",
    envelopeId: "env-groceries",
    note: "Mid-month top-up",
    occurredOn: "2026-04-15",
    type: "fund",
  });
  const [scheduleForm, setScheduleForm] = useState({
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
