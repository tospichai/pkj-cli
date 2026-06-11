import fs from 'fs';
import path from 'path';
import os from 'os';
import { isConfig } from './utils/guards.js';

export function getConfigDir(): string {
  const configDir =
    process.platform === 'win32'
      ? path.join(process.env.APPDATA || os.homedir(), 'pkj')
      : path.join(os.homedir(), '.config', 'pkj');
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  return configDir;
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

export function loadConfig(): Record<string, unknown> {
  try {
    const data = fs.readFileSync(getConfigPath(), 'utf8');
    const parsed: unknown = JSON.parse(data);
    return isConfig(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveConfig(config: Record<string, unknown>): void {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
  } catch {
    /* ignore */
  }
}
