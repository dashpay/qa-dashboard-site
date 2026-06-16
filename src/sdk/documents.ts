// Fetch + normalise dash-qa documents from Dash Platform.

import type { AppConfig } from '../config';
import { DEMO_CASES, DEMO_RUNS, isDemoContract } from '../data/demo';
import { getConnectedSdk } from './client';
import { normalizeTestCase, normalizeTestRun, type RawDocument } from './normalize';
import { emptyLookups, type Lookups, type TestCase, type TestRun } from './types';

const PAGE_LIMIT = 100; // Platform caps document queries at 100 per request.
const DEFAULT_MAX_DOCS = 5_000;

type WhereClause = [string, string, unknown];
type OrderClause = [string, 'asc' | 'desc'];

interface DocumentsQuery {
  dataContractId: string;
  documentTypeName: string;
  where?: WhereClause[];
  orderBy?: OrderClause[];
  limit?: number;
  startAfter?: string;
}

/**
 * Walk every page of a document query (primary-key order, or `orderBy` when
 * given) until exhausted or `maxDocs` reached. Returns `[id, rawDoc]` pairs.
 */
async function queryAll(
  config: AppConfig,
  base: Omit<DocumentsQuery, 'limit' | 'startAfter'>,
  maxDocs: number,
): Promise<Array<[string, RawDocument]>> {
  const sdk = await getConnectedSdk(config);
  const out: Array<[string, RawDocument]> = [];
  let startAfter: string | undefined;

  while (out.length < maxDocs) {
    const query: DocumentsQuery = { ...base, limit: PAGE_LIMIT };
    if (startAfter) query.startAfter = startAfter;

    // The facade types the query loosely; cast at this single boundary.
    const result = (await sdk.documents.query(query as never)) as Map<
      string,
      RawDocument | undefined
    >;

    const entries = [...result.entries()].filter(
      (e): e is [string, RawDocument] => e[1] != null,
    );
    if (entries.length === 0) break;

    out.push(...entries);
    if (entries.length < PAGE_LIMIT) break; // last page
    startAfter = entries[entries.length - 1][0];
  }

  return out.slice(0, maxDocs);
}

/**
 * Fetch the lookup document types (tier / category / app) and build code→name
 * maps. Normalized (v3+) contracts split these out and reference them by
 * integer FK. Tolerant: a contract without a given lookup type yields an empty
 * map and values pass through unresolved.
 */
async function fetchLookupMap(config: AppConfig, documentTypeName: string): Promise<Map<string, string>> {
  try {
    const raw = await queryAll(config, { dataContractId: config.contractId, documentTypeName }, 1_000);
    const map = new Map<string, string>();
    for (const [, doc] of raw) {
      const props = doc.properties ?? {};
      const code = props.code;
      const name = props.name;
      if (code != null && name != null) map.set(String(code), String(name));
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Reverse-resolve identity ids to DPNS usernames (for showing who submitted a
 * run). Returns a map only for ids that have a name; callers fall back to a
 * short id prefix for the rest. Resolves each id independently and tolerantly.
 */
export async function resolveOwnerNames(
  config: AppConfig,
  ownerIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (isDemoContract(config.contractId) || ownerIds.length === 0) return out;
  const sdk = await getConnectedSdk(config);
  await Promise.all(
    ownerIds.map(async (id) => {
      try {
        const name = await sdk.dpns.username(id);
        if (name) out.set(id, name);
      } catch {
        // no name / lookup failed — caller falls back to an id prefix
      }
    }),
  );
  return out;
}

export async function fetchLookups(config: AppConfig): Promise<Lookups> {
  if (isDemoContract(config.contractId)) return emptyLookups();
  const [tier, category, app] = await Promise.all([
    fetchLookupMap(config, 'tier'),
    fetchLookupMap(config, 'category'),
    fetchLookupMap(config, 'app'),
  ]);
  return { tier, category, app };
}

/** Fetch all `testCase` documents (resolving lookup FKs when provided). */
export async function fetchTestCases(config: AppConfig, lookups?: Lookups): Promise<TestCase[]> {
  if (isDemoContract(config.contractId)) return DEMO_CASES;
  const raw = await queryAll(
    config,
    { dataContractId: config.contractId, documentTypeName: config.testCaseDocumentType },
    DEFAULT_MAX_DOCS,
  );
  return raw
    .map(([id, doc]) => normalizeTestCase(id, doc, lookups))
    .filter((c): c is TestCase => c !== null);
}

/**
 * Fetch `testRun` documents, newest first.
 *
 * The dash-qa contract indexes `$createdAt` only inside composite indices
 * (`[testId,$createdAt]`, `[result,$createdAt]`), so Platform can't order
 * *all* runs by time in one query. Instead we page through every run
 * (primary-key order) up to `maxDocs` and sort by `$createdAt` client-side —
 * which is both index-safe and complete for an append-only audit log of this
 * size. If the run volume ever exceeds `maxDocs`, the oldest runs beyond the
 * cap are dropped (the newest are always retained after the sort).
 */
export async function fetchTestRuns(
  config: AppConfig,
  lookups?: Lookups,
  maxDocs = DEFAULT_MAX_DOCS,
): Promise<TestRun[]> {
  if (isDemoContract(config.contractId)) {
    return [...DEMO_RUNS].sort((a, b) => b.executedAt - a.executedAt);
  }
  const raw = await queryAll(
    config,
    { dataContractId: config.contractId, documentTypeName: config.testRunDocumentType },
    maxDocs,
  );
  const runs = raw
    .map(([id, doc]) => normalizeTestRun(id, doc, lookups))
    .filter((r): r is TestRun => r !== null);
  runs.sort((a, b) => b.executedAt - a.executedAt);
  return runs;
}

/**
 * Fetch the runs for a single test (for per-row refresh). When the owner is
 * known, queries server-side via the `$ownerId`+`testId` index; otherwise (or
 * if that index query is rejected) falls back to fetching all runs and
 * filtering client-side.
 */
export async function fetchRunsForTest(
  config: AppConfig,
  testId: string,
  lookups?: Lookups,
  ownerId?: string,
): Promise<TestRun[]> {
  if (isDemoContract(config.contractId)) {
    return [...DEMO_RUNS].filter((r) => r.testId === testId).sort((a, b) => b.executedAt - a.executedAt);
  }

  if (ownerId) {
    try {
      const raw = await queryAll(
        config,
        {
          dataContractId: config.contractId,
          documentTypeName: config.testRunDocumentType,
          where: [
            ['$ownerId', '==', ownerId],
            ['testId', '==', testId],
          ],
        },
        DEFAULT_MAX_DOCS,
      );
      const runs = raw
        .map(([id, doc]) => normalizeTestRun(id, doc, lookups))
        .filter((r): r is TestRun => r !== null);
      runs.sort((a, b) => b.executedAt - a.executedAt);
      return runs;
    } catch {
      // index/where unsupported — fall back to the full fetch below
    }
  }

  const all = await fetchTestRuns(config, lookups);
  return all.filter((r) => r.testId === testId);
}
