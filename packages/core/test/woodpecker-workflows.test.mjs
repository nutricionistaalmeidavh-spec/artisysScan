import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

async function text(path) {
  return readFile(path, 'utf8');
}

function assertWindowsPilot(yaml) {
  assert.match(yaml, /platform:\s*windows\/amd64/);
  assert.match(yaml, /backend:\s*local/);
  assert.match(yaml, /pilot:\s*pdv-artisys/);
  assert.match(yaml, /image:\s*powershell\.exe/);
}

test('woodpecker quick is automatic on trusted pushes using current windows local pilot agent', async () => {
  const yaml = await text('.woodpecker/quick.yml');
  assert.match(yaml, /event:\s*push/);
  assert.doesNotMatch(yaml, /pull_request/);
  assertWindowsPilot(yaml);
  assert.match(yaml, /npm run ci/);
  assert.doesNotMatch(yaml, /release create|gh release|npm publish/i);
});

test('woodpecker full and fleet are manual windows-local workflows on the current pilot agent', async () => {
  for (const path of ['.woodpecker/full.yml', '.woodpecker/fleet.yml']) {
    const yaml = await text(path);
    assert.match(yaml, /event:\s*manual/);
    assertWindowsPilot(yaml);
    assert.doesNotMatch(yaml, /pull_request/);
    assert.doesNotMatch(yaml, /release create|gh release|npm publish/i);
  }
});

test('woodpecker release workflow uses the homologated windows pilot agent and does not publish', async () => {
  const yaml = await text('.woodpecker/release-windows.yml');
  assert.match(yaml, /event:\s*manual/);
  assertWindowsPilot(yaml);
  assert.match(yaml, /npm run ci/);
  assert.doesNotMatch(yaml, /privilege:\s*elevated/);
  assert.doesNotMatch(yaml, /pull_request/);
  assert.doesNotMatch(yaml, /release create|gh release|npm publish/i);
});
