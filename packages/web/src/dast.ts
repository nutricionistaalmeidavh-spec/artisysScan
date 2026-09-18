import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type DastSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface DastCommand {
  tool: 'zap-baseline' | 'nuclei';
  command: string;
  args: string[];
  cwd: string;
  shell: false;
  outputPath: string;
  acceptedExitCodes: number[];
}

export interface DastFinding {
  ruleId: string;
  severity: DastSeverity;
  message: string;
  url: string;
  tool: 'zap-baseline' | 'nuclei';
}

export interface DastToolResult {
  tool: DastCommand['tool'];
  exitCode: number | null;
  complete: boolean;
  error?: string;
  findings: DastFinding[];
  artifacts: string[];
}

export interface WebDastReport {
  target: string;
  complete: boolean;
  passed: boolean;
  findings: DastFinding[];
  tools: DastToolResult[];
}

function normalizeSeverity(value: unknown): DastSeverity {
  const severity = String(value ?? '').toLowerCase();
  if (severity.includes('critical')) return 'critical';
  if (severity.includes('high')) return 'high';
  if (severity.includes('medium') || severity.includes('moderate')) return 'medium';
  if (severity.includes('low')) return 'low';
  return 'info';
}

function zapSeverity(alert: Record<string, unknown>): DastSeverity {
  const riskCode = Number(alert.riskcode);
  if (riskCode >= 4) return 'critical';
  if (riskCode === 3) return 'high';
  if (riskCode === 2) return 'medium';
  if (riskCode === 1) return 'low';
  return normalizeSeverity(alert.riskdesc);
}

export function normalizeZapJson(raw: string): DastFinding[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('ZAP output is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { site?: unknown }).site)) return [];
  const findings: DastFinding[] = [];
  for (const site of (parsed as { site: unknown[] }).site) {
    if (typeof site !== 'object' || site === null) continue;
    const alerts = (site as { alerts?: unknown }).alerts;
    if (!Array.isArray(alerts)) continue;
    for (const item of alerts) {
      if (typeof item !== 'object' || item === null) continue;
      const alert = item as Record<string, unknown>;
      const instances = Array.isArray(alert.instances) ? alert.instances : [];
      const first = instances[0];
      const url = typeof first === 'object' && first !== null && typeof (first as { uri?: unknown }).uri === 'string'
        ? String((first as { uri: string }).uri)
        : '';
      findings.push({
        ruleId: `ZAP-${String(alert.pluginid ?? 'unknown')}`,
        severity: zapSeverity(alert),
        message: String(alert.alert ?? alert.name ?? 'OWASP ZAP alert'),
        url,
        tool: 'zap-baseline',
      });
    }
  }
  return findings;
}

export function normalizeNucleiJsonl(raw: string): DastFinding[] {
  const findings: DastFinding[] = [];
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error('Nuclei output contains invalid JSONL');
    }
    if (typeof parsed !== 'object' || parsed === null) continue;
    const item = parsed as Record<string, unknown>;
    const info = typeof item.info === 'object' && item.info !== null ? item.info as Record<string, unknown> : {};
    findings.push({
      ruleId: `NUCLEI-${String(item['template-id'] ?? 'unknown')}`,
      severity: normalizeSeverity(info.severity),
      message: String(info.name ?? item['template-id'] ?? 'Nuclei finding'),
      url: String(item['matched-at'] ?? item.host ?? ''),
      tool: 'nuclei',
    });
  }
  return findings;
}

export function createWebDastPlan(target: string, outputDir: string, options: { allowActive?: boolean } = {}): DastCommand[] {
  const dir = resolve(outputDir);
  const plan: DastCommand[] = [{
    tool: 'zap-baseline',
    command: 'docker',
    args: [
      'run', '--rm', '-v', `${dir}:/zap/wrk/:rw`, '-t',
      'ghcr.io/zaproxy/zaproxy:stable',
      'zap-baseline.py', '-t', target,
      '-J', 'zap.json', '-r', 'zap.html', '-I',
    ],
    cwd: dir,
    shell: false,
    outputPath: join(dir, 'zap.json'),
    acceptedExitCodes: [0, 1, 2],
  }];
  if (options.allowActive) {
    plan.push({
      tool: 'nuclei',
      command: 'nuclei',
      args: ['-u', target, '-jsonl', '-o', join(dir, 'nuclei.jsonl'), '-severity', 'low,medium,high,critical'],
      cwd: dir,
      shell: false,
      outputPath: join(dir, 'nuclei.jsonl'),
      acceptedExitCodes: [0],
    });
  }
  return plan;
}

async function execute(command: DastCommand): Promise<{ exitCode: number | null; error?: string }> {
  return new Promise((resolveResult) => {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      shell: command.shell,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer | string) => { stderr += chunk.toString(); });
    child.on('error', (error) => resolveResult({ exitCode: null, error: error.message }));
    child.on('close', (code) => {
      if (code !== null && command.acceptedExitCodes.includes(code)) resolveResult({ exitCode: code });
      else resolveResult({ exitCode: code, error: stderr.trim() || `${command.tool} exited with code ${String(code)}` });
    });
  });
}

export async function runWebDast(target: string, outputDir: string, options: { allowActive?: boolean } = {}): Promise<WebDastReport> {
  await mkdir(outputDir, { recursive: true });
  const tools: DastToolResult[] = [];
  for (const command of createWebDastPlan(target, outputDir, options)) {
    const execution = await execute(command);
    if (execution.error) {
      tools.push({ tool: command.tool, exitCode: execution.exitCode, complete: false, error: execution.error, findings: [], artifacts: [] });
      continue;
    }
    try {
      const raw = await readFile(command.outputPath, 'utf8');
      const findings = command.tool === 'zap-baseline' ? normalizeZapJson(raw) : normalizeNucleiJsonl(raw);
      const artifacts = command.tool === 'zap-baseline'
        ? [command.outputPath, join(resolve(outputDir), 'zap.html')]
        : [command.outputPath];
      tools.push({ tool: command.tool, exitCode: execution.exitCode, complete: true, findings, artifacts });
    } catch (error) {
      tools.push({
        tool: command.tool,
        exitCode: execution.exitCode,
        complete: false,
        error: error instanceof Error ? error.message : String(error),
        findings: [],
        artifacts: [],
      });
    }
  }
  const findings = tools.flatMap((tool) => tool.findings);
  const complete = tools.every((tool) => tool.complete);
  const blocking = findings.some((finding) => finding.severity === 'high' || finding.severity === 'critical');
  return { target, complete, passed: complete && !blocking, findings, tools };
}
