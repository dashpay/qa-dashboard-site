import type { TestCaseView } from '../data/compute';
import { ImplBadge, ResultBadge } from './badges';
import { formatRelative } from '../format';

interface Props {
  views: TestCaseView[];
  selectedTestId: string | null;
  onSelect: (testId: string) => void;
}

export function TestList({ views, selectedTestId, onSelect }: Props) {
  if (views.length === 0) {
    return <p className="muted empty-state">No test cases match the current filters.</p>;
  }

  return (
    <table className="test-table">
      <thead>
        <tr>
          <th>Test</th>
          <th>Tier</th>
          <th>Layer</th>
          <th>Category</th>
          <th>Impl</th>
          <th>Latest</th>
          <th className="num">Runs</th>
          <th>Last run</th>
        </tr>
      </thead>
      <tbody>
        {views.map((v) => {
          const tc = v.testCase;
          const isSelected = tc.testId === selectedTestId;
          return (
            <tr
              key={tc.documentId}
              className={`test-row ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelect(tc.testId)}
              tabIndex={0}
              role="button"
              aria-pressed={isSelected}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(tc.testId);
                }
              }}
            >
              <td>
                <span className="test-id">
                  {tc.testId}
                  {v.isOrphan && (
                    <span className="orphan-tag" title="Run(s) with no matching test case">
                      orphan
                    </span>
                  )}
                </span>
                <span className="test-title">{tc.title}</span>
              </td>
              <td>{tc.tier ?? '—'}</td>
              <td>{tc.layer ?? '—'}</td>
              <td>{tc.category ?? '—'}</td>
              <td>
                <ImplBadge status={tc.implStatus} />
              </td>
              <td>
                <ResultBadge result={v.latestResult} />
              </td>
              <td className="num">{v.runCount}</td>
              <td className="nowrap">{formatRelative(v.latestRun?.executedAt)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
