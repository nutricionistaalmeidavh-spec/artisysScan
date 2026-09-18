import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createWebDastPlan,
  normalizeNucleiJsonl,
  normalizeZapJson,
} from '../src/dast.ts';

test('DAST plan uses passive ZAP baseline by default and gates Nuclei behind active authorization', () => {
  const passive = createWebDastPlan('https://app.example.test', '/tmp/artisys-web');
  assert.equal(passive.length, 1);
  assert.equal(passive[0].tool, 'zap-baseline');
  assert.equal(passive[0].command, 'docker');
  assert.equal(passive[0].shell, false);
  assert.ok(passive[0].args.includes('ghcr.io/zaproxy/zaproxy:stable'));
  assert.ok(passive[0].args.includes('zap-baseline.py'));

  const active = createWebDastPlan('https://app.example.test', '/tmp/artisys-web', { allowActive: true });
  assert.deepEqual(active.map((item) => item.tool), ['zap-baseline', 'nuclei']);
  assert.equal(active[1].command, 'nuclei');
  assert.equal(active[1].shell, false);
});

test('normalizes ZAP JSON alerts without copying response bodies', () => {
  const findings = normalizeZapJson(JSON.stringify({
    site: [{ alerts: [{ pluginid: '10010', alert: 'Cookie No HttpOnly Flag', riskcode: '2', riskdesc: 'Medium', instances: [{ uri: 'https://app.example.test/' }] }] }],
  }));
  assert.equal(findings[0].ruleId, 'ZAP-10010');
  assert.equal(findings[0].severity, 'medium');
});

test('normalizes Nuclei JSONL findings', () => {
  const findings = normalizeNucleiJsonl(JSON.stringify({
    'template-id': 'missing-csp',
    info: { name: 'Missing CSP', severity: 'medium' },
    'matched-at': 'https://app.example.test/',
  }));
  assert.equal(findings[0].ruleId, 'NUCLEI-missing-csp');
  assert.equal(findings[0].severity, 'medium');
});
