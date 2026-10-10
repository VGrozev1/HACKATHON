"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type Result<T> = { key: string; data?: T; error?: Error };

/**
 * Runs an async loader from src/lib/api.ts and tracks loading / error / data.
 * `key` identifies the request: change it (e.g. a new machine id) to load again.
 */
export function useAsync<T>(load: () => Promise<T>, key: string) {
  const loadRef = useRef(load);
  useLayoutEffect(() => {
    loadRef.current = load;
  });

  const [attempt, setAttempt] = useState(0);
  const requestKey = `${key}#${attempt}`;
  const [result, setResult] = useState<Result<T>>({ key: "" });
  // Optimistic local edits (e.g. an order just approved) without a refetch.
  const [override, setOverride] = useState<{ key: string; data: T } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadRef.current().then(
      (data) => !cancelled && setResult({ key: requestKey, data }),
      (error: unknown) =>
        !cancelled &&
        setResult({ key: requestKey, error: error instanceof Error ? error : new Error(String(error)) }),
    );
    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  const current = result.key === requestKey ? result : null;
  const data = override?.key === requestKey ? override.data : current?.data;
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // mutate() applies `update` to the latest data, not to what the caller saw when it
  // rendered, so an optimistic rollback after an await can't undo other edits.
  const latest = useRef({ key: requestKey, data });
  useLayoutEffect(() => {
    latest.current = { key: requestKey, data: current?.data };
  });
  const mutate = useCallback((update: (prev: T) => T) => {
    setOverride((prev) => {
      const { key, data: loaded } = latest.current;
      const base = prev?.key === key ? prev.data : loaded;
      return base === undefined ? prev : { key, data: update(base) };
    });
  }, []);

  return {
    data,
    error: current?.error,
    loading: current === null,
    retry,
    mutate,
  };
}
