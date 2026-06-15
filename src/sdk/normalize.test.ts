import { describe, expect, it } from 'vitest';
import {
  normalizeImplStatus,
  normalizeResult,
  normalizeTestCase,
  normalizeTestRun,
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
