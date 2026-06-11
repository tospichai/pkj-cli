import fs from 'fs';
import path from 'path';
import { detectPackageManager } from './pm.js';
import { getErrorMessage } from './utils/errors.js';
import { isPackageJson } from './utils/guards.js';
import type { PackageData } from './types.js';

export function findPackageJson(startDir?: string): string | null {
  let cur = path.resolve(startDir ?? process.cwd());
  while (true) {
    const candidate = path.join(cur, 'package.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

export function resolvePackageJson(arg?: string): string | null {
  if (!arg) return findPackageJson(process.cwd());
  const p = path.resolve(arg);
  const stat = fs.existsSync(p) ? fs.statSync(p) : null;
  if (!stat) return findPackageJson(p);
  if (stat.isFile() && path.basename(p) === 'package.json') return p;
  if (stat.isDirectory()) return findPackageJson(p);
  return findPackageJson(path.dirname(p));
}

export function loadPackageJson(pkgPath: string): PackageData {
  if (!pkgPath || !fs.existsSync(pkgPath)) {
    throw new Error(`package.json not found${pkgPath ? ` at ${pkgPath}` : ''}`);
  }
  let raw: string;
  try {
    raw = fs.readFileSync(pkgPath, 'utf8');
  } catch (e) {
    throw new Error(`Cannot read package.json: ${getErrorMessage(e)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON in package.json: ${getErrorMessage(e)}`);
  }

  if (!isPackageJson(parsed)) {
    throw new Error('Invalid package.json structure');
  }

  const scripts = parsed.scripts ?? {};
  const names = Object.keys(scripts);
  if (names.length === 0) throw new Error('No scripts found in package.json');

  const scriptsMeta = parsed.scriptsMeta ?? {};
  const pm = detectPackageManager(path.dirname(pkgPath));
  return {
    pkgPath,
    scripts,
    names,
    pkgName: parsed.name ?? path.basename(path.dirname(pkgPath)),
    scriptsMeta,
    pm,
  };
}
