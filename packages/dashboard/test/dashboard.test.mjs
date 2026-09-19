import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  renderFleetDashboard,
  renderOperationalDashboard,
  writeFleetDashboard,
  writeOperationalDashboard,
} from '../src/index.ts';

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

const operational = {
  generatedAt: '2026-09-19T15:30:00.000Z',
  products: [{
    id: 'Loja Online',
    decision: 'PASS',
    complete: true,
    findings: [],
    checks: [
      { id: 'static-scan', name: 'Static scan', status: 'pass' },
      { id: 'tenant-dynamic', name: 'Multitenancy', status: 'pass' },
      { id: 'qa-functional', name: 'QA funcional', status: 'pass' },
      { id: 'mutable-security', name: 'Mutações descartáveis', status: 'pass' },
      { id: 'homologation-unified', name: 'Homologação unificada', status: 'pass' },
    ],
    history: [
      { timestamp: '2026-09-19T14:00:00.000Z', decision: 'BLOCK', critical: 3, high: 5, medium: 1 },
      { timestamp: '2026-09-19T15:30:00.000Z', decision: 'PASS', critical: 0, high: 0, medium: 0 },
    ],
  }],
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

test('operational control center renders product checks and scan history', () => {
  const html = renderOperationalDashboard(operational);
  assert.match(html, /ArtiSys Scan/);
  assert.match(html, /Loja Online/);
  assert.match(html, /QA funcional/);
  assert.match(html, /Mutações descartáveis/);
  assert.match(html, /Homologação unificada/);
  assert.match(html, /Histórico/);
  assert.match(html, /BLOCK/);
  assert.match(html, /PASS/);
});

test('operational control center writer emits index.html and dashboard.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'artisys-control-center-'));
  const result = await writeOperationalDashboard(operational, dir);
  assert.deepEqual(result.files.sort(), ['dashboard.json', 'index.html']);
  const json = JSON.parse(await readFile(join(dir, 'dashboard.json'), 'utf8'));
  assert.equal(json.products[0].checks.length, 5);
  assert.equal(json.products[0].history.length, 2);
});
