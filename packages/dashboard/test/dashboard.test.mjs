import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { renderFleetDashboard, writeFleetDashboard } from '../src/index.ts';

const fleet = {
  complete: true,
  decision: 'BLOCK',
  summary: { pass: 1, warn: 1, block: 1 },
  products: [
    { id: 'safe', gate: { decision: 'PASS', blocked: false, reasons: [] }, report: { findings: [] } },
    { id: 'review', gate: { decision: 'WARN', blocked: false, reasons: ['medium finding'] }, report: { findings: [{ severity: 'medium' }] } },
    { id: '<script>alert(1)</script>', gate: { decision: 'BLOCK', blocked: true, reasons: ['critical finding'] }, report: { findings: [{ severity: 'critical' }] } },
  ],
};

test('dashboard renders PASS WARN BLOCK cards and escapes product ids', () => {
  const html = renderFleetDashboard(fleet);
  assert.match(html, /PASS/);
  assert.match(html, /WARN/);
  assert.match(html, /BLOCK/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('dashboard writer emits index.html and dashboard.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'artisys-dashboard-'));
  const result = await writeFleetDashboard(fleet, dir);
  assert.deepEqual(result.files.sort(), ['dashboard.json', 'index.html']);
  const json = JSON.parse(await readFile(join(dir, 'dashboard.json'), 'utf8'));
  assert.equal(json.summary.block, 1);
  assert.equal(json.products.length, 3);
});
