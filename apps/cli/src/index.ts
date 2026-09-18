import { resolve } from 'node:path';

import { loadManifest } from '../../../packages/contracts/src/index.js';
import { discoverProject } from '../../../packages/core/src/index.js';
import { runSourceSecurity } from '../../../packages/security/src/index.js';

const USAGE = `Usage:\n  artisys-scan validate <manifest>\n  artisys-scan discover <root>\n  artisys-scan security <root>\n`;

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const [command, target] = args;

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
