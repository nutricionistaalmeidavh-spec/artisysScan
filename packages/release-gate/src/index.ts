import type { ReportSeverity, UnifiedReportInput } from '../../reporter/src/index.js';

export type ReleaseGateDecision = 'PASS' | 'WARN' | 'BLOCK';

export interface ReleaseGatePolicy {
  blockOnIncomplete?: boolean;
  blockOnFailedChecks?: boolean;
  blockSeverities?: ReportSeverity[];
  warnSeverities?: ReportSeverity[];
}

export interface ReleaseGateResult {
  decision: ReleaseGateDecision;
  blocked: boolean;
  reasons: string[];
  summary: Record<ReportSeverity, number>;
}

const DEFAULT_BLOCK: ReportSeverity[] = ['critical', 'high'];
const DEFAULT_WARN: ReportSeverity[] = ['medium', 'low', 'unknown'];

function severityCounts(input: UnifiedReportInput): Record<ReportSeverity, number> {
  const counts: Record<ReportSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    unknown: 0,
  };
  for (const finding of input.findings) counts[finding.severity] += 1;
  return counts;
}

export function evaluateReleaseGate(
  input: UnifiedReportInput,
  policy: ReleaseGatePolicy = {},
): ReleaseGateResult {
  const blockSeverities = new Set(policy.blockSeverities ?? DEFAULT_BLOCK);
  const warnSeverities = new Set(policy.warnSeverities ?? DEFAULT_WARN);
  const reasons: string[] = [];
  const summary = severityCounts(input);

  if ((policy.blockOnIncomplete ?? true) && !input.complete) {
    reasons.push('Scan evidence is incomplete.');
  }

  const failedChecks = input.checks.filter((check) => check.status === 'failed' || check.status === 'incomplete');
  if ((policy.blockOnFailedChecks ?? true) && failedChecks.length > 0) {
    reasons.push(`${failedChecks.length} required check(s) failed or are incomplete.`);
  }

  for (const severity of blockSeverities) {
    if (summary[severity] > 0) reasons.push(`${summary[severity]} ${severity} finding(s) block release.`);
  }

  if (reasons.length > 0) {
    return { decision: 'BLOCK', blocked: true, reasons, summary };
  }

  const warningReasons: string[] = [];
  for (const severity of warnSeverities) {
    if (summary[severity] > 0) warningReasons.push(`${summary[severity]} ${severity} finding(s) require review.`);
  }
  const warnedChecks = input.checks.filter((check) => check.status === 'warn');
  if (warnedChecks.length > 0) warningReasons.push(`${warnedChecks.length} check(s) require review.`);

  if (warningReasons.length > 0) {
    return { decision: 'WARN', blocked: false, reasons: warningReasons, summary };
  }

  return { decision: 'PASS', blocked: false, reasons: [], summary };
}

export function releaseGateExitCode(result: ReleaseGateResult): number {
  if (result.decision === 'PASS') return 0;
  if (result.decision === 'WARN') return 4;
  return 3;
}
