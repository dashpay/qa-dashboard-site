import type { Summary } from '../data/compute';
import { RUN_RESULTS } from '../sdk/types';
import { RESULT_LABEL } from '../sdk/types';
import { formatRelative } from '../format';

export function SummaryCounts({ summary }: { summary: Summary }) {
  return (
    <section className="summary" aria-label="Summary">
      <div className="summary-grid">
        <Stat label="Test cases" value={summary.totalCases} />
        <Stat label="Runs (window)" value={summary.totalRuns} />
        <Stat label="Builds" value={summary.distinctBuilds} />
        <Stat label="Networks" value={summary.distinctNetworks} />
        <Stat label="Last run" value={formatRelative(summary.lastRunAt)} />
        {summary.orphanCount > 0 && (
          <Stat label="Orphan runs" value={summary.orphanCount} hint="runs with no matching test case" />
        )}
      </div>
      <div className="result-tally" role="list" aria-label="Latest result breakdown">
        {RUN_RESULTS.map((r) => (
          <div key={r} role="listitem" className={`tally tally-${r}`}>
            <span className="tally-count">{summary.resultCounts[r]}</span>
            <span className="tally-label">{RESULT_LABEL[r]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="stat" title={hint}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
