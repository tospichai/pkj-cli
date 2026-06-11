import type { HistoryEntry, ProjectHistory, ScriptMeta } from '../types.js';

/**
 * Type guards and runtime validators for data loaded from JSON files.
 * These keep JSON.parse results honest instead of casting with `as`.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function hasString(value: unknown, key: string): value is Record<string, unknown> {
  return isRecord(value) && key in value && typeof value[key] === 'string';
}

export function hasNumber(value: unknown, key: string): value is Record<string, unknown> {
  return isRecord(value) && key in value && typeof value[key] === 'number';
}

export function isHistoryEntry(value: unknown): value is HistoryEntry {
  return hasNumber(value, 'count') && hasNumber(value, 'lastRunAt');
}

export function isProjectHistory(value: unknown): value is ProjectHistory {
  if (!isRecord(value)) return false;

  const runs = value.runs;
  if (runs !== undefined && !isRecord(runs)) return false;

  const lastRun = value.lastRun;
  if (lastRun !== undefined && lastRun !== null && typeof lastRun !== 'string') return false;

  const lastRunAt = value.lastRunAt;
  if (lastRunAt !== undefined && typeof lastRunAt !== 'number') return false;

  if (runs) {
    for (const entry of Object.values(runs)) {
      if (typeof entry === 'number') continue;
      if (!isHistoryEntry(entry)) return false;
    }
  }

  return true;
}

export function isScriptMeta(value: unknown): value is ScriptMeta {
  return hasString(value, 'desc');
}

export function isPackageJson(value: unknown): value is {
  scripts?: Record<string, string>;
  scriptsMeta?: Record<string, ScriptMeta>;
  name?: string;
} {
  if (!isRecord(value)) return false;

  if (value.scripts !== undefined) {
    if (!isRecord(value.scripts)) return false;
    for (const v of Object.values(value.scripts)) {
      if (typeof v !== 'string') return false;
    }
  }

  if (value.scriptsMeta !== undefined) {
    if (!isRecord(value.scriptsMeta)) return false;
    for (const v of Object.values(value.scriptsMeta)) {
      if (!isScriptMeta(v)) return false;
    }
  }

  if (value.name !== undefined && typeof value.name !== 'string') return false;

  return true;
}

export function isConfig(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}
