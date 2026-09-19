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

function isNoPackageSources(step: string, exitCode: number | null, stderr: string): boolean {
  return step === 'osv'
    && exitCode !== 0
    && /No package sources found/i.test(stderr);
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
    steps: [],
  };

  for (const command of createSupplyChainPlan(target, outputDir)) {
    const result = await runner(command);
    const fail = (diagnostic: string, status: 'unavailable' | 'error' = 'error'): void => {
      report.complete = false;
      report.diagnostics.push(`${command.step}/${command.tool}: ${diagnostic}`);
      report.steps.push({
        step: command.step,
        tool: command.tool,
        status,
        exitCode: result.exitCode,
        diagnostic,
      });
    };

    if (result.errorCode === 'ENOENT') {
      fail(`${command.command} is not installed or not available in PATH`, 'unavailable');
      continue;
    }

    const stderr = result.stderr.trim();
    if (isNoPackageSources(command.step, result.exitCode, stderr)) {
      report.steps.push({
        step: command.step,
        tool: command.tool,
        status: 'skipped',
        exitCode: result.exitCode,
        diagnostic: stderr,
      });
      continue;
    }

    if (command.step === 'sbom') {
      if (result.exitCode !== 0 || !command.outputFile) {
        fail(stderr || 'Trivy failed to generate CycloneDX SBOM');
        continue;
      }
      try {
        const raw = await readFile(command.outputFile, 'utf8');
        report.sbom = summarizeCycloneDx(raw);
        report.artifacts.push(command.outputFile);
        report.steps.push({ step: command.step, tool: command.tool, status: 'ok', exitCode: result.exitCode });
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
      continue;
    }

    if (!result.stdout.trim()) {
      if (result.exitCode !== 0) {
        fail(stderr || `${command.tool} returned no machine-readable output`);
      } else {
        report.steps.push({ step: command.step, tool: command.tool, status: 'ok', exitCode: result.exitCode });
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
        report.steps.push({
          step: command.step,
          tool: command.tool,
          status: normalized.vulnerabilities.length + normalized.licenses.length > 0 ? 'findings' : 'ok',
          exitCode: result.exitCode,
          ...(stderr ? { diagnostic: stderr } : {}),
        });
      } else {
        const artifact = join(outputDir, 'osv-supply-chain.json');
        await writeFile(artifact, result.stdout, 'utf8');
        const osvFindings = normalizeSecurityOutput('osv-scanner', result.stdout);
        report.osvFindings.push(...osvFindings);
        report.artifacts.push(artifact);
        report.steps.push({
          step: command.step,
          tool: command.tool,
          status: osvFindings.length > 0 ? 'findings' : 'ok',
          exitCode: result.exitCode,
          ...(stderr ? { diagnostic: stderr } : {}),
        });
      }
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }

  return report;
}
