import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  ManifestValidationError,
  loadManifest,
  validateManifest,
} from '../src/index.ts';

const validManifest = {
  schema: 1,
  product: {
    id: 'obra-na-mao',
    type: 'saas',
  },
  runtime: {
    web: true,
    desktop: true,
    electron: true,
  },
  capabilities: {
    authentication: true,
    rbac: true,
    multitenant: true,
    superadmin: 'review',
    updater: true,
  },
  qa: {
    playwright: true,
  },
  release: {
    installer: 'nsis',
  },
};

test('validateManifest accepts schema v1 and preserves review capability', () => {
  const manifest = validateManifest(validManifest);

  assert.equal(manifest.schema, 1);
  assert.equal(manifest.capabilities.superadmin, 'review');
  assert.equal(manifest.release.installer, 'nsis');
});

test('validateManifest rejects unknown properties instead of silently ignoring them', () => {
  assert.throws(
    () => validateManifest({ ...validManifest, unexpected: true }),
    (error) => {
      assert.ok(error instanceof ManifestValidationError);
      assert.match(error.message, /unexpected|additional/i);
      return true;
    },
  );
});

test('loadManifest parses YAML from .artisys/scan.yml', async () => {
  const root = await mkdtemp(join(tmpdir(), 'artisys-contract-'));
  const path = join(root, 'scan.yml');

  await writeFile(
    path,
    `schema: 1
product:
  id: pdv-artisys
  type: hybrid
runtime:
  web: true
  desktop: true
  electron: true
capabilities:
  authentication: review
  rbac: review
  multitenant: false
  superadmin: false
  updater: true
qa:
  playwright: true
release:
  installer: nsis
`,
    'utf8',
  );

  const manifest = await loadManifest(path);

  assert.equal(manifest.product.id, 'pdv-artisys');
  assert.equal(manifest.capabilities.authentication, 'review');
  assert.equal(manifest.runtime.electron, true);
});
