import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectUpdaterArtifacts, runUpdateScenario } from '../src/index.ts';

test('latest.yml requires version, path, sha512 and matching blockmap evidence', () => {
  const report = inspectUpdaterArtifacts({
    latestYml: `version: 1.2.3\npath: Product-1.2.3.exe\nsha512: abc123\n`,
    files: ['Product-1.2.3.exe', 'Product-1.2.3.exe.blockmap', 'latest.yml'],
  });
  assert.equal(report.complete, true);
  assert.equal(report.findings.length, 0);
  assert.equal(report.manifest.version, '1.2.3');
});

test('missing sha512 or blockmap becomes a release finding', () => {
  const report = inspectUpdaterArtifacts({
    latestYml: `version: 1.2.3\npath: Product-1.2.3.exe\n`,
    files: ['Product-1.2.3.exe', 'latest.yml'],
  });
  const ids = report.findings.map((finding) => finding.ruleId);
  assert.ok(ids.includes('ARTISYS-UPDATE-001'));
  assert.ok(ids.includes('ARTISYS-UPDATE-002'));
});

test('update scenario verifies version change, restart and data persistence', async () => {
  let version = '1.0.0';
  let sentinel = 'customer-data';
  let restarted = false;
  const adapter = {
    async getVersion() { return version; },
    async readSentinel() { return sentinel; },
    async applyUpdate() { version = '1.1.0'; },
    async restart() { restarted = true; },
    async rollback() { version = '1.0.0'; },
  };
  const report = await runUpdateScenario({ fromVersion: '1.0.0', toVersion: '1.1.0', requireRollback: true }, adapter);
  assert.equal(report.passed, true);
  assert.equal(restarted, true);
  assert.equal(report.dataPreserved, true);
  assert.equal(report.rollbackVerified, true);
});
