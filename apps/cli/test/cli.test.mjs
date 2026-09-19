import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const cli = join(repoRoot, 'apps/cli/src/index.ts');

function runCli(args) {
  return spawnSync(process.execPath, ['--import', 'tsx', cli, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('validate prints the validated manifest as JSON and exits zero', async () => {
  const root = await mkdtemp(join(tmpdir(), 'artisys-cli-validate-'));
  const artisysDir = join(root, '.artisys');
  await mkdir(artisysDir);
  const manifest = join(artisysDir, 'scan.yml');

  await writeFile(manifest, `schema: 1\nproduct:\n  id: exemplo\n  type: web\nruntime:\n  web: true\n  desktop: false\n  electron: false\ncapabilities:\n  authentication: review\n  rbac: review\n  multitenant: review\n  superadmin: review\n  updater: review\nqa:\n  playwright: false\nrelease:\n  installer: unknown\n`, 'utf8');

  const result = runCli(['validate', manifest]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.product.id, 'exemplo');
  assert.equal(output.capabilities.multitenant, 'review');
});

test('discover prints a conservative discovery result as JSON', async () => {
  const root = await mkdtemp(join(tmpdir(), 'artisys-cli-discover-'));
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'web-demo', devDependencies: { vite: '^7.0.0' } }),
    'utf8',
  );
  await writeFile(join(root, 'vite.config.ts'), 'export default {};', 'utf8');

  const result = runCli(['discover', root]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.productType, 'web');
  assert.equal(output.runtime.web, true);
  assert.equal(output.suggestedManifest.capabilities.rbac, 'review');
});

test('gate evaluates a normalized report and exits BLOCK for high findings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'artisys-cli-gate-'));
  const reportPath = join(root, 'report.json');
  await writeFile(reportPath, JSON.stringify({
    productId: 'produto',
    profile: 'release',
    passed: false,
    complete: true,
    findings: [{ ruleId: 'HIGH-1', severity: 'high', message: 'block', tool: 'test' }],
    checks: [],
    evidence: [],
  }), 'utf8');

  const result = runCli(['gate', reportPath]);
  assert.equal(result.status, 3, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.decision, 'BLOCK');
});

test('fleet scans a quick local product and returns aggregate JSON', async () => {
  const root = await mkdtemp(join(tmpdir(), 'artisys-cli-fleet-'));
  const productRoot = join(root, 'product');
  await mkdir(productRoot);
  await writeFile(join(productRoot, 'package.json'), JSON.stringify({ name: 'fleet-demo' }), 'utf8');
  const configPath = join(root, 'fleet.yml');
  await writeFile(configPath, `schema: 1\nproducts:\n  - id: fleet-demo\n    root: ${JSON.stringify(productRoot)}\n    profile: quick\n`, 'utf8');

  const result = runCli(['fleet', configPath]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.products[0].id, 'fleet-demo');
  assert.equal(output.decision, 'PASS');
});

test('dashboard writes static fleet dashboard files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'artisys-cli-dashboard-'));
  const reportPath = join(root, 'fleet.json');
  const outputDir = join(root, 'dashboard');
  await writeFile(reportPath, JSON.stringify({
    complete: true,
    decision: 'PASS',
    summary: { pass: 1, warn: 0, block: 0 },
    products: [{
      id: 'produto',
      root: '.',
      profile: 'quick',
      report: { productId: 'produto', profile: 'quick', passed: true, complete: true, findings: [], checks: [], evidence: [] },
      gate: { decision: 'PASS', blocked: false, reasons: [], summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0, unknown: 0 } },
    }],
  }), 'utf8');

  const result = runCli(['dashboard', reportPath, outputDir]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.ok(output.files.includes('index.html'));
  assert.ok(output.files.includes('dashboard.json'));
});

test('safe mode refuses project execution overrides before touching the target', () => {
  const result = runCli(['installer', 'does-not-exist.json', '--safe', '--allow-project-exec', '--environment=staging']);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Safe mode blocks --allow-project-exec/);
  assert.doesNotMatch(result.stderr, /ENOENT/);
});

test('production environment refuses active or state-changing overrides', () => {
  const active = runCli(['web', 'https://example.invalid', '--allow-active', '--environment=production']);
  assert.equal(active.status, 2);
  assert.match(active.stderr, /Production environment blocks --allow-active/);

  const stateChange = runCli(['api', 'does-not-exist.yml', '--allow-state-change', '--environment=production']);
  assert.equal(stateChange.status, 2);
  assert.match(stateChange.stderr, /Production environment blocks --allow-state-change/);
  assert.doesNotMatch(stateChange.stderr, /ENOENT/);
});

test('unknown command exits non-zero and prints usage', () => {
  const result = runCli(['nope']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage:/);
});
