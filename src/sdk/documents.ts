// Fetch + normalise dash-qa documents from Dash Platform.

import type { AppConfig } from '../config';
import { DEMO_CASES, DEMO_RUNS, isDemoContract } from '../data/demo';
import { getConnectedSdk } from './client';
import { normalizeTestCase, normalizeTestRun, type RawDocument } from './normalize';
import type { TestCase, TestRun } from './types';

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

/** Fetch all `testCase` documents. */
export async function fetchTestCases(config: AppConfig): Promise<TestCase[]> {
  if (isDemoContract(config.contractId)) return DEMO_CASES;
  const raw = await queryAll(
    config,
    { dataContractId: config.contractId, documentTypeName: config.testCaseDocumentType },
    DEFAULT_MAX_DOCS,
  );
  return raw
    .map(([id, doc]) => normalizeTestCase(id, doc))
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
    .map(([id, doc]) => normalizeTestRun(id, doc))
    .filter((r): r is TestRun => r !== null);
  runs.sort((a, b) => b.executedAt - a.executedAt);
  return runs;
}
