import type { FindingSeverity, SecurityFinding } from '../../security/src/types.js';

export type SupplyChainTool = 'trivy' | 'osv-scanner';
export type SupplyChainStep = 'sbom' | 'audit' | 'osv';
export type SupplyChainStepStatus = 'ok' | 'findings' | 'skipped' | 'unavailable' | 'error';

export interface SupplyChainCommand {
  step: SupplyChainStep;
  tool: SupplyChainTool;
  command: string;
  args: string[];
  cwd: string;
  shell: false;
  outputFile?: string;
}

export interface SupplyChainCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  errorCode?: string;
}

export type SupplyChainRunner = (command: SupplyChainCommand) => Promise<SupplyChainCommandResult>;

export interface SupplyChainStepReport {
  step: SupplyChainStep;
  tool: SupplyChainTool;
  status: SupplyChainStepStatus;
  exitCode: number | null;
  diagnostic?: string;
}

export interface DependencyVulnerability {
  id: string;
  packageName: string;
  installedVersion: string;
  severity: FindingSeverity;
  message: string;
  path?: string;
  fixedVersion?: string;
}

export interface LicenseFinding {
  license: string;
  classification: string;
  severity: FindingSeverity;
  packageName?: string;
  path?: string;
}

export interface TrivySupplyChainFindings {
  vulnerabilities: DependencyVulnerability[];
  licenses: LicenseFinding[];
}

export interface CycloneDxSummary {
  format: 'CycloneDX';
  specVersion: string;
  components: number;
  dependencyEdges: number;
}

export interface SupplyChainReport {
  root: string;
  outputDir: string;
  complete: boolean;
  sbom?: CycloneDxSummary;
  vulnerabilities: DependencyVulnerability[];
  licenses: LicenseFinding[];
  osvFindings: SecurityFinding[];
  artifacts: string[];
  diagnostics: string[];
  steps: SupplyChainStepReport[];
}
