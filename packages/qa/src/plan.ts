import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { discoverQaProject } from './discovery.js';
import type { QaPlan } from './types.js';

function importPath(fromDir: string, target: string): string {
  let value = relative(fromDir, target).split(sep).join('/');
  if (!value.startsWith('.')) value = `./${value}`;
  return value;
}

function tsString(value: string): string {
  return JSON.stringify(value.split(sep).join('/'));
}

export function createPlaywrightCaptureConfig(root: string, originalConfig: string | undefined, outputDir: string): string {
  const target = resolve(root);
  const reports = resolve(outputDir);
  const generatedConfigPath = join(target, '.artisys', 'qa', 'playwright.artisys.config.ts');
  const configDir = dirname(generatedConfigPath);
  const importBase = originalConfig
    ? `import baseConfig from ${JSON.stringify(importPath(configDir, resolve(originalConfig)))};\n`
    : 'const baseConfig = {};\n';

  return `import { defineConfig } from '@playwright/test';\n${importBase}\nexport default defineConfig({\n  ...baseConfig,\n  outputDir: ${tsString(join(reports, 'test-results'))},\n  use: {\n    ...((baseConfig as any).use ?? {}),\n    screenshot: 'only-on-failure',\n    video: 'retain-on-failure',\n    trace: 'retain-on-failure',\n  },\n});\n`;
}

export async function createQaPlan(root: string, outputDir: string): Promise<QaPlan> {
  const target = resolve(root);
  const reports = resolve(outputDir);
  const discovery = await discoverQaProject(target);

  if (discovery.mode === 'unavailable') {
    throw new Error('No existing Playwright installation or recognized QA script was found');
  }

  if (discovery.mode === 'script') {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    return {
      mode: 'script',
      outputDir: reports,
      requiresProjectExecution: true,
      command: {
        command: npmCommand,
        args: ['run', discovery.script!],
        cwd: target,
        shell: false,
        env: {
          ARTISYS_QA_OUTPUT_DIR: reports,
          ARTISYS_QA_CAPTURE_SCREENSHOTS: '1',
          ARTISYS_QA_CAPTURE_VIDEO: '1',
          ARTISYS_QA_CAPTURE_TRACE: '1',
        },
      },
      captures: {
        screenshots: 'best-effort',
        videos: 'best-effort',
        traces: 'best-effort',
        console: 'best-effort',
        network: 'best-effort',
      },
    };
  }

  const generatedConfigPath = join(target, '.artisys', 'qa', 'playwright.artisys.config.ts');
  const jsonReport = join(reports, 'playwright-results.json');
  const htmlReport = join(reports, 'playwright-report');
  const command = discovery.localPlaywright!;

  return {
    mode: 'playwright',
    outputDir: reports,
    requiresProjectExecution: true,
    command: {
      command: isAbsolute(command) ? command : resolve(command),
      args: [
        'test',
        `--config=${generatedConfigPath}`,
        '--add-reporter=json',
        '--add-reporter=html',
      ],
      cwd: target,
      shell: false,
      env: {
        PLAYWRIGHT_JSON_OUTPUT_FILE: jsonReport,
        PLAYWRIGHT_HTML_OUTPUT_DIR: htmlReport,
        PLAYWRIGHT_HTML_OPEN: 'never',
      },
    },
    captures: {
      screenshots: true,
      videos: true,
      traces: true,
      console: 'trace',
      network: 'trace',
    },
    generatedConfigPath,
    generatedConfigContent: createPlaywrightCaptureConfig(target, discovery.playwrightConfig, reports),
  };
}
