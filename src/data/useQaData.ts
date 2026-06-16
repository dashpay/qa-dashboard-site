import { useCallback, useEffect, useState } from 'react';
import type { AppConfig } from '../config';
import { isConfigured } from '../config';
import { fetchLookups, fetchTestCases, fetchTestRuns } from '../sdk/documents';
import type { TestCase, TestRun } from '../sdk/types';

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
  reload: () => void;
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

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const key = config ? `${config.network}|${config.devnetName ?? ''}|${config.contractId}` : '';

  useEffect(() => {
    if (!config || !isConfigured(config)) {
      setStatus('idle');
      setData(null);
      setError(null);
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

  return { status, data, error, reload };
}
