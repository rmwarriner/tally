export type WorkspaceView =
  | "overview"
  | "ledger"
  | "budget"
  | "envelopes"
  | "imports"
  | "automations"
  | "reports";

export interface WorkspaceViewDefinition {
  description: string;
  detail: string;
  emptyMessage: string;
  id: WorkspaceView;
  label: string;
  shortLabel: string;
  title: string;
}

export interface OverviewCard {
  id: WorkspaceView;
  metric: string;
  summary: string;
}

export const workspaceViews: WorkspaceViewDefinition[] = [
  {
    description: "Cross-workspace operating picture with next actions and integrity status.",
    detail: "Command center",
    emptyMessage: "Overview keeps the current operating picture and next actions in one place.",
    id: "overview",
    label: "Overview",
    shortLabel: "OV",
    title: "Household operating picture",
  },
  {
    description: "Dense register and reconciliation flows for balanced ledger work.",
    detail: "Double-entry workspace",
    emptyMessage: "Register activity will appear here as transactions are captured.",
    id: "ledger",
    label: "Ledger",
    shortLabel: "LE",
    title: "Ledger register",
  },
  {
    description: "Baseline planning view for plan-of-record budget maintenance.",
    detail: "Plan of record",
    emptyMessage: "Budget lines will appear here once the baseline is configured.",
    id: "budget",
    label: "Budget",
    shortLabel: "BU",
    title: "Baseline budget",
  },
  {
    description: "Operational cash allocation and funding flows for envelope work.",
    detail: "Operational budgeting",
    emptyMessage: "Envelope funding state will appear here once categories are configured.",
    id: "envelopes",
    label: "Envelopes",
    shortLabel: "EN",
    title: "Envelope operations",
  },
  {
    description: "Imports and future interchange adapters routed through the service boundary.",
    detail: "Data interchange",
    emptyMessage: "Imports are not configured yet.",
    id: "imports",
    label: "Imports",
    shortLabel: "IM",
    title: "Import workbench",
  },
  {
    description: "Recurring templates, due items, and schedule maintenance.",
    detail: "Automation control",
    emptyMessage: "Scheduled workflows will appear here once recurring items are configured.",
    id: "automations",
    label: "Automations",
    shortLabel: "AU",
    title: "Automation queue",
  },
  {
    description: "Reporting workspace placeholder while close and reporting flows are still on the roadmap.",
    detail: "Reporting roadmap",
    emptyMessage: "Reporting is planned but not yet implemented.",
    id: "reports",
    label: "Reports",
    shortLabel: "RE",
    title: "Reporting and close",
  },
];

export function getWorkspaceViewDefinition(view: WorkspaceView): WorkspaceViewDefinition {
  const definition = workspaceViews.find((candidate) => candidate.id === view);

  if (!definition) {
    throw new Error(`Unknown workspace view: ${view}`);
  }

  return definition;
}

export function createOverviewCards(input: {
  accountBalanceCount: number;
  budgetIssueCount: number;
  dueTransactionCount: number;
  envelopeCount: number;
  ledgerIssueCount: number;
}): OverviewCard[] {
  return [
    {
      id: "ledger",
      metric: `${input.accountBalanceCount}`,
      summary: "accounts with live balances",
    },
    {
      id: "budget",
      metric: `${input.budgetIssueCount}`,
      summary: input.budgetIssueCount === 1 ? "budget issue to review" : "budget issues to review",
    },
    {
      id: "envelopes",
      metric: `${input.envelopeCount}`,
      summary: input.envelopeCount === 1 ? "envelope category active" : "envelope categories active",
    },
    {
      id: "automations",
      metric: `${input.dueTransactionCount}`,
      summary:
        input.dueTransactionCount === 1 ? "scheduled item due soon" : "scheduled items due soon",
    },
    {
      id: "reports",
      metric: `${input.ledgerIssueCount}`,
      summary: input.ledgerIssueCount === 1 ? "ledger warning surfaced" : "ledger warnings surfaced",
    },
  ];
}
