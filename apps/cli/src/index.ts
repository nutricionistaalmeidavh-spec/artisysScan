import { resolve } from 'node:path';

import { runAdminScan } from '../../../packages/admin/src/index.js';
import { loadAccessPolicy } from '../../../packages/access-control/src/index.js';
import { runApiScan } from '../../../packages/api/src/index.js';
import { loadManifest } from '../../../packages/contracts/src/index.js';
import { discoverProject } from '../../../packages/core/src/index.js';
import { runQa } from '../../../packages/qa/src/index.js';
import { runRbacScan } from '../../../packages/rbac/src/index.js';
import { runSourceSecurity } from '../../../packages/security/src/index.js';
import { runSupplyChain } from '../../../packages/supply-chain/src/index.js';
import { runTenantScan } from '../../../packages/tenant/src/index.js';
import { runWebDast } from '../../../packages/web/src/dast.js';
import { runWebScan } from '../../../packages/web/src/index.js';

const USAGE = `Usage:\n  artisys-scan validate <manifest>\n  artisys-scan discover <root>\n  artisys-scan security <root>\n  artisys-scan supply-chain <root> [output-dir]\n  artisys-scan qa <root> [output-dir] --allow-project-exec\n  artisys-scan web <url> [output-dir] [--dast] [--allow-active]\n  artisys-scan api <access.yml> [--allow-state-change]\n  artisys-scan rbac <access.yml> [--allow-state-change]\n  artisys-scan tenant <access.yml> [--allow-state-change]\n  artisys-scan admin <access.yml> [--allow-state-change]\n`;

function reportExitCode(report: { complete: boolean; passed: boolean }): number {
  if (!report.complete) return 2;
  return report.passed ? 0 : 3;
}

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const [command, target, ...rest] = args;

  if (!command || !target) {
    process.stderr.write(USAGE);
    return 1;
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

    process.stderr.write(USAGE);
    return 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
