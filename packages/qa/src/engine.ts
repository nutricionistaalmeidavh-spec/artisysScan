import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { discoverQaProject } from './discovery.js';
import { createQaPlan } from './plan.js';
import { classifyQaArtifacts, summarizePlaywrightJson } from './results.js';
import { runQaCommand } from './runner.js';
import type { QaArtifacts, QaReport, QaRunner } from './types.js';

export interface RunQaOptions {
  outputDir?: string;
  allowProjectExecution?: boolean;
  runner?: QaRunner;
}

async function collectFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return output;
  }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) output.push(...await collectFiles(path));
    else if (entry.isFile()) output.push(path);
  }
  return output;
}

function emptyArtifacts(): QaArtifacts {
  return { screenshots: [], videos: [], traces: [], jsonReports: [], htmlReports: [], other: [] };
}

export async function runQa(root: string, options: RunQaOptions = {}): Promise<QaReport> {
  const target = resolve(root);
  const outputDir = resolve(options.outputDir ?? join(target, '.artisys', 'reports', 'qa'));
  const discovery = await discoverQaProject(target);

  if (discovery.mode === 'unavailable') {
    return {
      root: target,
      mode: 'unavailable',
      outputDir,
      executed: false,
      complete: false,
      passed: false,
      exitCode: null,
      artifacts: emptyArtifacts(),
      captures: {
        screenshots: 'best-effort',
        videos: 'best-effort',
        traces: 'best-effort',
        console: 'best-effort',
        network: 'best-effort',
      },
      diagnostics: ['No existing Playwright installation or recognized QA script was found'],
    };
  }

  if (!options.allowProjectExecution) {
    throw new Error('QA requires executing code from the target project. Re-run with explicit project execution permission.');
  }

  const plan = await createQaPlan(target, outputDir);
  await mkdir(outputDir, { recursive: true });

  if (plan.generatedConfigPath && plan.generatedConfigContent) {
    await mkdir(join(target, '.artisys', 'qa'), { recursive: true });
    await writeFile(plan.generatedConfigPath, plan.generatedConfigContent, 'utf8');
  }

  const runner = options.runner ?? runQaCommand;
  const result = await runner(plan.command);
  const diagnostics: string[] = [];
  let complete = true;

  if (result.errorCode === 'ENOENT') {
    complete = false;
    diagnostics.push(`${plan.command.command} is not installed or not available`);
  } else if (result.errorCode) {
    complete = false;
    diagnostics.push(result.stderr || result.errorCode);
  }

  const files = await collectFiles(outputDir);
  const artifacts = classifyQaArtifacts(files);
  let summary;

  if (plan.mode === 'playwright') {
    const jsonReport = plan.command.env.PLAYWRIGHT_JSON_OUTPUT_FILE;
    if (jsonReport) {
      try {
        summary = summarizePlaywrightJson(await readFile(jsonReport, 'utf8'));
      } catch (error) {
        complete = false;
        diagnostics.push(error instanceof Error ? error.message : String(error));
      }
    } else {
      complete = false;
      diagnostics.push('Playwright JSON report path was not configured');
    }
  }

  if (result.stderr.trim()) diagnostics.push(result.stderr.trim());
  const testsPassed = summary ? summary.failed === 0 && summary.other === 0 : result.exitCode === 0;

  return {
    root: target,
    mode: plan.mode,
    outputDir,
    executed: result.exitCode !== null || !result.errorCode,
    complete,
    passed: complete && result.exitCode === 0 && testsPassed,
    exitCode: result.exitCode,
    ...(summary ? { summary } : {}),
    artifacts,
    captures: plan.captures,
    diagnostics,
  };
}
