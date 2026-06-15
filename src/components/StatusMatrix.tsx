import type { MatrixCell } from '../data/compute';
import { matrixKey } from '../data/compute';
import type { Category, RunResult, Tier } from '../sdk/types';
import { RESULT_LABEL } from '../sdk/types';

interface Props {
  tiers: Tier[];
  categories: Category[];
  cells: Map<string, MatrixCell>;
  onSelect: (tier: Tier, category: Category) => void;
  selected?: { tier: Tier | null; category: Category | null };
}

// Order in which a cell's "headline" health colour is decided (worst first).
const HEALTH_ORDER: RunResult[] = ['fail', 'blocked', 'unknown', 'skipped', 'pass'];

function cellHealth(cell: MatrixCell): RunResult {
  for (const r of HEALTH_ORDER) {
    if (cell.counts[r] > 0) return r;
  }
  return 'unknown';
}

export function StatusMatrix({ tiers, categories, cells, onSelect, selected }: Props) {
  if (tiers.length === 0 || categories.length === 0) {
    return (
      <section className="matrix-empty">
        <p className="muted">
          No tier/category data to chart yet — test cases need <code>tier</code> and{' '}
          <code>category</code> fields.
        </p>
      </section>
    );
  }

  return (
    <section className="matrix-wrap" aria-label="Tier by category status matrix">
      <table className="matrix">
        <thead>
          <tr>
            <th className="matrix-corner">Tier \ Category</th>
            {categories.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier) => (
            <tr key={tier}>
              <th scope="row">{tier}</th>
              {categories.map((category) => {
                const cell = cells.get(matrixKey(tier, category));
                if (!cell || cell.total === 0) {
                  return (
                    <td key={category} className="matrix-cell empty">
                      <span className="muted">·</span>
                    </td>
                  );
                }
                const health = cellHealth(cell);
                const isSelected =
                  selected?.tier === tier && selected?.category === category;
                const breakdown = HEALTH_ORDER.filter((r) => cell.counts[r] > 0)
                  .map((r) => `${RESULT_LABEL[r]}: ${cell.counts[r]}`)
                  .join(', ');
                return (
                  <td key={category} className="matrix-cell">
                    <button
                      type="button"
                      className={`matrix-button health-${health} ${isSelected ? 'selected' : ''}`}
                      onClick={() => onSelect(tier, category)}
                      title={`${tier} · ${category} — ${breakdown}`}
                      aria-label={`${tier} ${category}: ${breakdown}`}
                    >
                      <span className="matrix-total">{cell.total}</span>
                      <span className="matrix-dots">
                        {HEALTH_ORDER.map((r) =>
                          cell.counts[r] > 0 ? (
                            <span key={r} className={`dot dot-${r}`} aria-hidden="true">
                              {cell.counts[r]}
                            </span>
                          ) : null,
                        )}
                      </span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
