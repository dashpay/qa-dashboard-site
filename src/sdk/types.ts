// Domain model for the dash-qa contract, as consumed read-only by the dashboard.
//
// Field names mirror the `testCase` / `testRun` document types defined by the
// sibling "data contract + seed" task (schema/qa-contract.documents.json). The
// normaliser (normalize.ts) stays tolerant of synonyms and of the TEST_PLAN
// emoji vocabulary so a small schema drift degrades gracefully.

// Tier / Layer / Category are free strings (the contract stores them as plain
// strings — tier may even be "Unspecified" for stub rows). We keep canonical
// orderings for display but never reject an unknown value.
export type Tier = string;
export type Layer = string;
export type Category = string;

/** Canonical display order; unknown values sort after these, alphabetically. */
export const TIER_ORDER = ['Essential', 'Common', 'Thorough', 'Uncommon', 'Manual', 'Unspecified'];
export const LAYER_ORDER = ['Core', 'Platform', 'Cross', 'Shielded'];
export const CATEGORY_ORDER = [
  'Core',
  'Identity',
  'Address',
  'DPNS',
  'Voting',
  'Contract',
  'Document',
  'Token',
  'Shielded',
  'DashPay',
  'Group',
  'System',
  'MultiWallet',
];

/** Comparator that respects a known order, then falls back to alphabetical. */
export function byKnownOrder(known: string[]): (a: string, b: string) => number {
  return (a, b) => {
    const ia = known.indexOf(a);
    const ib = known.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  };
}

/** Implementation status of a test case (from the TEST_PLAN legend / glyphs). */
export type ImplStatus =
  | 'implemented' // ✅ reachable in app UI
  | 'builder' // 🧪 only via Settings → Platform State Transitions
  | 'mock' // ⚠️ UI exists but local-only / does not broadcast
  | 'sdk-only' // 🔌 FFI/Swift exists, no UI
  | 'not-implemented' // 🚫 not implemented anywhere
  | 'unknown';

/** Outcome of a single test run (contract vocabulary: pass/fail/blocked/skipped). */
export type RunResult = 'pass' | 'fail' | 'blocked' | 'skipped' | 'unknown';

export interface TestCase {
  /** Platform document $id (base58). */
  documentId: string;
  /** Canonical human test id, e.g. "CORE-05". */
  testId: string;
  title: string;
  tier: Tier | null;
  layer: Layer | null;
  category: Category | null;
  implStatus: ImplStatus;
  /** Entry point & test notes (plan's last column). */
  description?: string;
  /** Primary code entry point (view / FFI function). */
  entryPoint?: string;
  /** Fixtures/preconditions required before this test can run. */
  prerequisites?: string;
  /** TEST_PLAN.md git sha this case was seeded from. */
  planCommit?: string;
  createdAt?: number;
  updatedAt?: number;
  /** Anything we could not map into the typed fields, for debugging. */
  raw: Record<string, unknown>;
}

export interface TestRun {
  documentId: string;
  /** References TestCase.testId. */
  testId: string;
  result: RunResult;
  /** Network the run was executed against (testnet/devnet/mainnet/local/…). */
  network: string | null;
  /** Build / commit reference the run exercised, e.g. a git sha or app build. */
  buildRef: string | null;
  /** Device / simulator the run executed on. */
  device?: string;
  /** Free-text notes / failure summary. */
  notes?: string;
  /** Why the run was blocked/skipped. */
  blockerReason?: string;
  /** Evidence resolved to a URL, when it looked like one. */
  evidenceUrl?: string;
  /** Evidence resolved to a 64-hex transaction id, when it looked like one. */
  txid?: string;
  /** Any other evidence string (on-chain id, screenshot path, …). */
  evidenceText?: string;
  /** Execution timestamp (ms) — the document's $createdAt per the schema. */
  executedAt: number;
  createdAt?: number;
  ownerId?: string;
  raw: Record<string, unknown>;
}

export const RUN_RESULTS: RunResult[] = ['pass', 'fail', 'blocked', 'skipped', 'unknown'];

export const IMPL_STATUS_LABEL: Record<ImplStatus, string> = {
  implemented: '✅ Implemented',
  builder: '🧪 Builder-only',
  mock: '⚠️ Mock / local-only',
  'sdk-only': '🔌 SDK-only (no UI)',
  'not-implemented': '🚫 Not implemented',
  unknown: '— Unknown',
};

export const RESULT_LABEL: Record<RunResult, string> = {
  pass: 'Pass',
  fail: 'Fail',
  blocked: 'Blocked',
  skipped: 'Skipped',
  unknown: 'No runs',
};
