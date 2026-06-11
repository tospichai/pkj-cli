import fs from 'fs';
import path from 'path';
import type { PmLockFile } from './types.js';

const LOCK_FILES: PmLockFile[] = [
  { file: 'bun.lockb', pm: 'bun' },
  { file: 'pnpm-lock.yaml', pm: 'pnpm' },
  { file: 'yarn.lock', pm: 'yarn' },
  { file: 'package-lock.json', pm: 'npm' },
];

export function detectPackageManager(pkgDir: string): string {
  for (const { file, pm } of LOCK_FILES) {
    if (fs.existsSync(path.join(pkgDir, file))) return pm;
  }
  if (fs.existsSync(path.join(pkgDir, 'pnpm-workspace.yaml'))) return 'pnpm';
  return 'npm';
}

export function getPmCommand(pm: string, script: string, args: string[] = []): string[] {
  const cmd = process.platform === 'win32' ? `${pm}.cmd` : pm;
  if (pm === 'npm') return [cmd, 'run', script, '--', ...args];
  if (pm === 'bun') return [cmd, 'run', script, ...args];
  return [cmd, 'run', script, ...args];
}
