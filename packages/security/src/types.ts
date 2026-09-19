export type SecurityTool = 'semgrep' | 'trivy' | 'gitleaks' | 'osv-scanner';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'unknown';

export interface SecurityCommand {
  tool: SecurityTool;
  command: string;
  args: string[];
  cwd: string;
  shell: false;
}

export interface SecurityFinding {
  tool: SecurityTool;
  ruleId: string;
  message: string;
  severity: FindingSeverity;
  path?: string;
  line?: number;
  fingerprint?: string;
  packageName?: string;
  packageVersion?: string;
  ecosystem?: string;
}

export interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  errorCode?: string;
}

export type CommandRunner = (command: SecurityCommand) => Promise<CommandResult>;

export interface SecurityToolReport {
  tool: SecurityTool;
  status: 'ok' | 'findings' | 'skipped' | 'unavailable' | 'error';
  exitCode: number | null;
  findings: SecurityFinding[];
  diagnostic?: string;
}

export interface SourceSecurityReport {
  root: string;
  complete: boolean;
  tools: SecurityToolReport[];
  findings: SecurityFinding[];
  summary: Record<FindingSeverity, number>;
}
