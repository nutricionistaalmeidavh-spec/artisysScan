import assert from 'node:assert/strict';
import test from 'node:test';

import { createInstallerPlan, runInstallerWorkflow } from '../src/index.ts';

test('installer plan generates installer before install, launch, QA and security', () => {
  const plan = createInstallerPlan({
    root: 'C:/product',
    installerType: 'nsis',
    buildCommand: { command: 'npm', args: ['run', 'build'] },
    packageCommand: { command: 'npm', args: ['run', 'dist'] },
    installCommand: { command: 'installer.exe', args: ['/S'] },
    launchCommand: { command: 'product.exe', args: [] },
    qaCommand: { command: 'npm', args: ['run', 'qa'] },
    securityCommand: { command: 'npm', args: ['run', 'scan:security'] },
  });
  assert.deepEqual(plan.steps.map((step) => step.id), ['build', 'installer', 'install', 'launch', 'qa', 'security']);
  assert.equal(plan.steps[1].producesInstaller, true);
});

test('workflow keeps generated installer evidence when later QA fails', async () => {
  const executed = [];
  const runner = async (step) => {
    executed.push(step.id);
    return { exitCode: step.id === 'qa' ? 1 : 0, stdout: step.id === 'installer' ? 'dist/setup.exe' : '', stderr: '' };
  };
  const report = await runInstallerWorkflow({
    root: 'C:/product',
    installerType: 'nsis',
    buildCommand: { command: 'npm', args: ['run', 'build'] },
    packageCommand: { command: 'npm', args: ['run', 'dist'] },
    installCommand: { command: 'installer.exe', args: ['/S'] },
    launchCommand: { command: 'product.exe', args: [] },
    qaCommand: { command: 'npm', args: ['run', 'qa'] },
    securityCommand: { command: 'npm', args: ['run', 'scan:security'] },
  }, { allowProjectExecution: true, runner });
  assert.deepEqual(executed, ['build', 'installer', 'install', 'launch', 'qa', 'security']);
  assert.equal(report.installerGenerated, true);
  assert.equal(report.passed, false);
  assert.equal(report.steps.find((step) => step.id === 'qa').status, 'failed');
});

test('workflow refuses project execution without explicit authorization', async () => {
  const report = await runInstallerWorkflow({ root: '.', installerType: 'unknown' }, { allowProjectExecution: false });
  assert.equal(report.complete, false);
  assert.match(report.diagnostic, /allow-project-exec/i);
});
