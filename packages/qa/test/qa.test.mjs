import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  classifyQaArtifacts,
  createPlaywrightCaptureConfig,
  createQaPlan,
  discoverQaProject,
  summarizePlaywrightJson,
} from '../src/index.ts';

test('discovers an existing Playwright project without installing anything', async () => {
  const root = await mkdtemp(join(tmpdir(), 'artisys-qa-discovery-'));
  await writeFile(join(root, 'package.json'), JSON.stringify({
    scripts: { 'test:e2e': 'playwright test' },
    devDependencies: { '@playwright/test': '^1.58.2' },
  }), 'utf8');
  await writeFile(join(root, 'playwright.config.ts'), 'export default {};', 'utf8');

  const discovery = await discoverQaProject(root);
  assert.equal(discovery.mode, 'playwright');
  assert.equal(discovery.playwrightConfig, join(root, 'playwright.config.ts'));
  assert.equal(discovery.script, 'test:e2e');
  assert.equal(discovery.installsDependencies, false);
});

test('prefers a product-owned qa:e2e wrapper that controls disposable setup and teardown', async () => {
  const root = await mkdtemp(join(tmpdir(), 'artisys-qa-owned-runner-'));
  await writeFile(join(root, 'package.json'), JSON.stringify({
    scripts: { 'qa:e2e': 'node scripts/qa-e2e.mjs' },
    devDependencies: { '@playwright/test': '^1.58.2' },
  }), 'utf8');
  await writeFile(join(root, 'playwright.config.mjs'), 'export default {};', 'utf8');

  const discovery = await discoverQaProject(root);
  assert.equal(discovery.mode, 'script');
  assert.equal(discovery.script, 'qa:e2e');

  const plan = await createQaPlan(root, join(root, '.artisys', 'qa'));
  assert.equal(plan.mode, 'script');
  assert.deepEqual(plan.command.args, ['run', 'qa:e2e']);
  assert.equal(plan.command.shell, false);
});

test('generated Playwright overlay forces failure evidence without replacing target config', () => {
  const root = '/tmp/product';
  const outputDir = '/tmp/qa-report';
  const generated = createPlaywrightCaptureConfig(root, '/tmp/product/playwright.config.ts', outputDir);

  assert.match(generated, /playwright\.config\.ts/);
  assert.match(generated, /screenshot:\s*'only-on-failure'/);
  assert.match(generated, /video:\s*'retain-on-failure'/);
  assert.match(generated, /trace:\s*'retain-on-failure'/);
  assert.match(generated, /outputDir/);
});

test('QA plan uses local Playwright binary and explicit project execution gate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'artisys-qa-plan-'));
  await mkdir(join(root, 'node_modules', '.bin'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ devDependencies: { '@playwright/test': '^1.58.2' } }), 'utf8');
  await writeFile(join(root, 'playwright.config.ts'), 'export default {};', 'utf8');

  const plan = await createQaPlan(root, join(root, '.artisys', 'qa'));
  assert.equal(plan.mode, 'playwright');
  assert.equal(plan.requiresProjectExecution, true);
  assert.equal(plan.command.shell, false);
  assert.ok(plan.command.command.includes(join('node_modules', '.bin', 'playwright')));
  assert.ok(plan.command.args.some((arg) => arg.startsWith('--config=')));
  assert.ok(plan.command.args.includes('--add-reporter=json'));
  assert.ok(plan.command.args.includes('--add-reporter=html'));
  assert.ok(plan.command.env.PLAYWRIGHT_JSON_OUTPUT_FILE.endsWith('playwright-results.json'));
  assert.ok(plan.command.env.PLAYWRIGHT_HTML_OUTPUT_DIR.endsWith('playwright-report'));
  assert.equal(plan.captures.console, 'trace');
  assert.equal(plan.captures.network, 'trace');
});

test('summarizes Playwright JSON results including failed and skipped tests', () => {
  const summary = summarizePlaywrightJson(JSON.stringify({
    suites: [{
      specs: [
        { tests: [{ results: [{ status: 'passed' }] }] },
        { tests: [{ results: [{ status: 'failed' }] }] },
        { tests: [{ results: [{ status: 'skipped' }] }] },
      ],
    }],
  }));

  assert.deepEqual(summary, { total: 3, passed: 1, failed: 1, skipped: 1, other: 0 });
});

test('classifies screenshots, videos, traces and machine-readable reports', () => {
  const artifacts = classifyQaArtifacts([
    '/tmp/qa/test-results/home.png',
    '/tmp/qa/test-results/video.webm',
    '/tmp/qa/test-results/trace.zip',
    '/tmp/qa/playwright-results.json',
    '/tmp/qa/playwright-report/index.html',
  ]);

  assert.equal(artifacts.screenshots.length, 1);
  assert.equal(artifacts.videos.length, 1);
  assert.equal(artifacts.traces.length, 1);
  assert.equal(artifacts.jsonReports.length, 1);
  assert.equal(artifacts.htmlReports.length, 1);
});
