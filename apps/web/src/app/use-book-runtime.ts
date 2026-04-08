import { useCallback, useEffect, useState } from "react";
import { fetchDashboard, fetchBook, type DashboardResponse, type BookResponse } from "./api";

interface UseBookRuntimeInput {
  range: { from: string; to: string };
  bookId: string;
}

export function useBookRuntime(input: UseBookRuntimeInput) {
  const [dashboard, setDashboard] = useState<DashboardResponse["dashboard"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [book, setBook] = useState<BookResponse["book"] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadBookData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [bookResponse, dashboardResponse] = await Promise.all([
        fetchBook(input.bookId),
        fetchDashboard({ ...input.range, bookId: input.bookId }),
      ]);

      setBook(bookResponse.book);
      setDashboard(dashboardResponse.dashboard);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load book.");
    } finally {
      setLoading(false);
    }
  }, [input.range, input.bookId]);

  useEffect(() => {
    void loadBookData();
  }, [loadBookData]);

  const runMutation = useCallback(
    async (label: string, operation: () => Promise<void>) => {
      try {
        setBusy(label);
        setStatusMessage(null);
        setError(null);
        await operation();
        await loadBookData();
        setStatusMessage(`${label} completed.`);
      } catch (mutationError) {
        setError(mutationError instanceof Error ? mutationError.message : `${label} failed.`);
      } finally {
        setBusy(null);
      }
    },
    [loadBookData],
  );

  return {
    book,
    busy,
    dashboard,
    error,
    loading,
    runMutation,
    statusMessage,
  };
}
