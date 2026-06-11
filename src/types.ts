// ─── Type Definitions ───────────────────────────────────────────────────────

export interface Theme {
  primary: string;
  secondary: string;
  accent: string;
  match: string;
  desc: string;
  dim: string;
  border: string;
}

export interface ScriptMeta {
  desc: string;
}

export interface PackageData {
  pkgPath: string;
  scripts: Record<string, string>;
  names: string[];
  pkgName: string;
  scriptsMeta: Record<string, ScriptMeta>;
  pm: string;
}

export interface CliOptions {
  copy: boolean;
  help: boolean;
  version: boolean;
  multi: boolean;
  path: string | null;
  args: string[];
}

export interface HistoryEntry {
  count: number;
  lastRunAt: number;
}

export interface ProjectHistory {
  runs: Record<string, HistoryEntry>;
  lastRun: string | null;
  lastRunAt: number;
}

export interface ScriptStats {
  runs: Record<string, number>;
  lastRun: string | null;
}

export interface PmLockFile {
  file: string;
  pm: string;
}

export interface IconRule {
  re: RegExp;
  icon: string;
}
