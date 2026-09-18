import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { discoverProject } from '../src/index.ts';

async function tempProject(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

test('discovers Electron + Vite + Playwright + updater + NSIS without guessing business capabilities', async () => {
  const root = await tempProject('artisys-discovery-electron-');

  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'Meu Sistema Comercial',
      dependencies: {
        electron: '^39.0.0',
        react: '^19.0.0',
        'electron-updater': '^6.6.0',
        'better-sqlite3': '^12.0.0'
      },
      devDependencies: {
        vite: '^7.0.0',
        '@playwright/test': '^1.55.0',
        'electron-builder': '^26.0.0'
      },
      build: {
        win: {
          target: ['nsis']
        }
      }
    }, null, 2),
    'utf8',
  );
  await writeFile(join(root, 'vite.config.ts'), 'export default {};', 'utf8');
  await writeFile(join(root, 'playwright.config.ts'), 'export default {};', 'utf8');

  const result = await discoverProject(root);

  assert.equal(result.productType, 'hybrid');
  assert.deepEqual(result.runtime, { web: true, desktop: true, electron: true });
  assert.ok(result.ecosystems.includes('node'));
  assert.ok(result.tools.includes('vite'));
  assert.ok(result.tools.includes('electron'));
  assert.ok(result.tools.includes('playwright'));
  assert.ok(result.tools.includes('electron-builder'));
  assert.ok(result.tools.includes('electron-updater'));
  assert.ok(result.databases.includes('sqlite'));
  assert.equal(result.suggestedManifest.qa.playwright, true);
  assert.equal(result.suggestedManifest.release.installer, 'nsis');
  assert.equal(result.suggestedManifest.capabilities.updater, true);
  assert.equal(result.suggestedManifest.capabilities.authentication, 'review');
  assert.equal(result.suggestedManifest.capabilities.rbac, 'review');
  assert.equal(result.suggestedManifest.capabilities.multitenant, 'review');
  assert.equal(result.suggestedManifest.capabilities.superadmin, 'review');
});

test('unknown project stays conservative instead of silently disabling security checks', async () => {
  const root = await tempProject('artisys-discovery-unknown-');
  await writeFile(join(root, 'README.md'), '# projeto', 'utf8');

  const result = await discoverProject(root);

  assert.equal(result.productType, 'unknown');
  assert.deepEqual(result.runtime, { web: false, desktop: false, electron: false });
  assert.deepEqual(result.ecosystems, []);
  assert.equal(result.suggestedManifest.capabilities.authentication, 'review');
  assert.equal(result.suggestedManifest.capabilities.rbac, 'review');
  assert.equal(result.suggestedManifest.capabilities.multitenant, 'review');
  assert.equal(result.suggestedManifest.capabilities.superadmin, 'review');
  assert.equal(result.suggestedManifest.capabilities.updater, 'review');
  assert.equal(result.suggestedManifest.release.installer, 'unknown');
});

test('detects additional ecosystems and installer evidence from files', async () => {
  const root = await tempProject('artisys-discovery-multi-');
  await mkdir(join(root, 'desktop'));
  await writeFile(join(root, 'Backend.sln'), '', 'utf8');
  await writeFile(join(root, 'pyproject.toml'), '[project]\nname="worker"\n', 'utf8');
  await writeFile(join(root, 'composer.json'), '{}', 'utf8');
  await writeFile(join(root, 'desktop', 'Produto.iss'), '[Setup]\nAppName=Produto\n', 'utf8');

  const result = await discoverProject(root);

  assert.ok(result.ecosystems.includes('dotnet'));
  assert.ok(result.ecosystems.includes('python'));
  assert.ok(result.ecosystems.includes('php'));
  assert.equal(result.suggestedManifest.release.installer, 'inno');
  assert.ok(result.evidence.some((item) => item.path.endsWith('Produto.iss')));
});
