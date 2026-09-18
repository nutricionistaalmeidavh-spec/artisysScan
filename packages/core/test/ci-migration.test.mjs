import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

async function text(path) {
  return readFile(path, 'utf8');
}

test('github quick remains PR isolation fallback while push CI moves to woodpecker', async () => {
  const quick = await text('.github/workflows/scan-quick.yml');
  assert.match(quick, /workflow_dispatch:/);
  assert.match(quick, /^\s*pull_request:\s*$/m);
  assert.doesNotMatch(quick, /^\s*push:\s*$/m);

  for (const path of [
    '.github/workflows/ci.yml',
    '.github/workflows/scan-full.yml',
    '.github/workflows/scan-manual.yml',
  ]) {
    const yaml = await text(path);
    assert.match(yaml, /workflow_dispatch:/);
    assert.doesNotMatch(yaml, /^\s*push:\s*$/m);
    assert.doesNotMatch(yaml, /^\s*pull_request:\s*$/m);
  }
});

test('repository documents woodpecker as primary and current windows-local safety boundary', async () => {
  const activation = await text('docs/WOODPECKER_ACTIVATION.md');
  assert.match(activation, /primary/i);
  assert.match(activation, /server/i);
  assert.match(activation, /platform=windows\/amd64/i);
  assert.match(activation, /backend=local/i);
  assert.match(activation, /pull request/i);
  assert.match(activation, /GitHub Actions/i);
});
