import { useMemo, useState } from 'react';
import type { TestCaseView } from '../data/compute';
import { ImplBadge, ResultBadge } from './badges';
import { formatRelative } from '../format';
import type { ImplStatus, RunResult } from '../sdk/types';
import { CATEGORY_ORDER, LAYER_ORDER, TIER_ORDER } from '../sdk/types';

type SortKey = 'testId' | 'tier' | 'layer' | 'category' | 'impl' | 'latest' | 'runs' | 'lastRun';
type SortDir = 'asc' | 'desc';

interface Column {
  key: SortKey;
  label: string;
  num?: boolean;
  /** Direction applied on the first click of this column. */
  defaultDir: SortDir;
}

const COLUMNS: Column[] = [
  { key: 'testId', label: 'Test', defaultDir: 'asc' },
  { key: 'tier', label: 'Tier', defaultDir: 'asc' },
  { key: 'layer', label: 'Layer', defaultDir: 'asc' },
  { key: 'category', label: 'Category', defaultDir: 'asc' },
  { key: 'impl', label: 'Impl', defaultDir: 'asc' },
  { key: 'latest', label: 'Latest', defaultDir: 'asc' },
  { key: 'runs', label: 'Runs', num: true, defaultDir: 'desc' },
  { key: 'lastRun', label: 'Last run', defaultDir: 'desc' },
];

// Enum columns sort by a meaningful order, not alphabetically.
const IMPL_ORDER: ImplStatus[] = ['implemented', 'builder', 'mock', 'sdk-only', 'not-implemented', 'unknown'];
const RESULT_ORDER: RunResult[] = ['pass', 'fail', 'blocked', 'skipped', 'unknown'];

function orderIndex(value: string | null | undefined, order: readonly string[]): number {
  if (value == null) return order.length + 1; // nulls sort last (finite — avoids NaN on null vs null)
  const i = order.indexOf(value);
  return i === -1 ? order.length : i;
}

const byTestId = (a: TestCaseView, b: TestCaseView) =>
  a.testCase.testId.localeCompare(b.testCase.testId, undefined, { numeric: true });

function compareBy(key: SortKey, a: TestCaseView, b: TestCaseView): number {
  switch (key) {
    case 'testId':
      return byTestId(a, b);
    case 'tier':
      return orderIndex(a.testCase.tier, TIER_ORDER) - orderIndex(b.testCase.tier, TIER_ORDER);
    case 'layer':
      return orderIndex(a.testCase.layer, LAYER_ORDER) - orderIndex(b.testCase.layer, LAYER_ORDER);
    case 'category':
      return orderIndex(a.testCase.category, CATEGORY_ORDER) - orderIndex(b.testCase.category, CATEGORY_ORDER);
    case 'impl':
      return IMPL_ORDER.indexOf(a.testCase.implStatus) - IMPL_ORDER.indexOf(b.testCase.implStatus);
    case 'latest':
      return RESULT_ORDER.indexOf(a.latestResult) - RESULT_ORDER.indexOf(b.latestResult);
    case 'runs':
      return a.runCount - b.runCount;
    case 'lastRun':
      return (a.latestRun?.executedAt ?? 0) - (b.latestRun?.executedAt ?? 0);
  }
}

interface Props {
  views: TestCaseView[];
  selectedTestId: string | null;
  onSelect: (testId: string) => void;
  onRefreshTest: (testId: string) => void;
  refreshingTestId: string | null;
}

export function TestList({ views, selectedTestId, onSelect, onRefreshTest, refreshingTestId }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('testId');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const onHeaderClick = (col: Column) => {
    if (col.key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir(col.defaultDir);
    }
  };

  const sorted = useMemo(() => {
    const copy = [...views];
    copy.sort((a, b) => {
      const primary = compareBy(sortKey, a, b);
      if (primary !== 0) return sortDir === 'asc' ? primary : -primary;
      return byTestId(a, b); // stable tiebreak, always ascending
    });
    return copy;
  }, [views, sortKey, sortDir]);

  if (views.length === 0) {
    return <p className="muted empty-state">No test cases match the current filters.</p>;
  }

  return (
    <table className="test-table">
      <thead>
        <tr>
          {COLUMNS.map((col) => {
            const active = col.key === sortKey;
            return (
              <th
                key={col.key}
                className={col.num ? 'num' : undefined}
                aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button type="button" className={`th-btn ${active ? 'active' : ''}`} onClick={() => onHeaderClick(col)}>
                  {col.label}
                  <span className="sort-ind" aria-hidden="true">
                    {active ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
            );
          })}
          <th className="actions" aria-label="Refresh" />
        </tr>
      </thead>
      <tbody>
        {sorted.map((v) => {
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
              <td className="actions">
                <button
                  type="button"
                  className={`row-refresh ${refreshingTestId === tc.testId ? 'spinning' : ''}`}
                  title={`Refresh ${tc.testId}`}
                  aria-label={`Refresh ${tc.testId}`}
                  disabled={refreshingTestId === tc.testId}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRefreshTest(tc.testId);
                  }}
                >
                  ↻
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
