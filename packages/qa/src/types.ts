export type QaMode = 'playwright' | 'script' | 'unavailable';

export interface QaDiscovery {
  mode: QaMode;
  root: string;
  packageJson?: string;
  playwrightConfig?: string;
  script?: string;
  localPlaywright?: string;
  installsDependencies: false;
}

export interface QaCommand {
  command: string;
  args: string[];
  cwd: string;
  shell: false;
  env: Record<string, string>;
}

export interface QaCaptures {
  screenshots: boolean | 'best-effort';
  videos: boolean | 'best-effort';
  traces: boolean | 'best-effort';
  console: 'trace' | 'best-effort';
  network: 'trace' | 'best-effort';
}

export interface QaPlan {
  mode: Exclude<QaMode, 'unavailable'>;
  outputDir: string;
  requiresProjectExecution: true;
  command: QaCommand;
  captures: QaCaptures;
  generatedConfigPath?: string;
  generatedConfigContent?: string;
}

export interface QaCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  errorCode?: string;
}

export type QaRunner = (command: QaCommand) => Promise<QaCommandResult>;

export interface PlaywrightSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  other: number;
}

export interface QaArtifacts {
  screenshots: string[];
  videos: string[];
  traces: string[];
  jsonReports: string[];
  htmlReports: string[];
  other: string[];
}

export interface QaReport {
  root: string;
  mode: QaMode;
  outputDir: string;
  executed: boolean;
  complete: boolean;
  passed: boolean;
  exitCode: number | null;
  summary?: PlaywrightSummary;
  artifacts: QaArtifacts;
  captures: QaCaptures;
  diagnostics: string[];
}
