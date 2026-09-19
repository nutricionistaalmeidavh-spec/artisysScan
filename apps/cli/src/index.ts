import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAdminScan } from '../../../packages/admin/src/index.js';
import { loadAccessPolicy } from '../../../packages/access-control/src/index.js';
import { runApiScan } from '../../../packages/api/src/index.js';
import { loadManifest } from '../../../packages/contracts/src/index.js';
import { discoverProject } from '../../../packages/core/src/index.js';
import { writeFleetDashboard, type FleetReport } from '../../../packages/dashboard/src/index.js';
import { runDesktopScan } from '../../../packages/desktop/src/index.js';
import { loadFleetConfig, runFleet, type FleetProduct } from '../../../packages/fleet/src/index.js';
import { runInstallerWorkflow, type InstallerWorkflowConfig } from '../../../packages/installer/src/index.js';
import { runQa } from '../../../packages/qa/src/index.js';
import { runRbacScan } from '../../../packages/rbac/src/index.js';
import { evaluateReleaseGate, releaseGateExitCode, type ReleaseGatePolicy } from '../../../packages/release-gate/src/index.js';
import { renderTerminal, writeReportBundle, type ReportCheck, type ReportFinding, type UnifiedReportInput } from '../../../packages/reporter/src/index.js';
import { runSourceSecurity } from '../../../packages/security/src/index.js';
import { runSupplyChain } from '../../../packages/supply-chain/src/index.js';
import { runTenantScan } from '../../../packages/tenant/src/index.js';
import { inspectUpdaterArtifacts } from '../../../packages/updater/src/index.js';
import { runWebDast } from '../../../packages/web/src/dast.js';
import { runWebScan } from '../../../packages/web/src/index.js';

const USAGE = `Usage:\n  artisys-scan validate <manifest>\n  artisys-scan discover <root>\n  artisys-scan security <root>\n  artisys-scan supply-chain <root> [output-dir]\n  artisys-scan qa <root> [output-dir] --allow-project-exec\n  artisys-scan web <url> [output-dir] [--dast] [--allow-active]\n  artisys-scan api <access.yml> [--allow-state-change]\n  artisys-scan rbac <access.yml> [--allow-state-change]\n  artisys-scan tenant <access.yml> [--allow-state-change]\n  artisys-scan admin <access.yml> [--allow-state-change]\n  artisys-scan desktop <root>\n  artisys-scan installer <workflow.json> --allow-project-exec\n  artisys-scan update-artifacts <latest.yml> [artifact-dir]\n  artisys-scan report <input.json> [output-dir]\n  artisys-scan gate <report.json> [policy.json]\n  artisys-scan fleet <fleet.yml> [output.json] [--concurrency=N]\n  artisys-scan dashboard <fleet-report.json> [output-dir]\n\nGlobal safety flags:\n  --safe\n  --environment=development|staging|production\n`;

function reportExitCode(report: { complete: boolean; passed: boolean }): number {
  if (!report.complete) return 2;
  return report.passed ? 0 : 3;
}

function checkStatus(complete: boolean, findings: ReportFinding[]): ReportCheck['status'] {
  if (!complete) return 'incomplete';
  if (findings.some((item) => item.severity === 'critical' || item.severity === 'high')) return 'failed';
  if (findings.length > 0) return 'warn';
  return 'passed';
}

function executionGuard(command: string, rest: string[]): string | undefined {
  const safe = rest.includes('--safe');
  const environmentArg = rest.find((value) => value.startsWith('--environment='));
  const environment = environmentArg?.slice('--environment='.length);

  if (environment && !['development', 'staging', 'production'].includes(environment)) {
    return `Invalid environment: ${environment}. Use development, staging or production.`;
  }

  const dangerousFlags = ['--allow-project-exec', '--allow-state-change', '--allow-active'];
  const requestedDangerousFlag = dangerousFlags.find((flag) => rest.includes(flag));

  if (safe && requestedDangerousFlag) {
    return `Safe mode blocks ${requestedDangerousFlag}.`;
  }

  if (safe && rest.includes('--dast')) {
    return 'Safe mode blocks --dast.';
  }

  if (safe && ['qa', 'installer'].includes(command)) {
    return `Safe mode blocks ${command} because it can execute the target project.`;
  }

  if (environment === 'production' && requestedDangerousFlag) {
    return `Production environment blocks ${requestedDangerousFlag}.`;
  }

  if (environment === 'production' && rest.includes('--dast')) {
    return 'Production environment blocks --dast.';
  }

  return undefined;
}

async function scanFleetProduct(product: FleetProduct, configDir: string): Promise<UnifiedReportInput> {
  const root = isAbsolute(product.root) ? product.root : resolve(configDir, product.root);
  const discovery = await discoverProject(root);
  const findings: ReportFinding[] = [];
  const checks: ReportCheck[] = [{ id: 'discovery', name: 'Project discovery', status: 'passed' }];
  const evidence = discovery.evidence.map((item) => `${item.signal}:${item.path}`);
  let complete = true;

  if (discovery.runtime.desktop) {
    const desktop = await runDesktopScan(root);
    findings.push(...desktop.findings);
    checks.push({ id: 'desktop', name: 'Desktop/Electron static scan', status: checkStatus(desktop.complete, desktop.findings) });
    complete = complete && desktop.complete;
  }

  if (product.profile === 'full' || product.profile === 'release') {
    const security = await runSourceSecurity(root);
    findings.push(...security.findings);
    checks.push({ id: 'source-security', name: 'Source security', status: checkStatus(security.complete, security.findings) });
    complete = complete && security.complete;

    const supplyOutput = join(root, '.artisys', 'reports', 'fleet', product.id, 'supply-chain');
    const supply = await runSupplyChain(root, { outputDir: supplyOutput });
    const supplyFindings: ReportFinding[] = [
      ...supply.vulnerabilities.map((item) => ({
        ruleId: item.id,
        severity: item.severity,
        message: item.message,
        tool: 'supply-chain',
        ...(item.path ? { path: item.path } : {}),
      })),
      ...supply.licenses.map((item) => ({
        ruleId: `LICENSE:${item.license}`,
        severity: item.severity,
        message: `${item.classification}: ${item.license}`,
        tool: 'supply-chain',
        ...(item.path ? { path: item.path } : {}),
      })),
      ...supply.osvFindings,
    ];
    findings.push(...supplyFindings);
    evidence.push(...supply.artifacts);
    checks.push({ id: 'supply-chain', name: 'Supply chain', status: checkStatus(supply.complete, supplyFindings) });
    complete = complete && supply.complete;
  }

  const blockingFinding = findings.some((item) => item.severity === 'critical' || item.severity === 'high');
  const failedCheck = checks.some((item) => item.status === 'failed' || item.status === 'incomplete');
  return {
    productId: product.id,
    profile: product.profile,
    passed: complete && !blockingFinding && !failedCheck,
    complete,
    findings,
    checks,
    evidence,
  };
}

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const [command, target, ...rest] = args;

  if (!command || !target) {
    process.stderr.write(USAGE);
    return 1;
  }

  const guardMessage = executionGuard(command, rest);
  if (guardMessage) {
    process.stderr.write(`${guardMessage}\n`);
    return 2;
  }

  try {
    if (command === 'validate') {
      const manifest = await loadManifest(resolve(target));
      process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
      return 0;
    }

    if (command === 'discover') {
      const result = await discoverProject(resolve(target));
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    if (command === 'security') {
      const report = await runSourceSecurity(resolve(target));
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.complete ? 0 : 2;
    }

    if (command === 'supply-chain') {
      const outputDir = rest.find((value) => !value.startsWith('--'));
      const report = await runSupplyChain(resolve(target), outputDir ? { outputDir: resolve(outputDir) } : {});
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.complete ? 0 : 2;
    }

    if (command === 'qa') {
      const allowProjectExecution = rest.includes('--allow-project-exec');
      if (!allowProjectExecution) {
        process.stderr.write('QA executes code from the target project. Pass --allow-project-exec to authorize it.\n');
        return 2;
      }
      const outputDir = rest.find((value) => !value.startsWith('--'));
      const report = await runQa(resolve(target), {
        allowProjectExecution: true,
        ...(outputDir ? { outputDir: resolve(outputDir) } : {}),
      });
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return reportExitCode(report);
    }

    if (command === 'web') {
      const allowActive = rest.includes('--allow-active');
      const native = await runWebScan(target, { allowActive });
      if (!rest.includes('--dast')) {
        process.stdout.write(`${JSON.stringify(native, null, 2)}\n`);
        return reportExitCode(native);
      }
      const requestedOutput = rest.find((value) => !value.startsWith('--'));
      const outputDir = resolve(requestedOutput ?? '.artisys/reports/web-dast');
      const dast = await runWebDast(target, outputDir, { allowActive });
      const report = {
        target,
        complete: native.complete && dast.complete,
        passed: native.passed && dast.passed,
        native,
        dast,
      };
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return reportExitCode(report);
    }

    if (['api', 'rbac', 'tenant', 'admin'].includes(command)) {
      const policy = await loadAccessPolicy(resolve(target));
      const allowStateChange = rest.includes('--allow-state-change');
      const report = command === 'api'
        ? await runApiScan(policy, { allowStateChange })
        : command === 'rbac'
          ? await runRbacScan(policy, { allowStateChange })
          : command === 'tenant'
            ? await runTenantScan(policy, { allowStateChange })
            : await runAdminScan(policy, { allowStateChange });
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return reportExitCode(report);
    }

    if (command === 'desktop') {
      const report = await runDesktopScan(resolve(target));
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return reportExitCode(report);
    }

    if (command === 'installer') {
      const config = JSON.parse(await readFile(resolve(target), 'utf8')) as InstallerWorkflowConfig;
      const report = await runInstallerWorkflow(config, { allowProjectExecution: rest.includes('--allow-project-exec') });
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return reportExitCode(report);
    }

    if (command === 'update-artifacts') {
      const latestPath = resolve(target);
      const requestedDir = rest.find((value) => !value.startsWith('--'));
      const artifactDir = resolve(requestedDir ?? dirname(latestPath));
      const latestYml = await readFile(latestPath, 'utf8');
      const files = await readdir(artifactDir);
      const report = inspectUpdaterArtifacts({ latestYml, files });
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return reportExitCode(report);
    }

    if (command === 'report') {
      const input = JSON.parse(await readFile(resolve(target), 'utf8')) as UnifiedReportInput;
      const requestedDir = rest.find((value) => !value.startsWith('--'));
      const outputDir = resolve(requestedDir ?? `.artisys/reports/${input.productId}`);
      const bundle = await writeReportBundle(input, outputDir);
      process.stdout.write(renderTerminal(input));
      process.stdout.write(`${JSON.stringify(bundle, null, 2)}\n`);
      return reportExitCode(input);
    }

    if (command === 'gate') {
      const input = JSON.parse(await readFile(resolve(target), 'utf8')) as UnifiedReportInput;
      const policyPath = rest.find((value) => !value.startsWith('--'));
      const policy = policyPath
        ? JSON.parse(await readFile(resolve(policyPath), 'utf8')) as ReleaseGatePolicy
        : undefined;
      const result = evaluateReleaseGate(input, policy);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return releaseGateExitCode(result);
    }

    if (command === 'fleet') {
      const configPath = resolve(target);
      const configDir = dirname(configPath);
      const config = await loadFleetConfig(configPath);
      const concurrencyArg = rest.find((value) => value.startsWith('--concurrency='));
      const parsedConcurrency = concurrencyArg ? Number(concurrencyArg.split('=')[1]) : undefined;
      const concurrency = Number.isInteger(parsedConcurrency) && (parsedConcurrency ?? 0) > 0 ? parsedConcurrency : undefined;
      const report = await runFleet(
        config,
        (product) => scanFleetProduct(product, configDir),
        concurrency === undefined ? {} : { concurrency },
      );
      const requestedOutput = rest.find((value) => !value.startsWith('--'));
      if (requestedOutput) {
        const outputPath = resolve(requestedOutput);
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
      }
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.decision === 'PASS' ? 0 : report.decision === 'WARN' ? 4 : 3;
    }

    if (command === 'dashboard') {
      const report = JSON.parse(await readFile(resolve(target), 'utf8')) as FleetReport;
      const requestedDir = rest.find((value) => !value.startsWith('--'));
      const outputDir = resolve(requestedOutput ?? '.artisys/dashboard');
      const bundle = await writeFleetDashboard(report, outputDir);
      process.stdout.write(`${JSON.stringify(bundle, null, 2)}\n`);
      return 0;
    }

    process.stderr.write(USAGE);
    return 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  process.exitCode = await main();
}
