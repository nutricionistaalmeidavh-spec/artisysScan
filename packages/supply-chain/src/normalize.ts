import type {
  CycloneDxSummary,
  DependencyVulnerability,
  LicenseFinding,
  TrivySupplyChainFindings,
} from './types.js';
import type { FindingSeverity } from '../../security/src/types.js';

function severity(value: unknown): FindingSeverity {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'high') return 'high';
  if (normalized === 'medium') return 'medium';
  if (normalized === 'low') return 'low';
  if (normalized === 'info') return 'info';
  return 'unknown';
}

function parseJson(raw: string, label: string): any {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} returned invalid JSON: ${detail}`);
  }
}

export function normalizeTrivySupplyChain(raw: string): TrivySupplyChainFindings {
  const data = parseJson(raw, 'Trivy supply-chain scan');
  const vulnerabilities: DependencyVulnerability[] = [];
  const licenses: LicenseFinding[] = [];

  for (const result of Array.isArray(data?.Results) ? data.Results : []) {
    const target = typeof result?.Target === 'string' ? result.Target : undefined;

    for (const item of Array.isArray(result?.Vulnerabilities) ? result.Vulnerabilities : []) {
      vulnerabilities.push({
        id: String(item?.VulnerabilityID ?? 'trivy.unknown'),
        packageName: String(item?.PkgName ?? 'unknown'),
        installedVersion: String(item?.InstalledVersion ?? 'unknown'),
        severity: severity(item?.Severity),
        message: String(item?.Title ?? item?.Description ?? 'Known vulnerable dependency'),
        ...(target ? { path: target } : {}),
        ...(typeof item?.FixedVersion === 'string' && item.FixedVersion ? { fixedVersion: item.FixedVersion } : {}),
      });
    }

    for (const item of Array.isArray(result?.Licenses) ? result.Licenses : []) {
      licenses.push({
        license: String(item?.Name ?? item?.License ?? 'UNKNOWN'),
        classification: String(item?.Category ?? item?.Classification ?? 'unknown').toLowerCase(),
        severity: severity(item?.Severity),
        ...(typeof item?.PkgName === 'string' ? { packageName: item.PkgName } : {}),
        ...(target ? { path: target } : {}),
      });
    }
  }

  return { vulnerabilities, licenses };
}

export function summarizeCycloneDx(raw: string): CycloneDxSummary {
  const data = parseJson(raw, 'CycloneDX SBOM');
  if (data?.bomFormat !== 'CycloneDX') {
    throw new Error('Expected a CycloneDX SBOM document');
  }

  let dependencyEdges = 0;
  for (const dependency of Array.isArray(data?.dependencies) ? data.dependencies : []) {
    if (Array.isArray(dependency?.dependsOn)) dependencyEdges += dependency.dependsOn.length;
  }

  return {
    format: 'CycloneDX',
    specVersion: String(data?.specVersion ?? 'unknown'),
    components: Array.isArray(data?.components) ? data.components.length : 0,
    dependencyEdges,
  };
}
