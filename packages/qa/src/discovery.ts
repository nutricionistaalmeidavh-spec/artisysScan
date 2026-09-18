import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { QaDiscovery } from './types.js';

const CONFIG_NAMES = [
  'playwright.config.ts',
  'playwright.config.mts',
  'playwright.config.cts',
  'playwright.config.js',
  'playwright.config.mjs',
  'playwright.config.cjs',
];

const SCRIPT_PRIORITY = ['artisys:qa', 'qa:full', 'qa', 'test:e2e', 'e2e'];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function discoverQaProject(root: string): Promise<QaDiscovery> {
  const target = resolve(root);
  const packageJsonPath = join(target, 'package.json');
  let packageJson: any = null;

  if (await exists(packageJsonPath)) {
    try {
      packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    } catch {
      packageJson = null;
    }
  }

  let playwrightConfig: string | undefined;
  for (const name of CONFIG_NAMES) {
    const candidate = join(target, name);
    if (await exists(candidate)) {
      playwrightConfig = candidate;
      break;
    }
  }

  const scripts = packageJson?.scripts && typeof packageJson.scripts === 'object' ? packageJson.scripts : {};
  const script = SCRIPT_PRIORITY.find((name) => typeof scripts[name] === 'string');
  const deps = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {}),
  };
  const hasPlaywrightDependency = typeof deps['@playwright/test'] === 'string' || typeof deps.playwright === 'string';
  const localPlaywright = join(target, 'node_modules', '.bin', process.platform === 'win32' ? 'playwright.cmd' : 'playwright');

  if (playwrightConfig || hasPlaywrightDependency) {
    return {
      mode: 'playwright',
      root: target,
      ...(packageJson ? { packageJson: packageJsonPath } : {}),
      ...(playwrightConfig ? { playwrightConfig } : {}),
      ...(script ? { script } : {}),
      localPlaywright,
      installsDependencies: false,
    };
  }

  if (script) {
    return {
      mode: 'script',
      root: target,
      packageJson: packageJsonPath,
      script,
      installsDependencies: false,
    };
  }

  return {
    mode: 'unavailable',
    root: target,
    ...(packageJson ? { packageJson: packageJsonPath } : {}),
    installsDependencies: false,
  };
}
