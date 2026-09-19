import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SecurityCommand } from './types.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export interface SourceSecurityPlanOptions {
  semgrepRulesPath?: string;
}

export function createSourceSecurityPlan(
  root: string,
  options: SourceSecurityPlanOptions = {},
): SecurityCommand[] {
  const cwd = resolve(root);
  const rulesPath = options.semgrepRulesPath ?? resolve(packageRoot, 'rules', 'semgrep.yml');

  return [
    {
      tool: 'semgrep',
      command: 'semgrep',
      args: ['scan', '--config', rulesPath, '--json', '--metrics=off', cwd],
      cwd,
      shell: false,
    },
    {
      tool: 'trivy',
      command: 'trivy',
      args: ['fs', '--scanners', 'misconfig,secret', '--format', 'json', '--quiet', cwd],
      cwd,
      shell: false,
    },
    {
      tool: 'gitleaks',
      command: 'gitleaks',
      args: ['dir', cwd, '--no-banner', '--no-color', '--log-level=fatal', '--report-format=json', '--report-path=-'],
      cwd,
      shell: false,
    },
    {
      tool: 'osv-scanner',
      command: 'osv-scanner',
      args: ['scan', 'source', '--format=json', '--recursive', cwd],
      cwd,
      shell: false,
    },
  ];
}
