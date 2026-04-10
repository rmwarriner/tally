import { useCallback, useEffect, useState } from "react";
import {
  ApiClientError,
  fetchBooks,
  fetchDashboard,
  fetchBook,
  type DashboardResponse,
  type BookResponse,
} from "./api";

interface UseBookRuntimeInput {
  range: { from: string; to: string };
  bookId: string;
}

const LAST_BOOK_ID_STORAGE_KEY = "tally:last-book-id";

function readStoredBookId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(LAST_BOOK_ID_STORAGE_KEY);
  return value && value.trim().length > 0 ? value : null;
}

function writeStoredBookId(bookId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LAST_BOOK_ID_STORAGE_KEY, bookId);
}

export function useBookRuntime(input: UseBookRuntimeInput) {
  const [activeBookId, setActiveBookId] = useState(() => readStoredBookId() ?? input.bookId);
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
      const booksResponse = await fetchBooks();
      const availableBookIds = booksResponse.books.map((book) => book.id);
      const targetBookId = availableBookIds.includes(activeBookId)
        ? activeBookId
        : availableBookIds[0];

      if (!targetBookId) {
        throw new Error("No workspaces are available.");
      }

      const [bookResponse, dashboardResponse] = await Promise.all([
        fetchBook(targetBookId),
        fetchDashboard({ ...input.range, bookId: targetBookId }),
      ]);

      setBook(bookResponse.book);
      setDashboard(dashboardResponse.dashboard);
      setActiveBookId(targetBookId);
      writeStoredBookId(targetBookId);
    } catch (loadError) {
      if (loadError instanceof ApiClientError && loadError.code === "book.not_found") {
        setError("No available workspace matched the selected workspace.");
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Failed to load book.");
    } finally {
      setLoading(false);
    }
  }, [activeBookId, input.range]);

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
    activeBookId,
    book,
    busy,
    dashboard,
    error,
    loading,
    runMutation,
    statusMessage,
  };
}
