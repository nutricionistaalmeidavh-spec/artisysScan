import { spawn } from 'node:child_process';

import type { SupplyChainCommand, SupplyChainCommandResult } from './types.js';

export async function runSupplyChainCommand(command: SupplyChainCommand): Promise<SupplyChainCommandResult> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      shell: false,
      windowsHide: true,
      env: process.env,
    });

    child.stdout.on('data', (chunk: Buffer | string) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer | string) => { stderr += chunk.toString(); });

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      resolve({
        exitCode: null,
        stdout,
        stderr: stderr || error.message,
        ...(error.code ? { errorCode: error.code } : {}),
      });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}
