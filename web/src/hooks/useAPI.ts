import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Tiny stale-while-revalidate cache for API calls.
 *
 * - First call: returns cached data instantly (if any), fetches in background
 * - Subsequent calls: always returns cached data first, refreshes silently
 * - No loading spinner flash on revisited pages
 * - `isLoading` is only true on the very first fetch when there's no cached data
 */

// Module-level cache shared across all hook instances
const cache = new Map<string, { data: unknown; ts: number }>();

// Default stale time: 30 seconds (data older than this triggers a background refetch)
const STALE_MS = 30_000;

interface UseAPIResult<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;       // true only when no cached data AND fetching
  isRefreshing: boolean;    // true when refetching in background (data already shown)
  refresh: () => void;
}

export function useAPI<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: { staleMs?: number; pollMs?: number },
): UseAPIResult<T> {
  const staleMs = opts?.staleMs ?? STALE_MS;
  const pollMs = opts?.pollMs;

  // Initialize from cache
  const cached = cache.get(key);
  const [data, setData] = useState<T | null>((cached?.data as T) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Track if we ever got data (to distinguish loading vs refreshing)
  const hasData = data !== null;

  // Stable fetcher ref
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const doFetch = useCallback(() => {
    setIsRefreshing(true);
    setError(null);

    fetcherRef.current()
      .then((result) => {
        cache.set(key, { data: result, ts: Date.now() });
        setData(result);
      })
      .catch((err) => {
        setError(String(err));
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [key]);

  // Fetch on mount — skip if cache is fresh
  useEffect(() => {
    const entry = cache.get(key);
    if (entry) {
      // Always show cached data immediately
      setData(entry.data as T);
      // Only refetch if stale
      if (Date.now() - entry.ts > staleMs) {
        doFetch();
      }
    } else {
      doFetch();
    }
  }, [key, staleMs, doFetch]);

  // Optional polling
  useEffect(() => {
    if (!pollMs) return;
    const interval = setInterval(doFetch, pollMs);
    return () => clearInterval(interval);
  }, [pollMs, doFetch]);

  return {
    data,
    error,
    isLoading: !hasData && isRefreshing,
    isRefreshing,
    refresh: doFetch,
  };
}

/** Imperatively update a cache entry (e.g. after a mutation) */
export function mutateCache<T>(key: string, updater: (prev: T | null) => T) {
  const entry = cache.get(key);
  const prev = (entry?.data as T) ?? null;
  const next = updater(prev);
  cache.set(key, { data: next, ts: Date.now() });
}

/** Clear a specific cache entry (forces fresh fetch next mount) */
export function invalidateCache(key: string) {
  cache.delete(key);
}
