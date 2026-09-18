import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';

import {
  validateManifest,
  type ProductType,
  type ScanManifestV1,
} from '../../contracts/src/index.js';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.artisys-output',
]);

const MAX_DISCOVERY_DEPTH = 4;

export interface DiscoveryEvidence {
  path: string;
  signal: string;
}

export interface DiscoveryResult {
  root: string;
  filesInspected: number;
  ecosystems: string[];
  tools: string[];
  databases: string[];
  runtime: {
    web: boolean;
    desktop: boolean;
    electron: boolean;
  };
  productType: ProductType;
  evidence: DiscoveryEvidence[];
  suggestedManifest: ScanManifestV1;
}

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  build?: {
    win?: {
      target?: string | string[] | Array<string | { target?: string }>;
    };
    nsis?: unknown;
  };
}

function toPosix(path: string): string {
  return path.replaceAll('\\', '/');
}

async function collectFiles(
  root: string,
  current: string,
  depth: number,
  output: string[],
): Promise<void> {
  if (depth > MAX_DISCOVERY_DEPTH) return;

  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(current, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        await collectFiles(root, fullPath, depth + 1, output);
      }
      continue;
    }

    if (entry.isFile()) {
      output.push(toPosix(relative(root, fullPath)));
    }
  }
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function dependencyNames(pkg: PackageJson | undefined): Set<string> {
  return new Set([
    ...Object.keys(pkg?.dependencies ?? {}),
    ...Object.keys(pkg?.devDependencies ?? {}),
    ...Object.keys(pkg?.optionalDependencies ?? {}),
  ]);
}

function hasNsisTarget(pkg: PackageJson | undefined): boolean {
  if (pkg?.build?.nsis !== undefined) return true;

  const target = pkg?.build?.win?.target;
  if (typeof target === 'string') return target.toLowerCase() === 'nsis';
  if (!Array.isArray(target)) return false;

  return target.some((item) => {
    if (typeof item === 'string') return item.toLowerCase() === 'nsis';
    return item?.target?.toLowerCase() === 'nsis';
  });
}

function normalizeProductId(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');

  return normalized || 'project';
}

function classifyProduct(runtime: DiscoveryResult['runtime']): ProductType {
  if (runtime.web && runtime.desktop) return 'hybrid';
  if (runtime.desktop) return 'desktop';
  if (runtime.web) return 'web';
  return 'unknown';
}

export async function discoverProject(root: string): Promise<DiscoveryResult> {
  const files: string[] = [];
  await collectFiles(root, root, 0, files);

  const fileSet = new Set(files);
  const packageJson = await readJson<PackageJson>(join(root, 'package.json'));
  const deps = dependencyNames(packageJson);
  const evidence: DiscoveryEvidence[] = [];
  const ecosystems = new Set<string>();
  const tools = new Set<string>();
  const databases = new Set<string>();

  const addFileEvidence = (predicate: (path: string) => boolean, signal: string): boolean => {
    const match = files.find(predicate);
    if (!match) return false;
    evidence.push({ path: match, signal });
    return true;
  };

  const addDependencyTool = (dependency: string, tool = dependency): boolean => {
    if (!deps.has(dependency)) return false;
    tools.add(tool);
    evidence.push({ path: 'package.json', signal: `dependency:${dependency}` });
    return true;
  };

  if (fileSet.has('package.json')) {
    ecosystems.add('node');
    evidence.push({ path: 'package.json', signal: 'ecosystem:node' });
  }
  if (addFileEvidence((path) => path.endsWith('.sln') || path.endsWith('.csproj'), 'ecosystem:dotnet')) {
    ecosystems.add('dotnet');
  }
  if (addFileEvidence((path) => path === 'pyproject.toml' || path.endsWith('/pyproject.toml') || path === 'requirements.txt' || path.endsWith('/requirements.txt'), 'ecosystem:python')) {
    ecosystems.add('python');
  }
  if (addFileEvidence((path) => path === 'composer.json' || path.endsWith('/composer.json'), 'ecosystem:php')) {
    ecosystems.add('php');
  }

  const electron = addDependencyTool('electron', 'electron');
  const vite = addDependencyTool('vite', 'vite') || addFileEvidence((path) => /^vite\.config\.[cm]?[jt]s$/.test(path), 'tool:vite');
  if (vite) tools.add('vite');

  const react = deps.has('react') || deps.has('react-dom');
  if (react) {
    tools.add('react');
    evidence.push({ path: 'package.json', signal: 'framework:react' });
  }

  const next = addDependencyTool('next', 'next');
  const playwright =
    addDependencyTool('@playwright/test', 'playwright') ||
    addFileEvidence((path) => /^playwright\.config\.[cm]?[jt]s$/.test(path), 'tool:playwright');
  if (playwright) tools.add('playwright');

  const electronBuilder = addDependencyTool('electron-builder', 'electron-builder');
  const electronUpdater = addDependencyTool('electron-updater', 'electron-updater');

  if (deps.has('better-sqlite3') || deps.has('sqlite3')) {
    databases.add('sqlite');
    evidence.push({ path: 'package.json', signal: 'database:sqlite' });
  }
  if (deps.has('pg') || deps.has('postgres')) {
    databases.add('postgresql');
    evidence.push({ path: 'package.json', signal: 'database:postgresql' });
  }
  if (deps.has('mysql') || deps.has('mysql2')) {
    databases.add('mysql');
    evidence.push({ path: 'package.json', signal: 'database:mysql' });
  }

  const innoInstaller = addFileEvidence((path) => extname(path).toLowerCase() === '.iss', 'installer:inno');
  const nsisInstaller = hasNsisTarget(packageJson);
  if (nsisInstaller) {
    evidence.push({ path: 'package.json', signal: 'installer:nsis' });
  }

  if (electronBuilder) tools.add('electron-builder');
  if (electronUpdater) tools.add('electron-updater');

  const web = vite || react || next || fileSet.has('index.html');
  const desktop = electron || innoInstaller || nsisInstaller;
  const runtime = {
    web,
    desktop,
    electron,
  };
  const productType = classifyProduct(runtime);
  const installer = innoInstaller ? 'inno' : nsisInstaller ? 'nsis' : 'unknown';
  const productName = packageJson?.name ?? basename(root);

  const suggestedManifest = validateManifest({
    schema: 1,
    product: {
      id: normalizeProductId(productName),
      type: productType,
    },
    runtime,
    capabilities: {
      authentication: 'review',
      rbac: 'review',
      multitenant: 'review',
      superadmin: 'review',
      updater: electronUpdater ? true : 'review',
    },
    qa: {
      playwright,
    },
    release: {
      installer,
    },
  });

  return {
    root,
    filesInspected: files.length,
    ecosystems: [...ecosystems].sort(),
    tools: [...tools].sort(),
    databases: [...databases].sort(),
    runtime,
    productType,
    evidence,
    suggestedManifest,
  };
}
