import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

export type ReportSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'unknown';

export interface ReportFinding {
  ruleId: string;
  severity: ReportSeverity;
  message: string;
  tool: string;
  path?: string;
}

export interface ReportCheck {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'warn' | 'skipped' | 'incomplete';
  durationMs?: number;
}

export interface UnifiedReportInput {
  productId: string;
  profile: string;
  passed: boolean;
  complete: boolean;
  findings: ReportFinding[];
  checks: ReportCheck[];
  evidence: string[];
  sbomPath?: string;
}

export interface ReportBundleResult {
  outputDir: string;
  files: string[];
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function escapeXml(value: string): string {
  return escapeHtml(value);
}

function severityCounts(findings: ReportFinding[]): Record<ReportSeverity, number> {
  const counts: Record<ReportSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0, unknown: 0 };
  for (const item of findings) counts[item.severity] += 1;
  return counts;
}

export function renderTerminal(input: UnifiedReportInput): string {
  const counts = severityCounts(input.findings);
  const status = counts.critical > 0 ? 'BLOCK' : input.passed && input.complete ? 'PASS' : input.complete ? 'FAIL' : 'INCOMPLETE';
  const lines = [
    `ArtiSys Scan — ${input.productId}`,
    `Profile: ${input.profile}`,
    `Status: ${status}`,
    `critical ${counts.critical} | high ${counts.high} | medium ${counts.medium} | low ${counts.low} | info ${counts.info} | unknown ${counts.unknown}`,
  ];
  for (const item of input.findings.slice(0, 50)) lines.push(`[${item.severity.toUpperCase()}] ${item.ruleId} ${item.message}${item.path ? ` (${item.path})` : ''}`);
  return `${lines.join('\n')}\n`;
}

function toSarif(input: UnifiedReportInput): object {
  const rules = Array.from(new Map(input.findings.map((item) => [item.ruleId, item])).values()).map((item) => ({
    id: item.ruleId,
    shortDescription: { text: item.message },
  }));
  const results = input.findings.map((item) => ({
    ruleId: item.ruleId,
    level: item.severity === 'critical' || item.severity === 'high' ? 'error' : item.severity === 'medium' ? 'warning' : 'note',
    message: { text: item.message },
    ...(item.path ? { locations: [{ physicalLocation: { artifactLocation: { uri: item.path } } }] } : {}),
  }));
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{ tool: { driver: { name: 'ArtiSys Scan', informationUri: 'https://github.com/nutricionistaalmeidavh-spec/artisysScan', rules } }, results }],
  };
}

function toJunit(input: UnifiedReportInput): string {
  const failures = input.checks.filter((check) => check.status === 'failed').length;
  const skipped = input.checks.filter((check) => check.status === 'skipped' || check.status === 'incomplete').length;
  const cases = input.checks.map((check) => {
    const seconds = ((check.durationMs ?? 0) / 1000).toFixed(3);
    const body = check.status === 'failed'
      ? `<failure message="${escapeXml(`${check.name} failed`)}"/>`
      : check.status === 'skipped' || check.status === 'incomplete'
        ? '<skipped/>'
        : '';
    return `<testcase classname="artisys.scan" name="${escapeXml(check.name)}" time="${seconds}">${body}</testcase>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><testsuite name="ArtiSys Scan" tests="${input.checks.length}" failures="${failures}" skipped="${skipped}">${cases}</testsuite>`;
}

function toHtml(input: UnifiedReportInput): string {
  const counts = severityCounts(input.findings);
  const findingRows = input.findings.map((item) => `<tr><td>${escapeHtml(item.severity)}</td><td>${escapeHtml(item.ruleId)}</td><td>${escapeHtml(item.tool)}</td><td>${escapeHtml(item.message)}</td><td>${escapeHtml(item.path ?? '')}</td></tr>`).join('');
  const checkRows = input.checks.map((check) => `<tr><td>${escapeHtml(check.name)}</td><td>${escapeHtml(check.status)}</td><td>${check.durationMs ?? 0}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ArtiSys Scan — ${escapeHtml(input.productId)}</title><style>body{font-family:system-ui,sans-serif;max-width:1200px;margin:32px auto;padding:0 16px}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left}code{white-space:pre-wrap}</style></head><body><h1>ArtiSys Scan — ${escapeHtml(input.productId)}</h1><p>Profile: ${escapeHtml(input.profile)} | Passed: ${input.passed} | Complete: ${input.complete}</p><p>Critical ${counts.critical} · High ${counts.high} · Medium ${counts.medium} · Low ${counts.low} · Info ${counts.info}</p><h2>Checks</h2><table><thead><tr><th>Check</th><th>Status</th><th>ms</th></tr></thead><tbody>${checkRows}</tbody></table><h2>Findings</h2><table><thead><tr><th>Severity</th><th>Rule</th><th>Tool</th><th>Message</th><th>Path</th></tr></thead><tbody>${findingRows}</tbody></table></body></html>`;
}

export async function writeReportBundle(input: UnifiedReportInput, outputDir: string): Promise<ReportBundleResult> {
  await mkdir(outputDir, { recursive: true });
  const summary = {
    productId: input.productId,
    profile: input.profile,
    passed: input.passed,
    complete: input.complete,
    summary: severityCounts(input.findings),
    findings: input.findings,
    checks: input.checks,
    evidence: input.evidence,
  };
  await Promise.all([
    writeFile(join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`),
    writeFile(join(outputDir, 'report.html'), toHtml(input)),
    writeFile(join(outputDir, 'findings.sarif'), `${JSON.stringify(toSarif(input), null, 2)}\n`),
    writeFile(join(outputDir, 'junit.xml'), toJunit(input)),
    writeFile(join(outputDir, 'evidence.json'), `${JSON.stringify({ evidence: input.evidence }, null, 2)}\n`),
  ]);

  const files = ['summary.json', 'report.html', 'findings.sarif', 'junit.xml', 'evidence.json'];
  if (input.sbomPath) {
    await copyFile(input.sbomPath, join(outputDir, 'sbom.cdx.json'));
    files.push('sbom.cdx.json');
  }
  return { outputDir, files: files.map((file) => basename(file)) };
}
