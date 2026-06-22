import type { Filters, FilterOptions } from '../data/compute';
import { EMPTY_FILTERS } from '../data/compute';
import type { ImplStatus, RunResult } from '../sdk/types';
import { IMPL_STATUS_LABEL, RESULT_LABEL, RUN_RESULTS } from '../sdk/types';

const IMPL_STATUSES: ImplStatus[] = [
  'implemented',
  'builder',
  'mock',
  'sdk-only',
  'not-implemented',
  'unknown',
];

interface Props {
  filters: Filters;
  options: FilterOptions;
  onChange: (next: Filters) => void;
  resultCount: number;
  totalCount: number;
  onRefresh: () => void;
  refreshing: boolean;
  refreshNote: string | null;
}

export function FilterBar({
  filters,
  options,
  onChange,
  resultCount,
  totalCount,
  onRefresh,
  refreshing,
  refreshNote,
}: Props) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  const isFiltered = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <section className="filters" aria-label="Filters">
      <input
        type="search"
        className="filter-search"
        placeholder="Search test id or title…"
        value={filters.search}
        onChange={(e) => set('search', e.target.value)}
        aria-label="Search"
      />

      <Select
        label="Network"
        value={filters.network ?? ''}
        onChange={(v) => set('network', v || null)}
        options={options.networks.map((n) => ({ value: n, label: n }))}
      />
      <Select
        label="Build"
        value={filters.buildRef ?? ''}
        onChange={(v) => set('buildRef', v || null)}
        options={options.buildRefs.map((b) => ({ value: b, label: b }))}
      />
      <Select
        label="Tier"
        value={filters.tier ?? ''}
        onChange={(v) => set('tier', (v || null) as Filters['tier'])}
        options={options.tiers.map((t) => ({ value: t, label: t }))}
      />
      <Select
        label="Category"
        value={filters.category ?? ''}
        onChange={(v) => set('category', (v || null) as Filters['category'])}
        options={options.categories.map((c) => ({ value: c, label: c }))}
      />
      {options.tags.length > 0 && (
        <Select
          label="Tag"
          value={filters.tag ?? ''}
          onChange={(v) => set('tag', v || null)}
          options={options.tags.map((t) => ({ value: t, label: t }))}
        />
      )}
      <Select
        label="Result"
        value={filters.result === 'any' ? '' : filters.result}
        onChange={(v) => set('result', (v || 'any') as RunResult | 'any')}
        options={RUN_RESULTS.map((r) => ({ value: r, label: RESULT_LABEL[r] }))}
      />
      <Select
        label="Impl"
        value={filters.implStatus === 'any' ? '' : filters.implStatus}
        onChange={(v) => set('implStatus', (v || 'any') as ImplStatus | 'any')}
        options={IMPL_STATUSES.map((s) => ({ value: s, label: IMPL_STATUS_LABEL[s] }))}
      />

      <span className="filter-count">
        {resultCount}/{totalCount}
      </span>
      {refreshNote && <span className="refresh-note">{refreshNote}</span>}
      <button
        type="button"
        className="link-button"
        onClick={onRefresh}
        disabled={refreshing}
        title="Fetch runs added since the last check and merge them in"
      >
        {refreshing ? 'Refreshing…' : '↻ Refresh runs'}
      </button>
      {isFiltered && (
        <button type="button" className="link-button" onClick={() => onChange(EMPTY_FILTERS)}>
          Clear
        </button>
      )}
    </section>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="filter-select">
      <span className="filter-select-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
