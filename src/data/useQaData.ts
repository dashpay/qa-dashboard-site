import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppConfig } from '../config';
import { isConfigured } from '../config';
import { fetchLookups, fetchRunsForTest, fetchTestCases, fetchTestRuns } from '../sdk/documents';
import type { Lookups, TestCase, TestRun } from '../sdk/types';

export interface QaData {
  cases: TestCase[];
  runs: TestRun[];
  loadedAt: number;
}

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseQaDataResult {
  status: LoadStatus;
  data: QaData | null;
  error: Error | null;
  /** Full reload (cases + lookups + runs), with a loading state. */
  reload: () => void;
  /** Re-fetch all runs and merge any added since the last check (no reload flash). */
  refreshRuns: () => Promise<number>;
  /** Re-fetch one test's runs and merge them in. */
  refreshTest: (testId: string) => Promise<void>;
  /** True while a runs/test refresh is in flight. */
  refreshing: boolean;
}

/** Union runs by document id (append-only log → new docs are new runs).
 *  When replaceTestId is set, that test's existing runs are dropped first. */
function mergeRuns(prev: TestRun[], incoming: TestRun[], replaceTestId?: string): TestRun[] {
  const base = replaceTestId ? prev.filter((r) => r.testId !== replaceTestId) : prev;
  const byId = new Map(base.map((r) => [r.documentId, r]));
  for (const r of incoming) byId.set(r.documentId, r);
  return [...byId.values()].sort((a, b) => b.executedAt - a.executedAt);
}

/**
 * Load the dash-qa data set (test cases + recent runs) for the given config.
 * Re-runs whenever the contract id / network changes.
 */
export function useQaData(config: AppConfig | null): UseQaDataResult {
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [data, setData] = useState<QaData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Refs so refresh callbacks read current state without re-creating themselves.
  const lookupsRef = useRef<Lookups | null>(null);
  const dataRef = useRef<QaData | null>(null);
  dataRef.current = data;

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const key = config ? `${config.network}|${config.devnetName ?? ''}|${config.contractId}` : '';

  useEffect(() => {
    if (!config || !isConfigured(config)) {
      setStatus('idle');
      setData(null);
      setError(null);
      lookupsRef.current = null;
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setError(null);

    (async () => {
      try {
        // Lookups (tier/category/app code→name) first, so normalised v3+
        // contracts resolve FK codes; empty for older string-typed contracts.
        const lookups = await fetchLookups(config);
        const [cases, runs] = await Promise.all([
          fetchTestCases(config, lookups),
          fetchTestRuns(config, lookups),
        ]);
        if (cancelled) return;
        lookupsRef.current = lookups;
        setData({ cases, runs, loadedAt: Date.now() });
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  const refreshRuns = useCallback(async (): Promise<number> => {
    if (!config || !isConfigured(config) || !dataRef.current) return 0;
    setRefreshing(true);
    try {
      const incoming = await fetchTestRuns(config, lookupsRef.current ?? undefined);
      const prev = dataRef.current;
      if (!prev) return 0;
      const known = new Set(prev.runs.map((r) => r.documentId));
      const added = incoming.filter((r) => !known.has(r.documentId)).length;
      setData({ ...prev, runs: mergeRuns(prev.runs, incoming), loadedAt: Date.now() });
      return added;
    } finally {
      setRefreshing(false);
    }
  }, [config]);

  const refreshTest = useCallback(
    async (testId: string): Promise<void> => {
      if (!config || !isConfigured(config) || !dataRef.current) return;
      setRefreshing(true);
      try {
        const owner = dataRef.current.runs.find((r) => r.ownerId)?.ownerId;
        const incoming = await fetchRunsForTest(config, testId, lookupsRef.current ?? undefined, owner);
        const prev = dataRef.current;
        if (!prev) return;
        setData({ ...prev, runs: mergeRuns(prev.runs, incoming, testId), loadedAt: Date.now() });
      } finally {
        setRefreshing(false);
      }
    },
    [config],
  );

  return { status, data, error, reload, refreshRuns, refreshTest, refreshing };
}
