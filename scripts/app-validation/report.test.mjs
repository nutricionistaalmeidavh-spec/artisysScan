import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const reporter = resolve('scripts/app-validation/report.mjs');

function scenario(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'artisys-report-'));
  for (const name of ['impeccable', 'hallmark', 'security', 'supply-chain']) {
    writeFileSync(join(dir, name + '.exit'), '0\n');
    writeFileSync(join(dir, name + (name === 'impeccable' || name === 'hallmark' ? '.json' : '.txt')), '{}\n');
  }
  for (const [name, value] of Object.entries(overrides)) {
    writeFileSync(join(dir, name), String(value));
  }
  const {GITHUB_STEP_SUMMARY: _ignored, ...env} = process.env;
  const result = spawnSync(process.execPath, [reporter, dir], { encoding:'utf8', env });
  const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'));
  rmSync(dir, {recursive:true,force:true});
  return {result, report};
}

test('all executed tools succeed: PASS applies only to static scope; agent skill remains NOT_RUN', () => {
  const {result, report} = scenario();
  assert.equal(result.status, 0);
  assert.equal(report.overall, 'PASS');
  assert.equal(report.cloudflare_security_audit_skill.status,'NOT_RUN');
});
test('missing evidence is INCOMPLETE and blocks completion', () => {
  const {result,report} = scenario({'security.txt':''});
  assert.equal(result.status, 1);
  assert.equal(report.checks.security.status,'INCOMPLETE');
  assert.equal(report.overall,'INCOMPLETE');
});
test('security critical findings block the audit', () => {
  const {result,report} = scenario({'security.exit':'3\n'});
  assert.equal(result.status, 1);
  assert.equal(report.checks.security.status,'BLOCK');
  assert.equal(report.overall,'BLOCK');
});
test('no frontend source produces NOT_APPLICABLE for design checks, not a misleading PASS', () => {
  const {result,report} = scenario({'hallmark.skip':'No frontend files\n','impeccable.skip':'No frontend files\n'});
  assert.equal(result.status, 0);
  assert.equal(report.checks.hallmark.status,'NOT_APPLICABLE');
  assert.equal(report.checks.impeccable.status,'NOT_APPLICABLE');
  assert.equal(report.overall,'PASS');
});
