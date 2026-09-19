import { join, resolve } from 'node:path';

import type { SupplyChainCommand } from './types.js';

export function createSupplyChainPlan(root: string, outputDir: string): SupplyChainCommand[] {
  const cwd = resolve(root);
  const reports = resolve(outputDir);
  const sbom = join(reports, 'sbom.cdx.json');

  return [
    {
      step: 'sbom',
      tool: 'trivy',
      command: 'trivy',
      args: ['fs', '--format', 'cyclonedx', '--output', sbom, cwd],
      cwd,
      shell: false,
      outputFile: sbom,
    },
    {
      step: 'audit',
      tool: 'trivy',
      command: 'trivy',
      args: ['fs', '--scanners', 'vuln,license', '--license-full', '--format', 'json', '--quiet', cwd],
      cwd,
      shell: false,
    },
    {
      step: 'osv',
      tool: 'osv-scanner',
      command: 'osv-scanner',
      args: ['scan', 'source', '--format=json', '--recursive', '.'],
      cwd,
      shell: false,
    },
  ];
}
