// Pure client-side aggregation. Dash Platform has no GROUP BY, so the
// "latest run per test" reduction and the tier × category matrix are all
// computed here from the fetched document sets.

import type {
  Category,
  ImplStatus,
  RunResult,
  TestCase,
  TestRun,
  Tier,
} from '../sdk/types';
import { byKnownOrder, CATEGORY_ORDER, RUN_RESULTS, TIER_ORDER } from '../sdk/types';

export interface TestCaseView {
  testCase: TestCase;
  latestRun: TestRun | null;
  latestResult: RunResult; // 'unknown' when there are no (matching) runs
  runCount: number;
  history: TestRun[]; // newest first
  /** True when there are runs for a testId with no corresponding testCase doc. */
  isOrphan: boolean;
}

export interface Filters {
  network: string | null;
  buildRef: string | null;
  tier: Tier | null;
  category: Category | null;
  result: RunResult | 'any';
  implStatus: ImplStatus | 'any';
  search: string;
}

export const EMPTY_FILTERS: Filters = {
  network: null,
  buildRef: null,
  tier: null,
  category: null,
  result: 'any',
  implStatus: 'any',
  search: '',
};

export interface FilterOptions {
  networks: string[];
  buildRefs: string[];
  tiers: Tier[];
  categories: Category[];
}

export interface MatrixCell {
  tier: Tier;
  category: Category;
  total: number;
  counts: Record<RunResult, number>;
}

export interface Summary {
  totalCases: number;
  totalRuns: number;
  resultCounts: Record<RunResult, number>;
  implCounts: Record<ImplStatus, number>;
  lastRunAt: number | null;
  distinctBuilds: number;
  distinctNetworks: number;
  orphanCount: number;
}

function emptyResultCounts(): Record<RunResult, number> {
  return { pass: 0, fail: 0, blocked: 0, skipped: 0, unknown: 0 };
}

/** Group runs by testId (input is expected newest-first; we re-sort defensively). */
export function groupRunsByTest(runs: TestRun[]): Map<string, TestRun[]> {
  const byTest = new Map<string, TestRun[]>();
  for (const run of runs) {
    const list = byTest.get(run.testId);
    if (list) list.push(run);
    else byTest.set(run.testId, [run]);
  }
  for (const list of byTest.values()) list.sort((a, b) => b.executedAt - a.executedAt);
  return byTest;
}

/** Derive the available filter option lists from the full (unfiltered) data. */
export function deriveFilterOptions(cases: TestCase[], runs: TestRun[]): FilterOptions {
  const networks = new Set<string>();
  const buildRefs = new Set<string>();
  for (const run of runs) {
    if (run.network) networks.add(run.network);
    if (run.buildRef) buildRefs.add(run.buildRef);
  }
  const tiers = new Set<Tier>();
  const categories = new Set<Category>();
  for (const c of cases) {
    if (c.tier) tiers.add(c.tier);
    if (c.category) categories.add(c.category);
  }
  return {
    networks: [...networks].sort(),
    buildRefs: [...buildRefs].sort(),
    tiers: [...tiers].sort(byKnownOrder(TIER_ORDER)),
    categories: [...categories].sort(byKnownOrder(CATEGORY_ORDER)),
  };
}

function syntheticCase(testId: string): TestCase {
  return {
    documentId: `orphan:${testId}`,
    testId,
    title: testId,
    tier: null,
    layer: null,
    category: null,
    implStatus: 'unknown',
    raw: {},
  };
}

/**
 * Build the per-test views. Runs are first filtered by the run-scope filters
 * (network, buildRef), then reduced to latest-per-test, then merged with the
 * test cases. Orphan runs (no matching case) get a synthetic case so they
 * remain visible.
 */
export function buildViews(
  cases: TestCase[],
  runs: TestRun[],
  filters: Pick<Filters, 'network' | 'buildRef'>,
): TestCaseView[] {
  const scopedRuns = runs.filter(
    (r) =>
      (!filters.network || r.network === filters.network) &&
      (!filters.buildRef || r.buildRef === filters.buildRef),
  );
  const byTest = groupRunsByTest(scopedRuns);

  const views: TestCaseView[] = [];
  const seen = new Set<string>();

  for (const testCase of cases) {
    seen.add(testCase.testId);
    const history = byTest.get(testCase.testId) ?? [];
    const latestRun = history[0] ?? null;
    views.push({
      testCase,
      latestRun,
      latestResult: latestRun ? latestRun.result : 'unknown',
      runCount: history.length,
      history,
      isOrphan: false,
    });
  }

  // Orphan runs: a testId present in runs but absent from the case set.
  for (const [testId, history] of byTest) {
    if (seen.has(testId)) continue;
    views.push({
      testCase: syntheticCase(testId),
      latestRun: history[0] ?? null,
      latestResult: history[0]?.result ?? 'unknown',
      runCount: history.length,
      history,
      isOrphan: true,
    });
  }

  views.sort((a, b) => a.testCase.testId.localeCompare(b.testCase.testId, undefined, { numeric: true }));
  return views;
}

/** Apply the test-scope filters (tier, category, result, implStatus, search). */
export function applyFilters(views: TestCaseView[], filters: Filters): TestCaseView[] {
  const search = filters.search.trim().toLowerCase();
  return views.filter((v) => {
    if (filters.tier && v.testCase.tier !== filters.tier) return false;
    if (filters.category && v.testCase.category !== filters.category) return false;
    if (filters.result !== 'any' && v.latestResult !== filters.result) return false;
    if (filters.implStatus !== 'any' && v.testCase.implStatus !== filters.implStatus) return false;
    if (search) {
      const hay = `${v.testCase.testId} ${v.testCase.title}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

/** Build the tier × category matrix from a set of views. */
export function buildMatrix(views: TestCaseView[]): {
  tiers: Tier[];
  categories: Category[];
  cells: Map<string, MatrixCell>;
} {
  const tiers = new Set<Tier>();
  const categories = new Set<Category>();
  const cells = new Map<string, MatrixCell>();

  for (const v of views) {
    const { tier, category } = v.testCase;
    if (!tier || !category) continue;
    tiers.add(tier);
    categories.add(category);
    const key = `${tier} ${category}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { tier, category, total: 0, counts: emptyResultCounts() };
      cells.set(key, cell);
    }
    cell.total += 1;
    cell.counts[v.latestResult] += 1;
  }

  return {
    tiers: [...tiers].sort(byKnownOrder(TIER_ORDER)),
    categories: [...categories].sort(byKnownOrder(CATEGORY_ORDER)),
    cells,
  };
}

export function matrixKey(tier: Tier, category: Category): string {
  return `${tier} ${category}`;
}

/**
 * Compute the headline summary counts from the (run-scope-filtered) views.
 * Run-derived stats are flattened from each view's history, so the views are
 * the single source of truth — no need to re-thread the scoped run list.
 */
export function buildSummary(views: TestCaseView[]): Summary {
  const resultCounts = emptyResultCounts();
  const implCounts: Record<ImplStatus, number> = {
    implemented: 0,
    builder: 0,
    mock: 0,
    'sdk-only': 0,
    'not-implemented': 0,
    unknown: 0,
  };
  let orphanCount = 0;
  let totalRuns = 0;
  const builds = new Set<string>();
  const networks = new Set<string>();
  let lastRunAt: number | null = null;

  for (const v of views) {
    resultCounts[v.latestResult] += 1;
    implCounts[v.testCase.implStatus] += 1;
    if (v.isOrphan) orphanCount += 1;
    for (const r of v.history) {
      totalRuns += 1;
      if (r.buildRef) builds.add(r.buildRef);
      if (r.network) networks.add(r.network);
      if (r.executedAt && (lastRunAt === null || r.executedAt > lastRunAt)) lastRunAt = r.executedAt;
    }
  }

  return {
    totalCases: views.length,
    totalRuns,
    resultCounts,
    implCounts,
    lastRunAt,
    distinctBuilds: builds.size,
    distinctNetworks: networks.size,
    orphanCount,
  };
}

export { RUN_RESULTS };
