export type UUID = string;

export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "income"
  | "expense";

export type CommodityType = "fiat" | "security" | "crypto" | "points";

export interface Commodity {
  code: string;
  name: string;
  type: CommodityType;
  precision: number;
}

export interface MoneyAmount {
  commodityCode: string;
  quantity: number;
}

export interface Account {
  id: UUID;
  code: string;
  name: string;
  type: AccountType;
  parentAccountId?: UUID;
  isEnvelopeFundingSource?: boolean;
  taxCategory?: string;
}

export interface Posting {
  accountId: UUID;
  amount: MoneyAmount;
  memo?: string;
  cleared?: boolean;
  reconciledAt?: string;
}

export interface Transaction {
  id: UUID;
  occurredOn: string;
  description: string;
  payee?: string;
  postings: Posting[];
  source?: ImportSource;
  tags?: string[];
  scheduleId?: UUID;
}

export type ScheduleFrequency =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "annually";

export interface ScheduledTransaction {
  id: UUID;
  name: string;
  frequency: ScheduleFrequency;
  nextDueOn: string;
  templateTransaction: Omit<Transaction, "id" | "occurredOn">;
  autoPost: boolean;
}

export type BudgetPeriod = "monthly" | "quarterly" | "annually";

export interface BaselineBudgetLine {
  accountId: UUID;
  period: string;
  budgetPeriod: BudgetPeriod;
  plannedAmount: MoneyAmount;
  notes?: string;
}

export interface Envelope {
  id: UUID;
  name: string;
  expenseAccountId: UUID;
  fundingAccountId: UUID;
  targetAmount?: MoneyAmount;
  availableAmount: MoneyAmount;
  rolloverEnabled: boolean;
}

export interface EnvelopeAllocation {
  id: UUID;
  envelopeId: UUID;
  occurredOn: string;
  amount: MoneyAmount;
  type: "fund" | "release" | "cover-overspend";
  note?: string;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface ImportSource {
  provider: "ofx" | "qfx" | "qif" | "csv" | "gnucash-xml";
  fingerprint: string;
  importedAt: string;
  externalReference?: string;
}

export interface ReportDefinition {
  id: UUID;
  name: string;
  kind:
    | "net-worth"
    | "cash-flow"
    | "income-statement"
    | "budget-vs-actual"
    | "envelope-summary";
  from: string;
  to: string;
}
