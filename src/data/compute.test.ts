import { describe, expect, it } from 'vitest';
import {
  applyFilters,
  buildMatrix,
  buildSummary,
  buildViews,
  deriveFilterOptions,
  EMPTY_FILTERS,
  groupRunsByTest,
} from './compute';
import { DEMO_CASES, DEMO_RUNS } from './demo';
import type { TestCase, TestRun } from '../sdk/types';

const NO_SCOPE = { app: null, network: null, buildRef: null };

describe('groupRunsByTest', () => {
  it('groups and sorts each test newest-first', () => {
    const grouped = groupRunsByTest(DEMO_RUNS);
    const core05 = grouped.get('CORE-05')!;
    expect(core05.length).toBe(3);
    for (let i = 1; i < core05.length; i++) {
      expect(core05[i - 1].executedAt).toBeGreaterThanOrEqual(core05[i].executedAt);
    }
  });
});

describe('buildViews', () => {
  const views = buildViews(DEMO_CASES, DEMO_RUNS, NO_SCOPE);

  it('computes latest result per test (most recent run wins)', () => {
    const core05 = views.find((v) => v.testCase.testId === 'CORE-05')!;
    expect(core05.latestResult).toBe('pass'); // newest run is a pass after an older fail
    expect(core05.runCount).toBe(3);
    expect(core05.history[0].executedAt).toBeGreaterThan(core05.history[1].executedAt);
  });

  it('marks tests with no runs as unknown', () => {
    const core11 = views.find((v) => v.testCase.testId === 'CORE-11')!;
    expect(core11.runCount).toBe(0);
    expect(core11.latestResult).toBe('unknown');
  });

  it('drops runs whose testId has no matching test case (no orphan synthesis)', () => {
    const cases: TestCase[] = [
      { documentId: '1', testId: 'CORE-01', title: 'a', tier: 'Essential', layer: null, category: 'Core', tags: [], implStatus: 'implemented', raw: {} },
    ];
    const runs: TestRun[] = [
      { documentId: 'r1', testId: 'CORE-01', result: 'pass', network: 'testnet', buildRef: 'b', executedAt: 1, raw: {} },
      { documentId: 'r2', testId: 'GONE-99', result: 'skipped', network: 'testnet', buildRef: 'b', executedAt: 1, raw: {} },
    ];
    const v = buildViews(cases, runs, NO_SCOPE);
    expect(v.map((x) => x.testCase.testId)).toEqual(['CORE-01']);
    expect(v.find((x) => x.testCase.testId === 'GONE-99')).toBeUndefined();
  });

  it('scopes latest-result by run network when filtered', () => {
    const testnetOnly = buildViews(DEMO_CASES, DEMO_RUNS, { app: null, network: 'testnet', buildRef: null });
    const id04 = testnetOnly.find((v) => v.testCase.testId === 'ID-04')!;
    // ID-04 has a testnet pass and a devnet blocked; scoping to testnet => pass
    expect(id04.latestResult).toBe('pass');
    const devnetOnly = buildViews(DEMO_CASES, DEMO_RUNS, { app: null, network: 'devnet', buildRef: null });
    const id04dev = devnetOnly.find((v) => v.testCase.testId === 'ID-04')!;
    expect(id04dev.latestResult).toBe('blocked');
  });
});

describe('applyFilters', () => {
  const views = buildViews(DEMO_CASES, DEMO_RUNS, NO_SCOPE);

  it('filters by tier', () => {
    const essential = applyFilters(views, { ...EMPTY_FILTERS, tier: 'Essential' });
    expect(essential.length).toBeGreaterThan(0);
    expect(essential.every((v) => v.testCase.tier === 'Essential')).toBe(true);
  });

  it('filters by latest result', () => {
    const failing = applyFilters(views, { ...EMPTY_FILTERS, result: 'fail' });
    expect(failing.every((v) => v.latestResult === 'fail')).toBe(true);
    expect(failing.some((v) => v.testCase.testId === 'DPNS-05')).toBe(true);
  });

  it('filters by search across id and title', () => {
    const hits = applyFilters(views, { ...EMPTY_FILTERS, search: 'shielded' });
    expect(hits.some((v) => v.testCase.testId.startsWith('SH-'))).toBe(true);
  });

  it('filters by tag (only cases carrying the tag pass)', () => {
    const tagged = applyFilters(views, { ...EMPTY_FILTERS, tag: 'group' });
    expect(tagged.length).toBeGreaterThan(0);
    expect(tagged.every((v) => v.testCase.tags.includes('group'))).toBe(true);
    expect(tagged.some((v) => v.testCase.testId === 'GRP-03')).toBe(true);
  });
});

describe('buildMatrix', () => {
  it('builds a tier × category grid with per-result cell counts', () => {
    const views = buildViews(DEMO_CASES, DEMO_RUNS, NO_SCOPE);
    const matrix = buildMatrix(views);
    expect(matrix.tiers).toContain('Essential');
    expect(matrix.categories).toContain('Core');
    const cell = matrix.cells.get('Essential Core');
    expect(cell).toBeDefined();
    expect(cell!.total).toBeGreaterThan(0);
    const summed = Object.values(cell!.counts).reduce((a, b) => a + b, 0);
    expect(summed).toBe(cell!.total);
  });

  it('orders tiers by the canonical order', () => {
    const views = buildViews(DEMO_CASES, DEMO_RUNS, NO_SCOPE);
    const { tiers } = buildMatrix(views);
    const essentialIdx = tiers.indexOf('Essential');
    const uncommonIdx = tiers.indexOf('Uncommon');
    expect(essentialIdx).toBeLessThan(uncommonIdx);
  });
});

describe('buildSummary', () => {
  it('totals cases and runs and tracks distinct builds/networks', () => {
    const views = buildViews(DEMO_CASES, DEMO_RUNS, NO_SCOPE);
    const summary = buildSummary(views);
    expect(summary.totalCases).toBe(views.length);
    expect(summary.totalRuns).toBe(DEMO_RUNS.length);
    expect(summary.distinctNetworks).toBe(2); // testnet + devnet
    const resultTotal = Object.values(summary.resultCounts).reduce((a, b) => a + b, 0);
    expect(resultTotal).toBe(views.length);
  });
});

describe('buildViews — app scope', () => {
  const cases: TestCase[] = [
    { documentId: '1', testId: 'A-1', title: 'a', tier: 'Essential', layer: null, category: 'Core', tags: ['multiwallet'], implStatus: 'unknown', app: 'AppX', raw: {} },
    { documentId: '2', testId: 'B-1', title: 'b', tier: 'Common', layer: null, category: 'Core', tags: [], implStatus: 'unknown', app: 'AppY', raw: {} },
  ];
  const runs: TestRun[] = [
    { documentId: 'r1', testId: 'A-1', result: 'pass', network: 'testnet', buildRef: 'b', app: 'AppX', executedAt: 1, raw: {} },
    { documentId: 'r2', testId: 'B-1', result: 'fail', network: 'testnet', buildRef: 'b', app: 'AppY', executedAt: 1, raw: {} },
  ];

  it('scopes cases and runs to the selected app', () => {
    const v = buildViews(cases, runs, { app: 'AppX', network: null, buildRef: null });
    expect(v.map((x) => x.testCase.testId)).toEqual(['A-1']);
    expect(v[0].latestResult).toBe('pass');
  });

  it('includes all apps when none selected', () => {
    const v = buildViews(cases, runs, NO_SCOPE);
    expect(v.length).toBe(2);
  });

  it('lists apps in filter options', () => {
    expect(deriveFilterOptions(cases, runs).apps).toEqual(['AppX', 'AppY']);
  });

  it('lists the distinct tags present', () => {
    expect(deriveFilterOptions(cases, runs).tags).toEqual(['multiwallet']);
  });
});

describe('deriveFilterOptions', () => {
  it('lists the networks, builds, tiers and categories present', () => {
    const opts = deriveFilterOptions(DEMO_CASES, DEMO_RUNS);
    expect(opts.networks).toEqual(['devnet', 'testnet']);
    expect(opts.buildRefs.length).toBe(2);
    expect(opts.tiers[0]).toBe('Essential');
  });
});

// Guard: executedAt sort is stable for equal timestamps (no NaN ordering).
describe('sort safety', () => {
  it('handles runs with identical timestamps', () => {
    const runs: TestRun[] = [
      { documentId: 'a', testId: 'T-1', result: 'pass', network: 'testnet', buildRef: 'b', executedAt: 5, raw: {} },
      { documentId: 'b', testId: 'T-1', result: 'fail', network: 'testnet', buildRef: 'b', executedAt: 5, raw: {} },
    ];
    const grouped = groupRunsByTest(runs);
    expect(grouped.get('T-1')!.length).toBe(2);
  });
});
