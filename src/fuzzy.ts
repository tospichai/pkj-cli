import { S } from './theme.js';
import type { Theme } from './types.js';

// ─── Fuzzy Search ───────────────────────────────────────────────────────────
export function fuzzyScore(pattern: string, str: string): number {
  if (!pattern) return 0;
  const lp = pattern.toLowerCase();
  const ls = str.toLowerCase();
  let score = 0,
    pi = 0,
    lastMatch = -1;
  for (let si = 0; si < ls.length && pi < lp.length; si++) {
    if (ls[si] === lp[pi]) {
      if (lastMatch >= 0 && si === lastMatch + 1) score += 2;
      else score += 1;
      if (si === 0 || ls[si - 1] === ':' || ls[si - 1] === '-') score += 3;
      lastMatch = si;
      pi++;
    }
  }
  if (pi !== lp.length) return -1;
  if (ls === lp) score += 10;
  else if (ls.startsWith(lp)) score += 5;
  return score;
}

// ─── Highlight Match ────────────────────────────────────────────────────────
export function highlightName(name: string, filter: string, theme: Theme): string {
  if (!filter) return S.reset + theme.primary + name + S.reset;
  const lp = filter.toLowerCase();
  const ln = name.toLowerCase();

  // Find all matched positions
  let pi = 0;
  const matched: number[] = [];
  for (let si = 0; si < name.length && pi < lp.length; si++) {
    if (ln[si] === lp[pi]) {
      matched.push(si);
      pi++;
    }
  }

  if (matched.length === 0) return name;

  // Highlight from first to last matched position (continuous range)
  const first = matched[0];
  const last = matched[matched.length - 1];
  if (first === undefined || last === undefined) return name;

  return (
    name.slice(0, first) + S.reset + theme.match + S.bold + name.slice(first, last + 1) + S.reset + name.slice(last + 1)
  );
}
