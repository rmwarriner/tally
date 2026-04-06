import {
  demoBaselineBudget,
  demoEnvelopeAllocations,
  demoEnvelopes,
  demoSchedules,
  demoTransactions,
  starterChartOfAccounts,
  type Commodity,
} from "@gnucash-ng/domain";
import type { FinanceWorkspaceDocument } from "./types";

const defaultCommodities: Commodity[] = [
  {
    code: "USD",
    name: "US Dollar",
    type: "fiat",
    precision: 2,
  },
];

export function createDemoWorkspace(): FinanceWorkspaceDocument {
  return {
    schemaVersion: 1,
    id: "workspace-household-demo",
    name: "Household Finance",
    baseCommodityCode: "USD",
    householdMembers: ["Primary", "Partner"],
    householdMemberRoles: {
      Partner: "member",
      Primary: "guardian",
    },
    commodities: defaultCommodities,
    accounts: starterChartOfAccounts,
    transactions: demoTransactions,
    scheduledTransactions: demoSchedules,
    baselineBudgetLines: demoBaselineBudget,
    envelopes: demoEnvelopes,
    envelopeAllocations: demoEnvelopeAllocations,
    importBatches: [],
    reconciliationSessions: [],
    closePeriods: [],
    auditEvents: [],
  };
}
