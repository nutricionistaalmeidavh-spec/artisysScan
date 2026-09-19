import { spawn } from 'node:child_process';

import type { QaCommand, QaCommandResult } from './types.js';

export interface QaSpawnResolutionOptions {
  platform?: string;
  comspec?: string;
}

export interface QaSpawnResolution {
  command: string;
  args: string[];
  shell: false;
}

export function resolveQaSpawnCommand(
  command: Pick<QaCommand, 'command' | 'args'>,
  options: QaSpawnResolutionOptions = {},
): QaSpawnResolution {
  const platform = options.platform ?? process.platform;
  if (platform === 'win32' && /\.cmd$/i.test(command.command)) {
    return {
      command: options.comspec ?? process.env.ComSpec ?? process.env.COMSPEC ?? 'cmd.exe',
      args: ['/d', '/s', '/c', command.command, ...command.args],
      shell: false,
    };
  }
  return { command: command.command, args: command.args, shell: false };
}

export async function runQaCommand(command: QaCommand): Promise<QaCommandResult> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const resolved = resolveQaSpawnCommand(command);
    const child = spawn(resolved.command, resolved.args, {
      cwd: command.cwd,
      shell: resolved.shell,
      windowsHide: true,
      env: { ...process.env, ...command.env },
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
