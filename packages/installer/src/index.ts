import { spawn } from 'node:child_process';

export interface InstallerCommandSpec {
  command: string;
  args: string[];
}

export interface InstallerWorkflowConfig {
  root: string;
  installerType: 'nsis' | 'inno' | 'unknown' | 'none';
  buildCommand?: InstallerCommandSpec;
  packageCommand?: InstallerCommandSpec;
  installCommand?: InstallerCommandSpec;
  launchCommand?: InstallerCommandSpec;
  qaCommand?: InstallerCommandSpec;
  securityCommand?: InstallerCommandSpec;
}

export interface InstallerStep {
  id: 'build' | 'installer' | 'install' | 'launch' | 'qa' | 'security';
  command: string;
  args: string[];
  cwd: string;
  shell: false;
  producesInstaller?: boolean;
}

export interface InstallerStepResult {
  id: InstallerStep['id'];
  status: 'passed' | 'failed' | 'skipped';
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface InstallerWorkflowReport {
  root: string;
  complete: boolean;
  passed: boolean;
  installerGenerated: boolean;
  steps: InstallerStepResult[];
  diagnostic?: string;
}

export interface InstallerCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export type InstallerRunner = (step: InstallerStep) => Promise<InstallerCommandResult>;

function step(id: InstallerStep['id'], spec: InstallerCommandSpec | undefined, root: string, producesInstaller = false): InstallerStep | null {
  if (!spec) return null;
  return { id, command: spec.command, args: [...spec.args], cwd: root, shell: false, ...(producesInstaller ? { producesInstaller: true } : {}) };
}

export function createInstallerPlan(config: InstallerWorkflowConfig): { root: string; installerType: InstallerWorkflowConfig['installerType']; steps: InstallerStep[] } {
  const steps = [
    step('build', config.buildCommand, config.root),
    step('installer', config.packageCommand, config.root, true),
    step('install', config.installCommand, config.root),
    step('launch', config.launchCommand, config.root),
    step('qa', config.qaCommand, config.root),
    step('security', config.securityCommand, config.root),
  ].filter((item): item is InstallerStep => item !== null);
  return { root: config.root, installerType: config.installerType, steps };
}

export async function runInstallerCommand(step: InstallerStep): Promise<InstallerCommandResult> {
  return await new Promise((resolve) => {
    const child = spawn(step.command, step.args, { cwd: step.cwd, shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => resolve({ exitCode: null, stdout, stderr: `${stderr}${error.message}` }));
    child.on('close', (code) => resolve({ exitCode: code, stdout, stderr }));
  });
}

export async function runInstallerWorkflow(
  config: InstallerWorkflowConfig,
  options: { allowProjectExecution: boolean; runner?: InstallerRunner },
): Promise<InstallerWorkflowReport> {
  if (!options.allowProjectExecution) {
    return {
      root: config.root,
      complete: false,
      passed: false,
      installerGenerated: false,
      steps: [],
      diagnostic: 'Installer workflow executes target-project commands. Pass --allow-project-exec to authorize it.',
    };
  }

  const plan = createInstallerPlan(config);
  if (!config.packageCommand) {
    return {
      root: config.root,
      complete: false,
      passed: false,
      installerGenerated: false,
      steps: [],
      diagnostic: 'No installer/package command is configured.',
    };
  }

  const runner = options.runner ?? runInstallerCommand;
  const results: InstallerStepResult[] = [];
  let installerGenerated = false;
  let hardFailure = false;

  for (const current of plan.steps) {
    if (hardFailure) {
      results.push({ id: current.id, status: 'skipped', exitCode: null, stdout: '', stderr: 'Skipped after prerequisite failure.' });
      continue;
    }
    const result = await runner(current);
    const passed = result.exitCode === 0;
    results.push({ id: current.id, status: passed ? 'passed' : 'failed', ...result });
    if (current.id === 'installer' && passed) installerGenerated = true;
    if (!passed && ['build', 'installer', 'install', 'launch'].includes(current.id)) hardFailure = true;
  }

  const failed = results.some((item) => item.status === 'failed');
  return {
    root: config.root,
    complete: !results.some((item) => item.status === 'skipped'),
    passed: !failed,
    installerGenerated,
    steps: results,
  };
}
