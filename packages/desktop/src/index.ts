import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

export type DesktopSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface DesktopFinding {
  tool: 'desktop';
  ruleId: string;
  severity: DesktopSeverity;
  message: string;
  path?: string;
}

export interface DesktopScanReport {
  root: string;
  complete: boolean;
  scannedFiles: number;
  findings: DesktopFinding[];
  passed: boolean;
  diagnostic?: string;
}

function finding(ruleId: string, severity: DesktopSeverity, message: string, path?: string): DesktopFinding {
  return { tool: 'desktop', ruleId, severity, message, ...(path ? { path } : {}) };
}

function hasStrictExternalUrlAllowlist(source: string): boolean {
  return /new\s+URL\s*\(/.test(source)
    && /\.protocol\s*===\s*['"]https:['"]/.test(source)
    && /\.hostname\s*===\s*['"][A-Za-z0-9.-]+['"]/.test(source)
    && /\.pathname/.test(source)
    && /return\s*\{\s*action\s*:\s*['"]deny['"]\s*\}/.test(source);
}

export function analyzeElectronText(path: string, source: string): DesktopFinding[] {
  const findings: DesktopFinding[] = [];
  const rules: Array<[RegExp, string, DesktopSeverity, string]> = [
    [/nodeIntegration\s*:\s*true/gi, 'ARTISYS-ELECTRON-001', 'critical', 'Electron nodeIntegration is enabled.'],
    [/contextIsolation\s*:\s*false/gi, 'ARTISYS-ELECTRON-002', 'critical', 'Electron contextIsolation is disabled.'],
    [/sandbox\s*:\s*false/gi, 'ARTISYS-ELECTRON-003', 'high', 'Electron sandbox is disabled.'],
    [/webviewTag\s*:\s*true/gi, 'ARTISYS-ELECTRON-004', 'high', 'Electron webviewTag is enabled.'],
    [/loadURL\s*\(\s*['"]http:\/\//gi, 'ARTISYS-ELECTRON-005', 'high', 'Electron loads remote content over insecure HTTP.'],
    [/devTools\s*:\s*true/gi, 'ARTISYS-ELECTRON-006', 'low', 'DevTools are explicitly enabled; verify release behavior.'],
    [/contextBridge\.exposeInMainWorld\s*\([^,]+,\s*ipcRenderer\s*\)/gi, 'ARTISYS-ELECTRON-007', 'critical', 'Preload exposes ipcRenderer directly to renderer code.'],
    [/localStorage\.setItem\s*\(\s*['"][^'"]*(token|secret|jwt|session)/gi, 'ARTISYS-DESKTOP-TOKEN-002', 'high', 'Sensitive authentication material appears to be persisted in localStorage.'],
    [/console\.(log|info|debug)\s*\([^\n]*(token|secret|jwt|session)/gi, 'ARTISYS-DESKTOP-TOKEN-003', 'medium', 'Potential authentication material is written to application logs.'],
  ];
  for (const [pattern, ruleId, severity, message] of rules) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) findings.push(finding(ruleId, severity, message, path));
  }
  if (/shell\.openExternal\s*\(/.test(source) && !hasStrictExternalUrlAllowlist(source)) {
    findings.push(finding('ARTISYS-ELECTRON-008', 'medium', 'shell.openExternal usage requires strict URL allowlisting.', path));
  }
  if (/ipcMain\.(handle|on)\s*\(/.test(source) && !/(senderFrame|event\.sender|event\.senderFrame|validateSender|isTrustedSender)/.test(source)) {
    findings.push(finding('ARTISYS-ELECTRON-009', 'medium', 'IPC handler found without observable sender validation; review the channel allowlist and sender origin.', path));
  }
  return findings;
}

function isNonProductionArtifactScope(path: string): boolean {
  return /(?:^|\/)(?:qa|test|tests|e2e|fixtures?|mocks?|__tests__|samples?)(?:\/|$)/i.test(path);
}

export function analyzeDesktopArtifacts(paths: string[]): DesktopFinding[] {
  const findings: DesktopFinding[] = [];
  for (const path of paths) {
    const normalized = path.replaceAll('\\', '/');
    if (/\.(sqlite|sqlite3|db)$/i.test(normalized) && !/(fixture|sample|test|mock)/i.test(normalized)) {
      findings.push(finding('ARTISYS-DESKTOP-DATA-001', 'high', 'Tracked SQLite/database artifact may contain customer or production data.', path));
    }
    const authenticationArtifactName = /(token|session|auth|credential)[^/]*\.(log|json|txt)$/i.test(normalized)
      || /logs?\/[^/]*(token|session|auth|credential)/i.test(normalized);
    if (authenticationArtifactName && !isNonProductionArtifactScope(normalized)) {
      findings.push(finding('ARTISYS-DESKTOP-TOKEN-001', 'high', 'Tracked artifact name suggests authentication material may be persisted in logs or files.', path));
    }
  }
  return findings;
}

const SOURCE_EXTENSIONS = /\.(cjs|mjs|js|jsx|ts|tsx)$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next']);

async function walk(root: string, current: string, files: string[], limit: number): Promise<void> {
  if (files.length >= limit) return;
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (files.length >= limit) break;
    if (SKIP_DIRS.has(entry.name)) continue;
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) await walk(root, absolute, files, limit);
    else files.push(relative(root, absolute));
  }
}

export async function runDesktopScan(root: string, options: { maxFiles?: number } = {}): Promise<DesktopScanReport> {
  const paths: string[] = [];
  try {
    await walk(root, root, paths, options.maxFiles ?? 1500);
    const findings = analyzeDesktopArtifacts(paths);
    let scannedFiles = 0;
    for (const path of paths) {
      if (!SOURCE_EXTENSIONS.test(path)) continue;
      const lower = path.toLowerCase();
      if (!/(electron|preload|main|desktop|ipc)/.test(lower)) continue;
      const source = await readFile(join(root, path), 'utf8').catch(() => null);
      if (source === null) continue;
      scannedFiles += 1;
      findings.push(...analyzeElectronText(path, source));
    }
    return {
      root,
      complete: true,
      scannedFiles,
      findings,
      passed: !findings.some((item) => item.severity === 'critical' || item.severity === 'high'),
    };
  } catch (error) {
    return {
      root,
      complete: false,
      scannedFiles: 0,
      findings: [],
      passed: false,
      diagnostic: error instanceof Error ? error.message : String(error),
    };
  }
}
