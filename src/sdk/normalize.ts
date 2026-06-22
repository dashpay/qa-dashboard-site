// Map raw Dash Platform documents into the dashboard's typed model.
//
// The Evo SDK returns `Document` objects whose user-defined fields live on a
// plain `properties` record, with system fields (`createdAt`, `ownerId`, …)
// as typed getters. We read those defensively: field-name synonyms and the
// TEST_PLAN emoji vocabulary are all accepted so a small mismatch with the
// sibling task's schema degrades gracefully instead of throwing.

import type { ImplStatus, Lookups, RunResult, TestCase, TestRun } from './types';

/** Minimal structural view of an Evo SDK Document (avoids importing wasm types). */
export interface RawDocument {
  properties?: Record<string, unknown>;
  createdAt?: bigint | number;
  updatedAt?: bigint | number;
  ownerId?: { toString(): string };
}

function toMs(value: bigint | number | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'bigint' ? Number(value) : value;
}

/** Case-insensitive lookup of the first present, non-empty value among keys. */
function pick(props: Record<string, unknown>, keys: string[]): unknown {
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(props)) lower.set(k.toLowerCase(), v);
  for (const key of keys) {
    const v = lower.get(key.toLowerCase());
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function pickString(props: Record<string, unknown>, keys: string[]): string | undefined {
  const v = pick(props, keys);
  if (v === undefined) return undefined;
  const s = typeof v === 'string' ? v : String(v);
  const trimmed = s.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Resolve a normalized (v3+) integer FK code to its display name via a lookup
 * map. Non-numeric values (older string-typed contracts) pass through.
 */
function resolveCode(value: string | undefined, map?: Map<string, string>): string | undefined {
  if (value === undefined) return undefined;
  if (map && /^\d+$/.test(value)) return map.get(value) ?? value;
  return value;
}

/**
 * Parse the `tags` field into a clean list. The v5 contract stores tags as a
 * single comma-separated string (DPP has no typed string arrays); older
 * contracts (or producers) may already supply an array. Both are accepted:
 * split on commas, trim, drop empties.
 */
export function parseTags(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  const parts = Array.isArray(value) ? value.map((v) => String(v)) : String(value).split(',');
  return parts.map((s) => s.trim()).filter((s) => s !== '');
}

export function normalizeImplStatus(value: string | undefined): ImplStatus {
  if (!value) return 'unknown';
  const v = value.trim().toLowerCase();
  // TEST_PLAN emoji vocabulary (the contract stores the glyph)
  if (value.includes('✅')) return 'implemented';
  if (value.includes('🧪')) return 'builder';
  if (value.includes('⚠')) return 'mock';
  if (value.includes('🔌')) return 'sdk-only';
  if (value.includes('🚫')) return 'not-implemented';
  // textual forms
  if (['implemented', 'done', 'ui', 'reachable', 'available'].some((s) => v.includes(s))) {
    return 'implemented';
  }
  if (['builder', 'transition', 'demo'].some((s) => v.includes(s))) return 'builder';
  if (['mock', 'local-only', 'local only', 'localonly', 'partial', 'stub'].some((s) => v.includes(s))) {
    return 'mock';
  }
  if (['sdk-only', 'sdk only', 'sdkonly', 'ffi', 'no ui', 'no-ui'].some((s) => v.includes(s))) {
    return 'sdk-only';
  }
  if (
    ['not-implemented', 'not implemented', 'none', 'missing', 'unimplemented'].some((s) =>
      v.includes(s),
    )
  ) {
    return 'not-implemented';
  }
  return 'unknown';
}

export function normalizeResult(value: string | undefined): RunResult {
  if (!value) return 'unknown';
  const v = value.trim().toLowerCase();
  if (['pass', 'passed', 'success', 'ok', 'green', '✅'].some((s) => v.includes(s))) return 'pass';
  if (['fail', 'failed', 'failure', 'error', 'red', '❌'].some((s) => v.includes(s))) return 'fail';
  if (['block', 'blocked', 'precondition'].some((s) => v.includes(s))) return 'blocked';
  if (['skip', 'skipped', 'manual', 'n/a', 'na'].some((s) => v.includes(s))) return 'skipped';
  return 'unknown';
}

export function normalizeTestCase(
  documentId: string,
  doc: RawDocument,
  lookups?: Lookups,
): TestCase | null {
  const props = doc.properties ?? {};
  const testId = pickString(props, ['testId', 'testCaseId', 'caseId', 'id', 'code']);
  if (!testId) return null; // a test case without an id is unusable
  return {
    documentId,
    testId,
    title: pickString(props, ['title', 'action', 'name', 'summary']) ?? testId,
    tier: resolveCode(pickString(props, ['tier']), lookups?.tier) ?? null,
    layer: pickString(props, ['layer']) ?? null,
    category: resolveCode(pickString(props, ['category', 'domain', 'area']), lookups?.category) ?? null,
    tags: parseTags(pick(props, ['tags', 'tag', 'labels'])),
    app: resolveCode(pickString(props, ['app']), lookups?.app),
    implStatus: normalizeImplStatus(pickString(props, ['implStatus', 'status', 'implementation'])),
    description: pickString(props, ['description', 'details', 'notes']),
    entryPoint: pickString(props, ['entryPoint', 'entrypoint', 'entry', 'location']),
    prerequisites: pickString(props, ['prerequisites', 'prereqs', 'preconditions']),
    planCommit: pickString(props, ['planCommit', 'commit', 'sha']),
    createdAt: toMs(doc.createdAt),
    updatedAt: toMs(doc.updatedAt),
    raw: props,
  };
}

const HEX64 = /^[0-9a-fA-F]{64}$/;
const URL_RE = /^https?:\/\//i;

// The contract stores `network` as an integer id (0=mainnet, 1=testnet,
// 2=devnet, 3=regtest). Map it to a name; pass through already-named values.
const NETWORK_NAMES: Record<string, string> = {
  '0': 'mainnet',
  '1': 'testnet',
  '2': 'devnet',
  '3': 'regtest',
};

function normalizeNetwork(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return /^\d+$/.test(value) ? (NETWORK_NAMES[value] ?? value) : value;
}

export function normalizeTestRun(
  documentId: string,
  doc: RawDocument,
  lookups?: Lookups,
): TestRun | null {
  const props = doc.properties ?? {};
  const testId = pickString(props, ['testId', 'testCaseId', 'caseId', 'case', 'code']);
  if (!testId) return null;

  // The contract stores a single `evidence` field (txid / URL / path). Classify
  // it, while still honouring explicit txid/url fields if a producer splits them.
  const evidence = pickString(props, ['evidence', 'evidenceUrl', 'url', 'link', 'logUrl']);
  const explicitTxid = pickString(props, ['txid', 'txId', 'transactionId', 'tx']);
  const explicitUrl = pickString(props, ['evidenceUrl', 'logUrl']);

  let txid: string | undefined = explicitTxid;
  let evidenceUrl: string | undefined = explicitUrl;
  let evidenceText: string | undefined;
  if (evidence) {
    if (!txid && HEX64.test(evidence)) txid = evidence;
    else if (!evidenceUrl && URL_RE.test(evidence)) evidenceUrl = evidence;
    else if (evidence !== txid && evidence !== evidenceUrl) evidenceText = evidence;
  }

  // Per schema, $createdAt is the run time.
  const createdAt = toMs(doc.createdAt);
  const executedAt = createdAt ?? 0;

  return {
    documentId,
    testId,
    result: normalizeResult(pickString(props, ['result', 'outcome', 'status', 'verdict'])),
    network: normalizeNetwork(pickString(props, ['network', 'net'])) ?? null,
    app: resolveCode(pickString(props, ['app']), lookups?.app),
    buildRef:
      pickString(props, ['buildRef', 'build', 'commit', 'sha', 'version']) ?? null,
    device: pickString(props, ['device', 'simulator']),
    notes: pickString(props, ['notes', 'message', 'detail', 'details', 'summary']),
    blockerReason: pickString(props, ['blockerReason', 'blocker', 'reason']),
    evidenceUrl,
    txid,
    evidenceText,
    executedAt,
    createdAt,
    ownerId: doc.ownerId ? String(doc.ownerId) : undefined,
    raw: props,
  };
}
