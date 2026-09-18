import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { normalizeSecurityOutput } from '../../security/src/index.js';
import { normalizeTrivySupplyChain, summarizeCycloneDx } from './normalize.js';
import { createSupplyChainPlan } from './plan.js';
import { runSupplyChainCommand } from './runner.js';
import type {
  SupplyChainReport,
  SupplyChainRunner,
} from './types.js';

export interface RunSupplyChainOptions {
  outputDir?: string;
  runner?: SupplyChainRunner;
}

export async function runSupplyChain(
  root: string,
  options: RunSupplyChainOptions = {},
): Promise<SupplyChainReport> {
  const target = resolve(root);
  const outputDir = resolve(options.outputDir ?? join(target, '.artisys', 'reports', 'supply-chain'));
  const runner = options.runner ?? runSupplyChainCommand;
  await mkdir(outputDir, { recursive: true });

  const report: SupplyChainReport = {
    root: target,
    outputDir,
    complete: true,
    vulnerabilities: [],
    licenses: [],
    osvFindings: [],
    artifacts: [],
    diagnostics: [],
  };

  for (const command of createSupplyChainPlan(target, outputDir)) {
    const result = await runner(command);
    if (result.errorCode === 'ENOENT') {
      report.complete = false;
      report.diagnostics.push(`${command.command} is not installed or not available in PATH`);
      continue;
    }

    if (command.step === 'sbom') {
      if (result.exitCode !== 0 || !command.outputFile) {
        report.complete = false;
        report.diagnostics.push(result.stderr.trim() || 'Trivy failed to generate CycloneDX SBOM');
        continue;
      }
      try {
        const raw = await readFile(command.outputFile, 'utf8');
        report.sbom = summarizeCycloneDx(raw);
        report.artifacts.push(command.outputFile);
      } catch (error) {
        report.complete = false;
        report.diagnostics.push(error instanceof Error ? error.message : String(error));
      }
      continue;
    }

    if (!result.stdout.trim()) {
      if (result.exitCode !== 0) {
        report.complete = false;
        report.diagnostics.push(result.stderr.trim() || `${command.tool} returned no machine-readable output`);
      }
      continue;
    }

    try {
      if (command.step === 'audit') {
        const artifact = join(outputDir, 'trivy-supply-chain.json');
        await writeFile(artifact, result.stdout, 'utf8');
        const normalized = normalizeTrivySupplyChain(result.stdout);
        report.vulnerabilities.push(...normalized.vulnerabilities);
        report.licenses.push(...normalized.licenses);
        report.artifacts.push(artifact);
      } else {
        const artifact = join(outputDir, 'osv-supply-chain.json');
        await writeFile(artifact, result.stdout, 'utf8');
        report.osvFindings.push(...normalizeSecurityOutput('osv-scanner', result.stdout));
        report.artifacts.push(artifact);
      }
    } catch (error) {
      report.complete = false;
      report.diagnostics.push(error instanceof Error ? error.message : String(error));
    }
  }

  return report;
}
