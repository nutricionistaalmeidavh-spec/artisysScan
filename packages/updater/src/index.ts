import { parse } from 'yaml';

export interface UpdateFinding {
  tool: 'updater';
  ruleId: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
}

export interface UpdaterManifestSummary {
  version?: string;
  path?: string;
  sha512?: string;
}

export interface UpdaterArtifactReport {
  complete: boolean;
  passed: boolean;
  manifest: UpdaterManifestSummary;
  findings: UpdateFinding[];
  diagnostic?: string;
}

function updateFinding(ruleId: string, severity: UpdateFinding['severity'], message: string): UpdateFinding {
  return { tool: 'updater', ruleId, severity, message };
}

export function inspectUpdaterArtifacts(input: { latestYml: string; files: string[] }): UpdaterArtifactReport {
  try {
    const parsed = parse(input.latestYml) as Record<string, unknown> | null;
    const manifest: UpdaterManifestSummary = {
      ...(typeof parsed?.version === 'string' ? { version: parsed.version } : {}),
      ...(typeof parsed?.path === 'string' ? { path: parsed.path } : {}),
      ...(typeof parsed?.sha512 === 'string' ? { sha512: parsed.sha512 } : {}),
    };
    const findings: UpdateFinding[] = [];

    if (!manifest.version) findings.push(updateFinding('ARTISYS-UPDATE-003', 'high', 'latest.yml is missing a version.'));
    if (!manifest.path) findings.push(updateFinding('ARTISYS-UPDATE-004', 'high', 'latest.yml is missing an installer path.'));
    if (!manifest.sha512) findings.push(updateFinding('ARTISYS-UPDATE-001', 'high', 'latest.yml is missing sha512 integrity metadata.'));

    if (manifest.path) {
      const normalized = input.files.map((file) => file.replaceAll('\\', '/'));
      if (!normalized.includes(manifest.path.replaceAll('\\', '/'))) {
        findings.push(updateFinding('ARTISYS-UPDATE-005', 'high', 'Installer referenced by latest.yml is not present in the release artifacts.'));
      }
      const expectedBlockmap = `${manifest.path}.blockmap`.replaceAll('\\', '/');
      if (!normalized.includes(expectedBlockmap)) {
        findings.push(updateFinding('ARTISYS-UPDATE-002', 'high', 'Release blockmap for the referenced installer is missing.'));
      }
    }

    return { complete: true, passed: findings.length === 0, manifest, findings };
  } catch (error) {
    return {
      complete: false,
      passed: false,
      manifest: {},
      findings: [],
      diagnostic: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface UpdateScenario {
  fromVersion: string;
  toVersion: string;
  requireRollback?: boolean;
}

export interface UpdateScenarioAdapter {
  getVersion(): Promise<string>;
  readSentinel(): Promise<string>;
  applyUpdate(): Promise<void>;
  restart(): Promise<void>;
  rollback?(): Promise<void>;
}

export interface UpdateScenarioReport {
  complete: boolean;
  passed: boolean;
  beforeVersion?: string;
  afterVersion?: string;
  dataPreserved: boolean;
  rollbackVerified: boolean;
  findings: UpdateFinding[];
  diagnostic?: string;
}

export async function runUpdateScenario(scenario: UpdateScenario, adapter: UpdateScenarioAdapter): Promise<UpdateScenarioReport> {
  const findings: UpdateFinding[] = [];
  try {
    const beforeVersion = await adapter.getVersion();
    const beforeSentinel = await adapter.readSentinel();
    if (beforeVersion !== scenario.fromVersion) {
      findings.push(updateFinding('ARTISYS-UPDATE-006', 'medium', `Installed version ${beforeVersion} does not match expected ${scenario.fromVersion}.`));
    }

    await adapter.applyUpdate();
    await adapter.restart();

    const afterVersion = await adapter.getVersion();
    const afterSentinel = await adapter.readSentinel();
    const dataPreserved = beforeSentinel === afterSentinel;
    if (afterVersion !== scenario.toVersion) {
      findings.push(updateFinding('ARTISYS-UPDATE-007', 'critical', `Application did not reach expected version ${scenario.toVersion} after update.`));
    }
    if (!dataPreserved) {
      findings.push(updateFinding('ARTISYS-UPDATE-008', 'critical', 'Application data changed or was lost across update/restart.'));
    }

    let rollbackVerified = !scenario.requireRollback;
    if (scenario.requireRollback) {
      if (!adapter.rollback) {
        findings.push(updateFinding('ARTISYS-UPDATE-009', 'high', 'Rollback verification was required but no rollback adapter is available.'));
      } else {
        await adapter.rollback();
        const rollbackVersion = await adapter.getVersion();
        rollbackVerified = rollbackVersion === scenario.fromVersion;
        if (!rollbackVerified) findings.push(updateFinding('ARTISYS-UPDATE-010', 'high', 'Rollback did not restore the expected previous version.'));
      }
    }

    return {
      complete: true,
      passed: findings.length === 0,
      beforeVersion,
      afterVersion,
      dataPreserved,
      rollbackVerified,
      findings,
    };
  } catch (error) {
    return {
      complete: false,
      passed: false,
      dataPreserved: false,
      rollbackVerified: false,
      findings,
      diagnostic: error instanceof Error ? error.message : String(error),
    };
  }
}
