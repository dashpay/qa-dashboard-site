// A small, self-contained demo dataset modelled on the iOS TEST_PLAN.
//
// Loaded when the configured contract id is the literal "demo" (see
// sdk/documents.ts). It lets the deployed site render a representative
// dashboard before the live dash-qa contract is registered, and backs the
// UI tests. The shape matches the normalised model exactly.

import type { TestCase, TestRun } from '../sdk/types';

const DAY = 24 * 60 * 60 * 1000;
// Fixed base time so the demo is deterministic (no Date.now() at module load).
const BASE = Date.UTC(2026, 5, 10, 12, 0, 0); // 2026-06-10T12:00:00Z

function tc(
  testId: string,
  title: string,
  tier: string,
  layer: string,
  category: string,
  implStatus: TestCase['implStatus'],
  extra: Partial<TestCase> = {},
): TestCase {
  return {
    documentId: `demo-case-${testId}`,
    testId,
    title,
    tier,
    layer,
    category,
    implStatus,
    app: 'SwiftExampleApp',
    raw: {},
    ...extra,
  };
}

export const DEMO_CASES: TestCase[] = [
  tc('CORE-01', 'Create wallet (new mnemonic)', 'Essential', 'Core', 'Core', 'implemented', {
    entryPoint: 'CreateWalletView',
    planCommit: 'fe13a1ae',
  }),
  tc('CORE-05', 'Send Core L1 transaction', 'Essential', 'Core', 'Core', 'implemented', {
    description: 'The canonical Essential action — broadcast, balance drop, history row.',
    entryPoint: 'SendTransactionView',
    prerequisites: 'Funded Core wallet with mature UTXOs.',
  }),
  tc('CORE-10', 'Multi-recipient Core send', 'Common', 'Core', 'Core', 'implemented'),
  tc('CORE-11', 'Custom fee on transparent send', 'Uncommon', 'Core', 'Core', 'not-implemented'),
  tc('ID-01', 'Register identity', 'Essential', 'Platform', 'Identity', 'implemented', {
    prerequisites: 'Funded Core wallet for asset-lock funding.',
  }),
  tc('ID-04', 'Identity credit transfer', 'Essential', 'Platform', 'Identity', 'implemented'),
  tc('ID-10', 'Disable identity key', 'Common', 'Platform', 'Identity', 'builder'),
  tc('DPNS-01', 'Register username', 'Essential', 'Platform', 'DPNS', 'implemented'),
  tc('DPNS-05', 'Register contested name', 'Common', 'Platform', 'DPNS', 'implemented'),
  tc('VOTE-01', 'Cast contested-resource vote', 'Thorough', 'Platform', 'Voting', 'builder', {
    prerequisites: 'Masternode / evonode voting key.',
  }),
  tc('TOK-01', 'View token balance', 'Common', 'Platform', 'Token', 'implemented'),
  tc('TOK-08', 'Mint tokens', 'Uncommon', 'Platform', 'Token', 'builder'),
  tc('SH-01', 'Shielded pool sync', 'Essential', 'Shielded', 'Shielded', 'implemented'),
  tc('SH-08', 'Shielded withdraw (unshield)', 'Common', 'Shielded', 'Shielded', 'implemented'),
  tc('SH-10', 'Grow anonymity set', 'Thorough', 'Shielded', 'Shielded', 'mock'),
  tc('CORE-08', 'QR scan recipient', 'Manual', 'Core', 'Core', 'implemented', {
    description: 'Needs a real camera — skipped in automation, flagged for manual.',
  }),
  tc('GRP-03', 'Group token transfer', 'Uncommon', 'Platform', 'Group', 'sdk-only'),
  tc('SYS-01', 'Query total credits', 'Uncommon', 'Platform', 'System', 'implemented'),
];

let runSeq = 0;
function run(
  testId: string,
  result: TestRun['result'],
  daysAgo: number,
  network: string,
  buildRef: string,
  extra: Partial<TestRun> = {},
): TestRun {
  const executedAt = BASE - daysAgo * DAY;
  runSeq += 1;
  return {
    documentId: `demo-run-${runSeq}`,
    testId,
    result,
    network,
    buildRef,
    executedAt,
    createdAt: executedAt,
    device: 'iPhone 16 Simulator · iOS 18.2',
    app: 'SwiftExampleApp',
    ownerId: '85KjYZLZXA7YZBPyFEjiMaH36xcQpBBZisKGBHF3uKuH',
    raw: {},
    ...extra,
  };
}

const B1 = 'v3.1-dev@fe13a1a';
const B2 = 'v3.1-dev@7e5d628';

export const DEMO_RUNS: TestRun[] = [
  // CORE-05: history with a regression then recovery
  run('CORE-05', 'pass', 0.2, 'testnet', B2, {
    txid: '30010050a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6071829317f840',
  }),
  run('CORE-05', 'fail', 2, 'testnet', B1, { notes: 'Broadcast timed out before consensus.' }),
  run('CORE-05', 'pass', 5, 'devnet', B1),
  run('CORE-01', 'pass', 0.3, 'testnet', B2),
  run('CORE-01', 'pass', 4, 'testnet', B1),
  run('CORE-10', 'pass', 1, 'testnet', B2, {
    evidenceUrl: 'https://example.org/ci/run/1042',
  }),
  run('ID-01', 'pass', 0.5, 'testnet', B2),
  run('ID-04', 'pass', 0.6, 'testnet', B2),
  run('ID-04', 'blocked', 3, 'devnet', B1, {
    blockerReason: 'No TRANSFER/CRITICAL key present on identity.',
  }),
  run('ID-10', 'skipped', 1, 'testnet', B2, {
    blockerReason: 'Reachable only via the state-transition builder.',
  }),
  run('DPNS-01', 'pass', 0.7, 'testnet', B2),
  run('DPNS-05', 'fail', 0.8, 'testnet', B2, {
    notes: 'Vote poll did not open; contested-name index missing.',
  }),
  run('VOTE-01', 'skipped', 2, 'testnet', B1, {
    blockerReason: 'Requires masternode voting credentials.',
  }),
  run('TOK-01', 'pass', 0.9, 'testnet', B2),
  run('TOK-08', 'blocked', 2, 'devnet', B1, {
    blockerReason: 'Contract permission rule disallows minting for this identity.',
  }),
  run('SH-01', 'pass', 0.4, 'testnet', B2, { evidenceText: 'logs/shielded-sync-2026-06-10.txt' }),
  run('SH-01', 'fail', 6, 'devnet', B1, { notes: 'Note format skew (280→312B) decrypted nothing.' }),
  run('SH-08', 'pass', 1.5, 'testnet', B2),
  run('SH-10', 'skipped', 1.5, 'testnet', B2, { blockerReason: 'Anonymity set too small on testnet.' }),
  run('SYS-01', 'pass', 1.1, 'testnet', B2),
  // An orphan run: a testId with no matching test case
  run('EXP-99', 'pass', 1.2, 'testnet', B2, { notes: 'Experimental probe, not yet in the plan.' }),
];

export function isDemoContract(contractId: string): boolean {
  return contractId.trim().toLowerCase() === 'demo';
}
