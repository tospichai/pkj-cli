import fs from 'fs';
import path from 'path';
import { getConfigDir } from './config.js';
import { isHistoryEntry, isProjectHistory } from './utils/guards.js';
import type { HistoryEntry, ProjectHistory, ScriptStats } from './types.js';

const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function decayCount(count: number, lastRunAt: number, now = Date.now()): number {
  if (!count || !lastRunAt) return 0;
  const elapsed = now - lastRunAt;
  if (elapsed <= 0) return count;
  return count * Math.pow(0.5, elapsed / HALF_LIFE_MS);
}

export function roundDisplayCount(count: number): number {
  if (count < 0.5) return 0;
  if (count < 10) return Math.round(count * 10) / 10; // 1 decimal for small numbers
  return Math.round(count);
}

function getHistoryPath(): string {
  return path.join(getConfigDir(), 'history.json');
}

function normalizeHistoryEntry(value: unknown, fallbackAt: number): HistoryEntry | undefined {
  if (typeof value === 'number') {
    return { count: value, lastRunAt: fallbackAt };
  }
  if (isHistoryEntry(value)) {
    return value;
  }
  return undefined;
}

export function loadHistory(): Record<string, ProjectHistory> {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(getHistoryPath(), 'utf8'));
    if (!isProjectHistory(parsed)) return {};

    // Normalize any legacy number entries to the HistoryEntry shape.
    const normalized: Record<string, ProjectHistory> = {};
    for (const [key, project] of Object.entries(parsed)) {
      const fallbackAt = project.lastRunAt ?? Date.now();
      const runs: Record<string, HistoryEntry> = {};
      for (const [script, entry] of Object.entries(project.runs)) {
        const normalizedEntry = normalizeHistoryEntry(entry, fallbackAt);
        if (normalizedEntry) runs[script] = normalizedEntry;
      }
      normalized[key] = {
        runs,
        lastRun: project.lastRun,
        lastRunAt: fallbackAt,
      };
    }
    return normalized;
  } catch {
    return {};
  }
}

export function saveHistory(history: Record<string, ProjectHistory>): void {
  try {
    fs.writeFileSync(getHistoryPath(), JSON.stringify(history, null, 2));
  } catch {
    /* ignore */
  }
}

export function migrateRuns(
  runs: Record<string, number | HistoryEntry>,
  fallbackAt: number,
): Record<string, HistoryEntry> {
  const migrated: Record<string, HistoryEntry> = {};
  for (const [script, val] of Object.entries(runs)) {
    const entry = normalizeHistoryEntry(val, fallbackAt);
    if (entry) migrated[script] = entry;
  }
  return migrated;
}

export function recordRun(pkgPath: string, script: string): void {
  const now = Date.now();
  const history = loadHistory();
  const key = pkgPath;
  if (!history[key]) history[key] = { runs: {}, lastRun: null, lastRunAt: now };

  // Migrate old format if needed
  if (!history[key].runs) history[key].runs = {};
  if (typeof history[key].runs[script] === 'number') {
    history[key].runs = migrateRuns(history[key].runs, history[key].lastRunAt ?? now);
  }

  const entry = history[key].runs[script];
  const prevCount = entry?.count ?? 0;
  const prevAt = entry?.lastRunAt ?? history[key].lastRunAt ?? now;

  const decayed = decayCount(prevCount, prevAt, now);
  history[key].runs[script] = { count: decayed + 1, lastRunAt: now };
  history[key].lastRun = script;
  history[key].lastRunAt = now;
  saveHistory(history);
}

export function getScriptStats(pkgPath: string): ScriptStats {
  const h = loadHistory()[pkgPath];
  if (!h) return { runs: {}, lastRun: null };

  const now = Date.now();
  const runs = migrateRuns(h.runs ?? {}, h.lastRunAt ?? now);
  const decayed: Record<string, number> = {};
  for (const [script, entry] of Object.entries(runs)) {
    decayed[script] = roundDisplayCount(decayCount(entry.count, entry.lastRunAt, now));
  }
  return { runs: decayed, lastRun: h.lastRun };
}

export function resetHistory(pkgPath: string): void {
  const history = loadHistory();
  if (history[pkgPath]) {
    delete history[pkgPath];
    saveHistory(history);
  }
}
