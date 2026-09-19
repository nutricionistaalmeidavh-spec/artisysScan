import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  createSupplyChainPlan,
  normalizeTrivySupplyChain,
  runSupplyChain,
  summarizeCycloneDx,
} from '../src/index.ts';

test('supply chain plan generates CycloneDX and scans vulnerabilities/licenses with open-source tools', () => {
  const root = resolve('/tmp/product');
  const reportDir = resolve('/tmp/report');
  const plan = createSupplyChainPlan(root, reportDir);

  assert.equal(plan.length, 3);
  assert.equal(plan[0].tool, 'trivy');
  assert.ok(plan[0].args.includes('cyclonedx'));
  assert.ok(plan[0].args.includes(join(reportDir, 'sbom.cdx.json')));

  assert.equal(plan[1].tool, 'trivy');
  assert.ok(plan[1].args.includes('vuln,license'));
  assert.ok(plan[1].args.includes('--license-full'));
  assert.ok(plan[1].args.includes('json'));

  assert.equal(plan[2].tool, 'osv-scanner');
  assert.deepEqual(plan[2].args.slice(0, 3), ['scan', 'source', '--format=json']);
  assert.ok(plan[2].args.includes('--recursive'), 'OSV-Scanner v2 requires recursive mode for directory scans');
  assert.equal(plan[2].cwd, root);
  assert.equal(plan[2].args.at(-1), '.', 'OSV must scan cwd with a relative target so Windows drive paths are not misparsed');
  assert.ok(!plan[2].args.includes(root), 'OSV target must not repeat the absolute cwd path');

  for (const command of plan) assert.equal(command.shell, false);
});

test('OSV no package sources is not a supply-chain failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'artisys-supply-root-'));
  const outputDir = await mkdtemp(join(tmpdir(), 'artisys-supply-report-'));
  const report = await runSupplyChain(root, {
    outputDir,
    runner: async (command) => {
      if (command.step === 'sbom') {
        await writeFile(command.outputFile, JSON.stringify({
          bomFormat: 'CycloneDX',
          specVersion: '1.6',
          components: [],
          dependencies: [],
        }));
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      if (command.step === 'audit') {
        return { exitCode: 0, stdout: '{"Results":[]}', stderr: '' };
      }
      return {
        exitCode: 128,
        stdout: '',
        stderr: 'No package sources found, --help for usage information.',
      };
    },
  });

  const osv = report.steps.find((item) => item.step === 'osv');
  assert.equal(report.complete, true);
  assert.equal(osv?.status, 'skipped');
  assert.match(osv?.diagnostic ?? '', /No package sources found/i);
});

test('normalizes dependency vulnerabilities and license findings from Trivy JSON', () => {
  const report = normalizeTrivySupplyChain(JSON.stringify({
    Results: [{
      Target: 'package-lock.json',
      Vulnerabilities: [{
        VulnerabilityID: 'CVE-2026-0001',
        PkgName: 'demo-lib',
        InstalledVersion: '1.0.0',
        FixedVersion: '1.0.1',
        Title: 'Demo vulnerability',
        Severity: 'HIGH',
      }],
      Licenses: [{
        Name: 'GPL-3.0-only',
        Category: 'restricted',
        Severity: 'HIGH',
        PkgName: 'copyleft-lib',
      }],
    }],
  }));

  assert.equal(report.vulnerabilities.length, 1);
  assert.equal(report.vulnerabilities[0].id, 'CVE-2026-0001');
  assert.equal(report.vulnerabilities[0].fixedVersion, '1.0.1');
  assert.equal(report.licenses.length, 1);
  assert.equal(report.licenses[0].license, 'GPL-3.0-only');
  assert.equal(report.licenses[0].classification, 'restricted');
});

test('summarizes a CycloneDX document without discarding the original artifact', () => {
  const summary = summarizeCycloneDx(JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    components: [
      { type: 'library', name: 'a', version: '1.0.0' },
      { type: 'library', name: 'b', version: '2.0.0' },
    ],
    dependencies: [
      { ref: 'a', dependsOn: ['b'] },
      { ref: 'b', dependsOn: [] },
    ],
  }));

  assert.equal(summary.format, 'CycloneDX');
  assert.equal(summary.specVersion, '1.6');
  assert.equal(summary.components, 2);
  assert.equal(summary.dependencyEdges, 1);
});

test('rejects a non-CycloneDX SBOM instead of treating it as valid', () => {
  assert.throws(() => summarizeCycloneDx('{"bomFormat":"SPDX"}'), /CycloneDX/i);
});
