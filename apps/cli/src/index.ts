import { resolve } from 'node:path';

import { loadManifest } from '../../../packages/contracts/src/index.js';
import { discoverProject } from '../../../packages/core/src/index.js';
import { runQa } from '../../../packages/qa/src/index.js';
import { runSourceSecurity } from '../../../packages/security/src/index.js';
import { runSupplyChain } from '../../../packages/supply-chain/src/index.js';

const USAGE = `Usage:\n  artisys-scan validate <manifest>\n  artisys-scan discover <root>\n  artisys-scan security <root>\n  artisys-scan supply-chain <root> [output-dir]\n  artisys-scan qa <root> [output-dir] --allow-project-exec\n`;

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
      if (!report.complete) return 2;
      return report.passed ? 0 : 3;
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
