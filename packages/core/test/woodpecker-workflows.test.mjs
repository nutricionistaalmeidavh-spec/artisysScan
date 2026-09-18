import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

async function text(path) {
  return readFile(path, 'utf8');
}

test('woodpecker quick is automatic on trusted pushes using current windows local agent', async () => {
  const yaml = await text('.woodpecker/quick.yml');
  assert.match(yaml, /event:\s*push/);
  assert.doesNotMatch(yaml, /pull_request/);
  assert.match(yaml, /platform:\s*windows\/amd64/);
  assert.match(yaml, /backend:\s*local/);
  assert.match(yaml, /npm run ci/);
  assert.doesNotMatch(yaml, /release create|gh release|npm publish/i);
});

test('woodpecker full and fleet are manual windows-local workflows', async () => {
  for (const path of ['.woodpecker/full.yml', '.woodpecker/fleet.yml']) {
    const yaml = await text(path);
    assert.match(yaml, /event:\s*manual/);
    assert.match(yaml, /platform:\s*windows\/amd64/);
    assert.match(yaml, /backend:\s*local/);
    assert.doesNotMatch(yaml, /pull_request/);
    assert.doesNotMatch(yaml, /release create|gh release|npm publish/i);
  }
});

test('woodpecker release workflow targets elevated windows local agent and does not publish', async () => {
  const yaml = await text('.woodpecker/release-windows.yml');
  assert.match(yaml, /event:\s*manual/);
  assert.match(yaml, /platform:\s*windows\/amd64/);
  assert.match(yaml, /backend:\s*local/);
  assert.match(yaml, /privilege:\s*elevated/);
  assert.match(yaml, /npm run ci/);
  assert.doesNotMatch(yaml, /pull_request/);
  assert.doesNotMatch(yaml, /release create|gh release|npm publish/i);
});
