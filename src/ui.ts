/* eslint-disable no-control-regex */

import { S } from './theme.js';

// ─── Box Drawing ────────────────────────────────────────────────────────────
export const BOX = {
  h: '─',
  v: '│',
  tl: '╭',
  tr: '╮',
  bl: '╰',
  br: '╯',
  ml: '├',
  mr: '┤',
  tm: '┬',
  bm: '┴',
  mm: '┼',
  arrow: '▸',
  bullet: '•',
  check: '✓',
  cross: '✗',
  star: '★',
  circle: '○',
  dot: '·',
  dash: '─',
} as const;

// ─── ANSI Utilities ─────────────────────────────────────────────────────────
export const stdout = process.stdout;
export const stdin = process.stdin;

export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

export function visibleLength(str: string): number {
  return stripAnsi(str).length;
}

export function c(s: string, code: string = ''): string {
  return (code || '') + s + S.reset;
}

export function clearScreen(): void {
  stdout.write('\x1b[2J\x1b[3J\x1b[H');
}

export function enterAltScreen(): void {
  if (stdin.isTTY) stdout.write('\x1b[?1049h\x1b[?25l');
}

export function exitAltScreen(): void {
  if (stdin.isTTY) stdout.write('\x1b[?25h\x1b[?1049l');
}

export function getTermSize(): { rows: number; cols: number } {
  return { rows: process.stdout.rows || 24, cols: process.stdout.columns || 80 };
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 2) + '…';
}

export function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

export function center(str: string, width: number): string {
  const pad = Math.max(0, width - str.length);
  const left = Math.floor(pad / 2);
  return ' '.repeat(left) + str + ' '.repeat(pad - left);
}

export function drawLine(char: string, width: number, color?: string): string {
  return (color || '') + char.repeat(width) + S.reset;
}
