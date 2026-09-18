import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

async function text(path) {
  return readFile(path, 'utf8');
}

test('github actions are manual fallback only after woodpecker migration', async () => {
  for (const path of [
    '.github/workflows/ci.yml',
    '.github/workflows/scan-quick.yml',
    '.github/workflows/scan-full.yml',
    '.github/workflows/scan-manual.yml',
  ]) {
    const yaml = await text(path);
    assert.match(yaml, /workflow_dispatch:/);
    assert.doesNotMatch(yaml, /^\s*push:\s*$/m);
    assert.doesNotMatch(yaml, /^\s*pull_request:\s*$/m);
  }
});

test('repository documents woodpecker as primary but requires server activation verification', async () => {
  const activation = await text('docs/WOODPECKER_ACTIVATION.md');
  assert.match(activation, /primary/i);
  assert.match(activation, /server/i);
  assert.match(activation, /platform=windows\/amd64/i);
  assert.match(activation, /backend=local/i);
});
