import { useCallback, useEffect, useState } from "react";
import { fetchDashboard, fetchWorkspace, type DashboardResponse, type WorkspaceResponse } from "./api";

interface UseWorkspaceRuntimeInput {
  range: { from: string; to: string };
  workspaceId: string;
}

export function useWorkspaceRuntime(input: UseWorkspaceRuntimeInput) {
  const [dashboard, setDashboard] = useState<DashboardResponse["dashboard"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceResponse["workspace"] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadWorkspaceData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [workspaceResponse, dashboardResponse] = await Promise.all([
        fetchWorkspace(input.workspaceId),
        fetchDashboard({ ...input.range, workspaceId: input.workspaceId }),
      ]);

      setWorkspace(workspaceResponse.workspace);
      setDashboard(dashboardResponse.dashboard);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load workspace.");
    } finally {
      setLoading(false);
    }
  }, [input.range, input.workspaceId]);

  useEffect(() => {
    void loadWorkspaceData();
  }, [loadWorkspaceData]);

  const runMutation = useCallback(
    async (label: string, operation: () => Promise<void>) => {
      try {
        setBusy(label);
        setStatusMessage(null);
        setError(null);
        await operation();
        await loadWorkspaceData();
        setStatusMessage(`${label} completed.`);
      } catch (mutationError) {
        setError(mutationError instanceof Error ? mutationError.message : `${label} failed.`);
      } finally {
        setBusy(null);
      }
    },
    [loadWorkspaceData],
  );

  return {
    busy,
    dashboard,
    error,
    loading,
    runMutation,
    statusMessage,
    workspace,
  };
}
