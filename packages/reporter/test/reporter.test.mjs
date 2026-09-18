import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { renderTerminal, writeReportBundle } from '../src/index.ts';

const input = {
  productId: 'demo',
  profile: 'full',
  passed: false,
  complete: true,
  findings: [
    { ruleId: 'ARTISYS-TENANT-001', severity: 'critical', message: 'Cross-tenant access', tool: 'tenant', path: '/api/orders' },
    { ruleId: 'ARTISYS-WEB-001', severity: 'medium', message: '<missing CSP>', tool: 'web' },
  ],
  checks: [
    { id: 'tenant', name: 'Multitenant', status: 'failed', durationMs: 25 },
    { id: 'web', name: 'Web', status: 'passed', durationMs: 10 },
  ],
  evidence: ['qa/video.webm', 'qa/trace.zip'],
};

test('terminal renderer shows overall status and severity counts', () => {
  const text = renderTerminal(input);
  assert.match(text, /BLOCK|FAIL/i);
  assert.match(text, /critical\s*1/i);
  assert.match(text, /ARTISYS-TENANT-001/);
});

test('report bundle writes JSON, HTML, SARIF, JUnit, evidence and preserves SBOM', async () => {
  const root = await mkdtemp(join(tmpdir(), 'artisys-reporter-'));
  const sbom = join(root, 'source-sbom.json');
  await writeFile(sbom, JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.6', components: [] }));
  const output = join(root, 'out');
  const result = await writeReportBundle({ ...input, sbomPath: sbom }, output);
  assert.deepEqual(result.files.sort(), ['evidence.json', 'findings.sarif', 'junit.xml', 'report.html', 'sbom.cdx.json', 'summary.json'].sort());
  const html = await readFile(join(output, 'report.html'), 'utf8');
  assert.match(html, /&lt;missing CSP&gt;/);
  const sarif = JSON.parse(await readFile(join(output, 'findings.sarif'), 'utf8'));
  assert.equal(sarif.version, '2.1.0');
  const junit = await readFile(join(output, 'junit.xml'), 'utf8');
  assert.match(junit, /failures="1"/);
});
