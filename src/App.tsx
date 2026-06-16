import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppConfig } from './config';
import { isConfigured, loadConfig } from './config';
import { resetConnections } from './sdk/client';
import { useQaData } from './data/useQaData';
import {
  applyFilters,
  buildMatrix,
  buildSummary,
  buildViews,
  deriveFilterOptions,
  EMPTY_FILTERS,
  type Filters,
} from './data/compute';
import { truncateMiddle } from './format';
import { SummaryCounts } from './components/SummaryCounts';
import { StatusMatrix } from './components/StatusMatrix';
import { FilterBar } from './components/Filters';
import { TestList } from './components/TestList';
import { RunHistory } from './components/RunHistory';
import { SettingsPanel } from './components/SettingsPanel';

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configVersion, setConfigVersion] = useState(0);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  // Deep-link support: ?test=CORE-05 opens that test's run history on load.
  const [selectedTestId, setSelectedTestId] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get('test');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let cancelled = false;
    loadConfig().then((c) => {
      if (!cancelled) setConfig(c);
    });
    return () => {
      cancelled = true;
    };
  }, [configVersion]);

  const onApplySettings = useCallback(() => {
    resetConnections();
    setConfig(null);
    setConfigVersion((v) => v + 1);
  }, []);

  const { status, data, error, reload, refreshRuns, refreshTest, refreshing } = useQaData(config);
  const [refreshingTestId, setRefreshingTestId] = useState<string | null>(null);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  const onRefreshTest = useCallback(
    async (testId: string) => {
      setRefreshingTestId(testId);
      try {
        await refreshTest(testId);
      } finally {
        setRefreshingTestId(null);
      }
    },
    [refreshTest],
  );

  const onRefreshRuns = useCallback(async () => {
    const added = await refreshRuns();
    setRefreshNote(added > 0 ? `+${added} new run${added === 1 ? '' : 's'}` : 'up to date');
    window.setTimeout(() => setRefreshNote(null), 4000);
  }, [refreshRuns]);

  const options = useMemo(
    () => (data ? deriveFilterOptions(data.cases, data.runs) : null),
    [data],
  );

  const views = useMemo(() => {
    if (!data) return [];
    return buildViews(data.cases, data.runs, {
      app: filters.app,
      network: filters.network,
      buildRef: filters.buildRef,
    });
  }, [data, filters.app, filters.network, filters.buildRef]);

  const summary = useMemo(() => buildSummary(views), [views]);
  const matrix = useMemo(() => buildMatrix(views), [views]);
  const filtered = useMemo(() => applyFilters(views, filters), [views, filters]);

  const selectedView = useMemo(
    () => views.find((v) => v.testCase.testId === selectedTestId) ?? null,
    [views, selectedTestId],
  );

  const onSelectCell = useCallback((tier: Filters['tier'], category: Filters['category']) => {
    setFilters((f) =>
      f.tier === tier && f.category === category
        ? { ...f, tier: null, category: null }
        : { ...f, tier, category },
    );
  }, []);

  const configured = config !== null && isConfigured(config);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1>Dash Platform QA Dashboard</h1>
          {config && (
            <p className="brand-sub">
              <span className="chip">{config.network}</span>
              {config.contractId ? (
                <span className="chip mono" title={config.contractId}>
                  {truncateMiddle(config.contractId, 6, 6)}
                </span>
              ) : (
                <span className="chip warn">no contract configured</span>
              )}
              <span className="read-only-tag" title="v1 is read-only — no signing or wallet">
                read-only
              </span>
            </p>
          )}
        </div>
        <div className="header-actions">
          {options && options.apps.length > 0 && (
            <label className="app-scope">
              <span>App</span>
              <select
                value={filters.app ?? ''}
                onChange={(e) => setFilters((f) => ({ ...f, app: e.target.value || null }))}
                aria-label="Application"
              >
                <option value="">All apps</option>
                {options.apps.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          )}
          {configured && status === 'ready' && (
            <button type="button" className="link-button" onClick={reload}>
              ↻ Refresh
            </button>
          )}
        </div>
      </header>

      {config === null && <p className="status-line">Loading configuration…</p>}

      {config !== null && (
        <SettingsPanel config={config} onApply={onApplySettings} startOpen={!configured} />
      )}

      {configured && (
        <main className="app-main">
          {status === 'loading' && (
            <p className="status-line">
              Connecting to <strong>{config!.network}</strong> and verifying proofs…
            </p>
          )}

          {status === 'error' && error && (
            <div className="error-box" role="alert">
              <strong>Couldn’t load data.</strong>
              <p>{error.message}</p>
              <p className="muted">
                Check the contract id and network, then try again. The contract must exist on the
                selected network and expose <code>{config!.testCaseDocumentType}</code> /{' '}
                <code>{config!.testRunDocumentType}</code> document types.
              </p>
              <button type="button" className="primary" onClick={reload}>
                Retry
              </button>
            </div>
          )}

          {status === 'ready' && data && options && (
            <>
              <SummaryCounts summary={summary} />

              <h2 className="section-title">Status matrix — tier × category</h2>
              <p className="section-hint">
                Each cell shows the number of test cases and a breakdown of their{' '}
                <em>latest</em> result. Click a cell to filter the list below.
              </p>
              <StatusMatrix
                tiers={matrix.tiers}
                categories={matrix.categories}
                cells={matrix.cells}
                onSelect={onSelectCell}
                selected={{ tier: filters.tier, category: filters.category }}
              />

              <h2 className="section-title">Test cases</h2>
              <FilterBar
                filters={filters}
                options={options}
                onChange={setFilters}
                resultCount={filtered.length}
                totalCount={views.length}
                onRefresh={onRefreshRuns}
                refreshing={refreshing}
                refreshNote={refreshNote}
              />
              <div className="list-wrap">
                <TestList
                  views={filtered}
                  selectedTestId={selectedTestId}
                  onSelect={(id) => setSelectedTestId((cur) => (cur === id ? null : id))}
                  onRefreshTest={onRefreshTest}
                  refreshingTestId={refreshingTestId}
                />
              </div>

              <p className="data-footnote muted">
                Loaded {data.cases.length} test cases and {data.runs.length} runs ·{' '}
                {new Date(data.loadedAt).toLocaleTimeString()}
              </p>
            </>
          )}
        </main>
      )}

      {selectedView && (
        <>
          <div className="drawer-scrim" onClick={() => setSelectedTestId(null)} />
          <RunHistory view={selectedView} onClose={() => setSelectedTestId(null)} />
        </>
      )}

      <footer className="app-footer muted">
        Read-only view of the on-chain <code>dash-qa</code> contract · built with the Evo SDK
        (proof-verified)
      </footer>
    </div>
  );
}
