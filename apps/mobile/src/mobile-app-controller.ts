import { useReducer, useState } from "react";
import type { ScheduleFrequency, Transaction } from "@gnucash-ng/domain";
import { createMobileApiClient, type DashboardResponse, type WorkspaceResponse } from "./api";
import { createScheduleForm, type ScheduleFormState } from "./schedule-form";
import type { ReconciliationFormValue } from "./ReconciliationCapture";

export const aprilRange = { from: "2026-04-01", to: "2026-04-30" };
export const defaultWorkspaceId = "workspace-household-demo";
export const defaultApiBaseUrl = "http://127.0.0.1:3000";
export const scheduleFrequencies: ScheduleFrequency[] = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "annually",
];

interface AppStatusState {
  busy: string | null;
  error: string | null;
  loading: boolean;
  statusMessage: string | null;
}

type AppStatusAction =
  | { type: "load_start" }
  | { type: "load_finish" }
  | { type: "load_error"; message: string }
  | { type: "mutation_start"; label: string }
  | { type: "mutation_success"; label: string }
  | { type: "mutation_error"; message: string };

const initialAppStatusState: AppStatusState = {
  busy: null,
  error: null,
  loading: true,
  statusMessage: null,
};

function appStatusReducer(state: AppStatusState, action: AppStatusAction): AppStatusState {
  switch (action.type) {
    case "load_start":
      return {
        ...state,
        error: null,
        loading: true,
      };
    case "load_finish":
      return {
        ...state,
        loading: false,
      };
    case "load_error":
      return {
        ...state,
        error: action.message,
        loading: false,
      };
    case "mutation_start":
      return {
        ...state,
        busy: action.label,
        error: null,
        statusMessage: null,
      };
    case "mutation_success":
      return {
        ...state,
        busy: null,
        statusMessage: `${action.label} completed.`,
      };
    case "mutation_error":
      return {
        ...state,
        busy: null,
        error: action.message,
      };
    default:
      return state;
  }
}

function createReconciliationForm(accountId = "acct-checking"): ReconciliationFormValue {
  return {
    accountId,
    reconciliationId: "",
    statementBalance: "",
    statementDate: "2026-04-30",
  };
}

export function createReconciliationTransactionMap(
  transactions: Transaction[],
  accountId: string,
): Record<string, boolean> {
  return Object.fromEntries(
    transactions
      .filter((transaction) => transaction.postings.some((posting) => posting.accountId === accountId))
      .map((transaction) => [
        transaction.id,
        transaction.postings.some((posting) => posting.accountId === accountId && posting.cleared === true),
      ]),
  );
}

export function useMobileAppController() {
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl);
  const [apiKey, setApiKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId);
  const [workspace, setWorkspace] = useState<WorkspaceResponse["workspace"] | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse["dashboard"] | null>(null);
  const [appStatus, dispatchAppStatus] = useReducer(appStatusReducer, initialAppStatusState);
  const [selectedScheduleId, setSelectedScheduleId] = useState("sched-rent");
  const [transactionForm, setTransactionForm] = useState({
    amount: "14.25",
    date: "2026-04-03",
    description: "Coffee and snacks",
    expenseAccountId: "acct-expense-groceries",
    payee: "Corner Market",
  });
  const [allocationForm, setAllocationForm] = useState({
    amount: "75",
    envelopeId: "env-groceries",
    note: "Weekly grocery top-up",
    occurredOn: "2026-04-03",
    type: "fund" as "fund" | "release",
  });
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(() => createScheduleForm());
  const [scheduleExceptionForm, setScheduleExceptionForm] = useState({
    nextDueOn: "2026-05-05",
    note: "Grace period",
  });
  const [reconciliationForm, setReconciliationForm] = useState<ReconciliationFormValue>(() =>
    createReconciliationForm(),
  );
  const [selectedReconciliationTransactionIds, setSelectedReconciliationTransactionIds] = useState<
    Record<string, boolean>
  >({});

  async function loadWorkspaceData() {
    dispatchAppStatus({ type: "load_start" });

    try {
      const client = createMobileApiClient({
        apiBaseUrl,
        apiKey: apiKey.trim() || undefined,
      });
      const [workspaceResponse, dashboardResponse] = await Promise.all([
        client.fetchWorkspace(workspaceId.trim()),
        client.fetchDashboard({
          ...aprilRange,
          workspaceId: workspaceId.trim(),
        }),
      ]);

      setWorkspace(workspaceResponse.workspace);
      setDashboard(dashboardResponse.dashboard);

      const activeSchedule =
        workspaceResponse.workspace.scheduledTransactions.find((schedule) => schedule.id === selectedScheduleId) ??
        workspaceResponse.workspace.scheduledTransactions[0];

      if (activeSchedule) {
        setSelectedScheduleId(activeSchedule.id);
        setScheduleForm(createScheduleForm(activeSchedule));
      }

      const reconciliationAccounts = workspaceResponse.workspace.accounts.filter(
        (account) => account.type === "asset" || account.type === "liability",
      );
      const activeReconciliationAccountId =
        reconciliationAccounts.find((account) => account.id === reconciliationForm.accountId)?.id ??
        reconciliationAccounts[0]?.id ??
        workspaceResponse.workspace.accounts[0]?.id ??
        "acct-checking";
      const activeReconciliationTransactions = workspaceResponse.workspace.transactions.filter(
        (transaction) =>
          transaction.postings.some((posting) => posting.accountId === activeReconciliationAccountId),
      );

      setReconciliationForm((current) => ({
        ...current,
        accountId: activeReconciliationAccountId,
      }));
      setSelectedReconciliationTransactionIds(
        createReconciliationTransactionMap(activeReconciliationTransactions, activeReconciliationAccountId),
      );
    } catch (loadError) {
      dispatchAppStatus({
        message: loadError instanceof Error ? loadError.message : "Failed to load mobile workspace.",
        type: "load_error",
      });
    } finally {
      dispatchAppStatus({ type: "load_finish" });
    }
  }

  async function runMutation(label: string, operation: () => Promise<void>) {
    try {
      dispatchAppStatus({ label, type: "mutation_start" });
      await operation();
      await loadWorkspaceData();
      dispatchAppStatus({ label, type: "mutation_success" });
    } catch (mutationError) {
      dispatchAppStatus({
        message: mutationError instanceof Error ? mutationError.message : `${label} failed.`,
        type: "mutation_error",
      });
    }
  }

  return {
    allocationForm,
    apiBaseUrl,
    apiKey,
    busy: appStatus.busy,
    dashboard,
    error: appStatus.error,
    loadWorkspaceData,
    loading: appStatus.loading,
    reconciliationForm,
    runMutation,
    scheduleExceptionForm,
    scheduleForm,
    selectedReconciliationTransactionIds,
    selectedScheduleId,
    setAllocationForm,
    setApiBaseUrl,
    setApiKey,
    setReconciliationForm,
    setScheduleExceptionForm,
    setScheduleForm,
    setSelectedReconciliationTransactionIds,
    setSelectedScheduleId,
    setTransactionForm,
    setWorkspaceId,
    statusMessage: appStatus.statusMessage,
    transactionForm,
    workspace,
    workspaceId,
  };
}
