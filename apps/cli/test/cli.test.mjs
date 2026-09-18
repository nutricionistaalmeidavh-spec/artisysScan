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

test('unknown command exits non-zero and prints usage', () => {
  const result = runCli(['nope']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage:/);
});
