import { resolve } from 'node:path';

import { normalizeSecurityOutput } from './normalize.js';
import { createSourceSecurityPlan, type SourceSecurityPlanOptions } from './plan.js';
import { runSecurityCommand } from './runner.js';
import type {
  CommandRunner,
  FindingSeverity,
  SecurityFinding,
  SecurityToolReport,
  SourceSecurityReport,
} from './types.js';

export interface RunSourceSecurityOptions extends SourceSecurityPlanOptions {
  runner?: CommandRunner;
}

function summarize(findings: SecurityFinding[]): Record<FindingSeverity, number> {
  const summary: Record<FindingSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    unknown: 0,
  };
  for (const finding of findings) summary[finding.severity] += 1;
  return summary;
}

export async function runSourceSecurity(
  root: string,
  options: RunSourceSecurityOptions = {},
): Promise<SourceSecurityReport> {
  const target = resolve(root);
  const runner = options.runner ?? runSecurityCommand;
  const tools: SecurityToolReport[] = [];

  for (const command of createSourceSecurityPlan(target, options)) {
    const result = await runner(command);

    if (result.errorCode === 'ENOENT') {
      tools.push({
        tool: command.tool,
        status: 'unavailable',
        exitCode: null,
        findings: [],
        diagnostic: `${command.command} is not installed or not available in PATH`,
      });
      continue;
    }

    try {
      const findings = normalizeSecurityOutput(command.tool, result.stdout);
      const status = findings.length > 0 ? 'findings' : result.exitCode === 0 ? 'ok' : 'error';
      tools.push({
        tool: command.tool,
        status,
        exitCode: result.exitCode,
        findings,
        ...(status === 'error' && result.stderr.trim() ? { diagnostic: result.stderr.trim() } : {}),
      });
    } catch (error) {
      tools.push({
        tool: command.tool,
        status: 'error',
        exitCode: result.exitCode,
        findings: [],
        diagnostic: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const findings = tools.flatMap((tool) => tool.findings);
  return {
    root: target,
    complete: tools.every((tool) => tool.status !== 'unavailable' && tool.status !== 'error'),
    tools,
    findings,
    summary: summarize(findings),
  };
}
