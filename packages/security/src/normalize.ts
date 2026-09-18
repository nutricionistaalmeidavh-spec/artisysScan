import type { FindingSeverity, SecurityFinding, SecurityTool } from './types.js';

function severity(value: unknown, fallback: FindingSeverity = 'unknown'): FindingSeverity {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'high' || normalized === 'error') return 'high';
  if (normalized === 'medium' || normalized === 'warning' || normalized === 'warn') return 'medium';
  if (normalized === 'low') return 'low';
  if (normalized === 'info' || normalized === 'note') return 'info';
  return fallback;
}

function parse(tool: SecurityTool, raw: string): any {
  if (!raw.trim()) return tool === 'gitleaks' ? [] : {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${tool} returned invalid JSON: ${detail}`);
  }
}

function semgrepFindings(data: any): SecurityFinding[] {
  if (!Array.isArray(data?.results)) return [];
  return data.results.map((item: any) => ({
    tool: 'semgrep',
    ruleId: String(item?.check_id ?? 'semgrep.unknown'),
    message: String(item?.extra?.message ?? 'Semgrep finding'),
    severity: severity(item?.extra?.severity),
    ...(typeof item?.path === 'string' ? { path: item.path } : {}),
    ...(Number.isInteger(item?.start?.line) ? { line: item.start.line } : {}),
    ...(typeof item?.extra?.fingerprint === 'string' ? { fingerprint: item.extra.fingerprint } : {}),
  }));
}

function trivyFindings(data: any): SecurityFinding[] {
  const output: SecurityFinding[] = [];
  if (!Array.isArray(data?.Results)) return output;

  for (const result of data.Results) {
    const target = typeof result?.Target === 'string' ? result.Target : undefined;
    for (const item of Array.isArray(result?.Misconfigurations) ? result.Misconfigurations : []) {
      output.push({
        tool: 'trivy',
        ruleId: String(item?.ID ?? 'trivy.misconfiguration'),
        message: String(item?.Title ?? item?.Description ?? 'Trivy misconfiguration'),
        severity: severity(item?.Severity),
        ...(target ? { path: target } : {}),
      });
    }
    for (const item of Array.isArray(result?.Secrets) ? result.Secrets : []) {
      output.push({
        tool: 'trivy',
        ruleId: String(item?.RuleID ?? 'trivy.secret'),
        message: String(item?.Title ?? item?.Category ?? 'Potential secret'),
        severity: severity(item?.Severity, 'high'),
        ...(target ? { path: target } : {}),
        ...(Number.isInteger(item?.StartLine) ? { line: item.StartLine } : {}),
      });
    }
  }
  return output;
}

function gitleaksFindings(data: any): SecurityFinding[] {
  if (!Array.isArray(data)) return [];
  return data.map((item: any) => ({
    tool: 'gitleaks',
    ruleId: String(item?.RuleID ?? 'gitleaks.secret'),
    message: String(item?.Description ?? 'Potential secret'),
    severity: 'high',
    ...(typeof item?.File === 'string' ? { path: item.File } : {}),
    ...(Number.isInteger(item?.StartLine) ? { line: item.StartLine } : {}),
    ...(typeof item?.Fingerprint === 'string' ? { fingerprint: item.Fingerprint } : {}),
  }));
}

function osvFindings(data: any): SecurityFinding[] {
  const output: SecurityFinding[] = [];
  if (!Array.isArray(data?.results)) return output;

  for (const result of data.results) {
    const sourcePath = typeof result?.source?.path === 'string' ? result.source.path : undefined;
    for (const entry of Array.isArray(result?.packages) ? result.packages : []) {
      const pkg = entry?.package ?? {};
      for (const vuln of Array.isArray(entry?.vulnerabilities) ? entry.vulnerabilities : []) {
        output.push({
          tool: 'osv-scanner',
          ruleId: String(vuln?.id ?? 'osv.unknown'),
          message: String(vuln?.summary ?? vuln?.details ?? 'Known vulnerable dependency'),
          severity: severity(vuln?.database_specific?.severity),
          ...(sourcePath ? { path: sourcePath } : {}),
          ...(typeof pkg?.name === 'string' ? { packageName: pkg.name } : {}),
          ...(typeof pkg?.version === 'string' ? { packageVersion: pkg.version } : {}),
          ...(typeof pkg?.ecosystem === 'string' ? { ecosystem: pkg.ecosystem } : {}),
        });
      }
    }
  }
  return output;
}

export function normalizeSecurityOutput(tool: SecurityTool, raw: string): SecurityFinding[] {
  const data = parse(tool, raw);
  if (tool === 'semgrep') return semgrepFindings(data);
  if (tool === 'trivy') return trivyFindings(data);
  if (tool === 'gitleaks') return gitleaksFindings(data);
  return osvFindings(data);
}
