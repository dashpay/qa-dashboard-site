import type { TestCaseView } from '../data/compute';
import { ImplBadge, ResultBadge } from './badges';
import { Evidence } from './EvidenceLink';
import { formatTimestamp, truncateMiddle } from '../format';

interface Props {
  view: TestCaseView | null;
  onClose: () => void;
}

/** Drill-in panel: the full run history for one test case. */
export function RunHistory({ view, onClose }: Props) {
  if (!view) return null;
  const tc = view.testCase;

  return (
    <aside className="drawer" role="dialog" aria-label={`Run history for ${tc.testId}`}>
      <div className="drawer-header">
        <div>
          <h2 className="drawer-title">
            {tc.testId} <ResultBadge result={view.latestResult} />
          </h2>
          <p className="drawer-subtitle">{tc.title}</p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <dl className="meta-grid">
        <div>
          <dt>Tier</dt>
          <dd>{tc.tier ?? '—'}</dd>
        </div>
        <div>
          <dt>Layer</dt>
          <dd>{tc.layer ?? '—'}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{tc.category ?? '—'}</dd>
        </div>
        <div>
          <dt>Impl</dt>
          <dd>
            <ImplBadge status={tc.implStatus} />
          </dd>
        </div>
        {tc.app && (
          <div>
            <dt>App</dt>
            <dd>{tc.app}</dd>
          </div>
        )}
      </dl>

      {tc.description && <p className="drawer-desc">{tc.description}</p>}
      {tc.entryPoint && (
        <p className="drawer-desc">
          <strong>Entry point:</strong> {tc.entryPoint}
        </p>
      )}
      {tc.prerequisites && (
        <p className="drawer-desc">
          <strong>Prerequisites:</strong> {tc.prerequisites}
        </p>
      )}
      {tc.planCommit && (
        <p className="drawer-desc muted">
          <strong>Plan commit:</strong> <code className="mono">{tc.planCommit}</code>
        </p>
      )}

      <h3 className="drawer-section">Run history ({view.history.length})</h3>
      {view.history.length === 0 ? (
        <p className="muted">No runs recorded for this test in the loaded window.</p>
      ) : (
        <ul className="run-history">
          {view.history.map((run) => (
            <li key={run.documentId} className="run-item">
              <div className="run-item-head">
                <ResultBadge result={run.result} />
                <span className="run-when" title={formatTimestamp(run.executedAt)}>
                  {formatTimestamp(run.executedAt)}
                </span>
              </div>
              <div className="run-item-meta">
                {run.network && <span className="chip">{run.network}</span>}
                {run.buildRef && (
                  <span className="chip mono" title={run.buildRef}>
                    {truncateMiddle(run.buildRef, 12, 8)}
                  </span>
                )}
                {run.app && <span className="chip subtle">{run.app}</span>}
                {run.device && <span className="chip subtle">{run.device}</span>}
                <Evidence run={run} />
              </div>
              {run.blockerReason && (
                <p className="run-notes">
                  <strong>Blocked:</strong> {run.blockerReason}
                </p>
              )}
              {run.notes && <p className="run-notes">{run.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
