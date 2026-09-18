import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

test('quick workflow remains isolated PR/manual fallback without publishing releases', async () => {
  const yaml = await read('.github/workflows/scan-quick.yml');
  assert.match(yaml, /pull_request:/);
  assert.match(yaml, /workflow_dispatch:/);
  assert.doesNotMatch(yaml, /^\s*push:\s*$/m);
  assert.match(yaml, /npm run ci/);
  assert.doesNotMatch(yaml, /gh release|action-gh-release|npm publish/i);
});

test('full workflow is manual/reusable and never publishes a release', async () => {
  const yaml = await read('.github/workflows/scan-full.yml');
  assert.match(yaml, /workflow_dispatch:/);
  assert.match(yaml, /workflow_call:/);
  assert.match(yaml, /scan -- security/);
  assert.match(yaml, /scan -- supply-chain/);
  assert.doesNotMatch(yaml, /gh release|action-gh-release|npm publish/i);
});

test('manual workflow exposes profile choice and no automatic release publication', async () => {
  const yaml = await read('.github/workflows/scan-manual.yml');
  assert.match(yaml, /profile:/);
  assert.match(yaml, /quick/);
  assert.match(yaml, /full/);
  assert.match(yaml, /release/);
  assert.doesNotMatch(yaml, /gh release|action-gh-release|npm publish/i);
});
