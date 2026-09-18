import assert from 'node:assert/strict';
import test from 'node:test';

import { runFleet, validateFleetConfig } from '../src/index.ts';

const cleanReport = (id) => ({
  productId: id,
  profile: 'quick',
  passed: true,
  complete: true,
  findings: [],
  checks: [],
  evidence: [],
});

test('fleet config rejects duplicate product ids', () => {
  assert.throws(() => validateFleetConfig({
    schema: 1,
    products: [
      { id: 'a', root: '/a', profile: 'quick' },
      { id: 'a', root: '/b', profile: 'full' },
    ],
  }), /duplicate/i);
});

test('fleet aggregates products and worst gate decision', async () => {
  const config = validateFleetConfig({
    schema: 1,
    products: [
      { id: 'a', root: '/a', profile: 'quick' },
      { id: 'b', root: '/b', profile: 'release' },
    ],
  });
  const report = await runFleet(config, async (product) => product.id === 'a'
    ? cleanReport(product.id)
    : {
        ...cleanReport(product.id),
        findings: [{ ruleId: 'HIGH-1', severity: 'high', message: 'block', tool: 'test' }],
      });
  assert.equal(report.products.length, 2);
  assert.equal(report.decision, 'BLOCK');
  assert.equal(report.summary.block, 1);
  assert.equal(report.summary.pass, 1);
});

test('fleet enforces bounded concurrency', async () => {
  const config = validateFleetConfig({
    schema: 1,
    products: Array.from({ length: 5 }, (_, index) => ({ id: `p${index}`, root: `/p${index}`, profile: 'quick' })),
  });
  let active = 0;
  let maxActive = 0;
  await runFleet(config, async (product) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active -= 1;
    return cleanReport(product.id);
  }, { concurrency: 2 });
  assert.ok(maxActive <= 2);
  assert.ok(maxActive >= 1);
});

test('one product failure becomes isolated BLOCK and does not stop other products', async () => {
  const config = validateFleetConfig({
    schema: 1,
    products: [
      { id: 'ok', root: '/ok', profile: 'quick' },
      { id: 'broken', root: '/broken', profile: 'quick' },
    ],
  });
  const report = await runFleet(config, async (product) => {
    if (product.id === 'broken') throw new Error('boom');
    return cleanReport(product.id);
  });
  assert.equal(report.products.find((item) => item.id === 'ok').gate.decision, 'PASS');
  assert.equal(report.products.find((item) => item.id === 'broken').gate.decision, 'BLOCK');
  assert.equal(report.complete, false);
});
