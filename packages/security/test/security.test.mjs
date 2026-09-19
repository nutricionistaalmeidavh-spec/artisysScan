import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  createSourceSecurityPlan,
  normalizeSecurityOutput,
} from '../src/index.ts';

test('source security plan uses four open-source scanners without shell execution', () => {
  const root = resolve('/tmp/product');
  const plan = createSourceSecurityPlan(root);

  assert.deepEqual(plan.map((item) => item.tool), [
    'semgrep',
    'trivy',
    'gitleaks',
    'osv-scanner',
  ]);

  for (const command of plan) {
    assert.equal(command.cwd, root);
    assert.equal(command.shell, false);
  }

  const semgrep = plan[0];
  assert.ok(semgrep.args.includes('--json'));
  assert.ok(semgrep.args.includes('--metrics=off'));
  assert.ok(!semgrep.args.includes('auto'), 'Semgrep must use the bundled local ruleset');

  const trivy = plan[1];
  assert.ok(trivy.args.includes('misconfig,secret'));
  assert.ok(trivy.args.includes('json'));

  const gitleaks = plan[2];
  assert.ok(gitleaks.args.includes('--report-format=json'));
  assert.ok(gitleaks.args.includes('--report-path=-'));

  const osv = plan[3];
  assert.deepEqual(osv.args.slice(0, 3), ['scan', 'source', '--format=json']);
});

test('normalizes Semgrep, Trivy, Gitleaks and OSV into one finding contract', () => {
  const semgrep = normalizeSecurityOutput('semgrep', JSON.stringify({
    results: [{
      check_id: 'artisys.javascript.eval',
      path: 'src/app.js',
      start: { line: 7 },
      extra: { message: 'Avoid eval', severity: 'ERROR' },
    }],
  }));
  assert.equal(semgrep[0].ruleId, 'artisys.javascript.eval');
  assert.equal(semgrep[0].severity, 'high');
  assert.equal(semgrep[0].line, 7);

  const trivy = normalizeSecurityOutput('trivy', JSON.stringify({
    Results: [{
      Target: 'Dockerfile',
      Misconfigurations: [{ ID: 'DS002', Title: 'Root user', Severity: 'HIGH' }],
      Secrets: [{ RuleID: 'aws-access-key-id', Title: 'AWS key', Severity: 'CRITICAL', StartLine: 3 }],
    }],
  }));
  assert.equal(trivy.length, 2);
  assert.equal(trivy[1].severity, 'critical');

  const gitleaks = normalizeSecurityOutput('gitleaks', JSON.stringify([{ 
    RuleID: 'generic-api-key',
    Description: 'Generic API key',
    File: '.env',
    StartLine: 2,
    Secret: 'DO-NOT-LEAK-THIS',
    Fingerprint: 'abc:2',
  }]));
  assert.equal(gitleaks[0].path, '.env');
  assert.equal(gitleaks[0].fingerprint, 'abc:2');
  assert.ok(!JSON.stringify(gitleaks).includes('DO-NOT-LEAK-THIS'));

  const osv = normalizeSecurityOutput('osv-scanner', JSON.stringify({
    results: [{
      source: { path: 'package-lock.json', type: 'lockfile' },
      packages: [{
        package: { name: 'demo', version: '1.0.0', ecosystem: 'npm' },
        vulnerabilities: [{ id: 'GHSA-demo', database_specific: { severity: 'HIGH' }, summary: 'Demo vuln' }],
      }],
    }],
  }));
  assert.equal(osv[0].ruleId, 'GHSA-demo');
  assert.equal(osv[0].packageName, 'demo');
});

test('invalid scanner JSON becomes a controlled parser error', () => {
  assert.throws(
    () => normalizeSecurityOutput('semgrep', '{not-json'),
    /semgrep.*JSON/i,
  );
});
