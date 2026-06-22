import { describe, expect, it } from 'vitest';
import {
  normalizeImplStatus,
  normalizeResult,
  normalizeTestCase,
  normalizeTestRun,
  parseTags,
  type RawDocument,
} from './normalize';

describe('normalizeImplStatus', () => {
  it('maps TEST_PLAN glyphs', () => {
    expect(normalizeImplStatus('✅')).toBe('implemented');
    expect(normalizeImplStatus('🧪')).toBe('builder');
    expect(normalizeImplStatus('⚠️')).toBe('mock');
    expect(normalizeImplStatus('🔌')).toBe('sdk-only');
    expect(normalizeImplStatus('🚫')).toBe('not-implemented');
  });

  it('maps textual variants and falls back to unknown', () => {
    expect(normalizeImplStatus('Implemented')).toBe('implemented');
    expect(normalizeImplStatus('FFI only')).toBe('sdk-only');
    expect(normalizeImplStatus(undefined)).toBe('unknown');
    expect(normalizeImplStatus('???')).toBe('unknown');
  });
});

describe('normalizeResult', () => {
  it('maps the contract result vocabulary', () => {
    expect(normalizeResult('pass')).toBe('pass');
    expect(normalizeResult('FAILED')).toBe('fail');
    expect(normalizeResult('blocked')).toBe('blocked');
    expect(normalizeResult('skipped')).toBe('skipped');
    expect(normalizeResult('')).toBe('unknown');
  });
});

describe('normalizeTestCase', () => {
  it('reads the real schema fields, keeping an unknown tier verbatim', () => {
    const doc: RawDocument = {
      properties: {
        testId: 'CORE-05',
        title: 'Send Core L1 transaction',
        tier: 'Unspecified',
        layer: 'Core',
        category: 'Core',
        implStatus: '✅',
        description: 'notes',
        entryPoint: 'SendTransactionView',
        prerequisites: 'Funded wallet',
        planCommit: 'fe13a1a',
      },
      createdAt: 1_700_000_000_000n,
    };
    const tc = normalizeTestCase('doc1', doc);
    expect(tc).not.toBeNull();
    expect(tc!.testId).toBe('CORE-05');
    expect(tc!.tier).toBe('Unspecified');
    expect(tc!.implStatus).toBe('implemented');
    expect(tc!.entryPoint).toBe('SendTransactionView');
    expect(tc!.prerequisites).toBe('Funded wallet');
    expect(tc!.createdAt).toBe(1_700_000_000_000);
  });

  it('returns null without a testId', () => {
    expect(normalizeTestCase('x', { properties: { title: 'no id' } })).toBeNull();
  });

  it('parses a comma-separated tags string (v5 contract) into a list', () => {
    const tc = normalizeTestCase('d', {
      properties: { testId: 'DOC-15', title: 't', tags: 'multiwallet, contested ,' },
    })!;
    expect(tc.tags).toEqual(['multiwallet', 'contested']);
  });

  it('defaults tags to an empty list when absent', () => {
    const tc = normalizeTestCase('d', { properties: { testId: 'X', title: 't' } })!;
    expect(tc.tags).toEqual([]);
  });
});

describe('parseTags', () => {
  it('splits, trims, and drops empties', () => {
    expect(parseTags('a, b ,,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles undefined / empty', () => {
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags('')).toEqual([]);
    expect(parseTags('   ')).toEqual([]);
  });

  it('accepts an already-array form', () => {
    expect(parseTags(['x', ' y '])).toEqual(['x', 'y']);
  });

  it('resolves integer FK codes (v4 normalized contract) via lookups', () => {
    const lookups = {
      tier: new Map([['3', 'Uncommon']]),
      category: new Map([['11', 'System']]),
      app: new Map([['0', 'SwiftExampleApp']]),
    };
    const doc: RawDocument = {
      properties: { testId: 'SYS-06', title: 'Path elements', tier: 3n, category: 11n, app: 0n, layer: 'Platform', implStatus: '🔌' },
    };
    const tc = normalizeTestCase('d', doc, lookups)!;
    expect(tc.tier).toBe('Uncommon');
    expect(tc.category).toBe('System');
    expect(tc.app).toBe('SwiftExampleApp');
    expect(tc.layer).toBe('Platform');
  });

  it('passes codes through unresolved when no lookups are given', () => {
    const tc = normalizeTestCase('d', { properties: { testId: 'X', tier: 3n } })!;
    expect(tc.tier).toBe('3');
  });
});

describe('normalizeTestRun', () => {
  const make = (evidence: string): RawDocument => ({
    properties: { testId: 'CORE-05', result: 'pass', network: 'testnet', buildRef: 'b1', evidence },
    createdAt: 1_700_000_001_000n,
  });

  it('classifies a 64-hex evidence value as a txid', () => {
    const hex = 'a'.repeat(64);
    const run = normalizeTestRun('r1', make(hex))!;
    expect(run.txid).toBe(hex);
    expect(run.evidenceUrl).toBeUndefined();
    expect(run.evidenceText).toBeUndefined();
    expect(run.executedAt).toBe(1_700_000_001_000);
  });

  it('maps the integer network id (contract v2) to a name', () => {
    const run = normalizeTestRun('rn', {
      properties: { testId: 'CORE-05', result: 'pass', network: 1, buildRef: 'b1' },
      createdAt: 1n,
    })!;
    expect(run.network).toBe('testnet');
  });

  it('passes through an already-named network string', () => {
    const run = normalizeTestRun('rs', {
      properties: { testId: 'CORE-05', result: 'pass', network: 'devnet', buildRef: 'b1' },
      createdAt: 1n,
    })!;
    expect(run.network).toBe('devnet');
  });

  it('classifies a URL evidence value as evidenceUrl', () => {
    const run = normalizeTestRun('r2', make('https://ci.example/run/1'))!;
    expect(run.evidenceUrl).toBe('https://ci.example/run/1');
    expect(run.txid).toBeUndefined();
  });

  it('keeps any other evidence as plain text', () => {
    const run = normalizeTestRun('r3', make('logs/shielded.txt'))!;
    expect(run.evidenceText).toBe('logs/shielded.txt');
    expect(run.txid).toBeUndefined();
    expect(run.evidenceUrl).toBeUndefined();
  });

  it('reads blockerReason and device', () => {
    const run = normalizeTestRun('r4', {
      properties: {
        testId: 'ID-04',
        result: 'blocked',
        network: 'devnet',
        buildRef: 'b1',
        blockerReason: 'missing key',
        device: 'iPhone 16',
      },
      createdAt: 1n,
    })!;
    expect(run.result).toBe('blocked');
    expect(run.blockerReason).toBe('missing key');
    expect(run.device).toBe('iPhone 16');
  });
});
