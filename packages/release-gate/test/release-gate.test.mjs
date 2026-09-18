import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateReleaseGate } from '../src/index.ts';

function input(overrides = {}) {
  return {
    productId: 'produto-a',
    profile: 'release',
    passed: true,
    complete: true,
    findings: [],
    checks: [],
    evidence: [],
    ...overrides,
  };
}

test('clean complete release receives PASS', () => {
  const result = evaluateReleaseGate(input());
  assert.equal(result.decision, 'PASS');
  assert.equal(result.blocked, false);
});

test('medium finding receives WARN by default', () => {
  const result = evaluateReleaseGate(input({
    findings: [{ ruleId: 'MED-1', severity: 'medium', message: 'review', tool: 'test' }],
  }));
  assert.equal(result.decision, 'WARN');
});

test('critical and high findings block release by default', () => {
  for (const severity of ['critical', 'high']) {
    const result = evaluateReleaseGate(input({
      findings: [{ ruleId: `${severity}-1`, severity, message: 'block', tool: 'test' }],
    }));
    assert.equal(result.decision, 'BLOCK');
    assert.equal(result.blocked, true);
  }
});

test('incomplete evidence and failed checks block release', () => {
  assert.equal(evaluateReleaseGate(input({ complete: false })).decision, 'BLOCK');
  assert.equal(evaluateReleaseGate(input({
    checks: [{ id: 'qa', name: 'QA', status: 'failed' }],
  })).decision, 'BLOCK');
});

test('policy can downgrade high findings to warning while critical still blocks', () => {
  const result = evaluateReleaseGate(input({
    findings: [{ ruleId: 'HIGH-1', severity: 'high', message: 'review', tool: 'test' }],
  }), {
    blockSeverities: ['critical'],
    warnSeverities: ['high', 'medium', 'low', 'unknown'],
  });
  assert.equal(result.decision, 'WARN');
});
