import type { Account } from "./types";

export const starterChartOfAccounts: Account[] = [
  { id: "acct-checking", code: "1000", name: "Checking", type: "asset", isEnvelopeFundingSource: true },
  { id: "acct-savings", code: "1010", name: "Savings", type: "asset" },
  { id: "acct-credit-card", code: "2000", name: "Credit Card", type: "liability" },
  { id: "acct-equity", code: "3000", name: "Opening Balances", type: "equity" },
  { id: "acct-income-salary", code: "4000", name: "Salary", type: "income" },
  { id: "acct-income-interest", code: "4010", name: "Interest Income", type: "income" },
  { id: "acct-expense-housing", code: "5000", name: "Housing", type: "expense" },
  { id: "acct-expense-groceries", code: "5010", name: "Groceries", type: "expense" },
  { id: "acct-expense-transport", code: "5020", name: "Transport", type: "expense" },
  { id: "acct-expense-utilities", code: "5030", name: "Utilities", type: "expense" }
];
