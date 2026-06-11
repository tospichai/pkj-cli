import type { Theme } from './types.js';
import { loadConfig, saveConfig } from './config.js';

// ─── ANSI Styles ────────────────────────────────────────────────────────────
export const S = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  inv: '\x1b[7m',
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  lightRed: '\x1b[91m',
  lightGreen: '\x1b[92m',
  lightYellow: '\x1b[93m',
  lightBlue: '\x1b[94m',
  lightMagenta: '\x1b[95m',
  lightCyan: '\x1b[96m',
} as const;

// ─── Themes ─────────────────────────────────────────────────────────────────
export const THEMES = {
  default: {
    primary: S.white,
    secondary: S.lightBlue,
    accent: S.lightGreen,
    match: S.lightCyan,
    desc: S.lightBlue,
    dim: S.gray,
    border: S.gray,
  },
  ocean: {
    primary: S.blue,
    secondary: S.cyan,
    accent: S.lightBlue,
    match: S.lightBlue,
    desc: S.lightCyan,
    dim: S.gray,
    border: S.blue,
  },
  sunset: {
    primary: S.yellow,
    secondary: S.red,
    accent: S.lightYellow,
    match: S.lightRed,
    desc: S.lightRed,
    dim: S.gray,
    border: S.yellow,
  },
  forest: {
    primary: S.green,
    secondary: S.lightGreen,
    accent: S.lightGreen,
    match: S.lightCyan,
    desc: S.lightGreen,
    dim: S.gray,
    border: S.green,
  },
  rose: {
    primary: S.magenta,
    secondary: S.lightMagenta,
    accent: S.lightMagenta,
    match: S.lightRed,
    desc: S.lightMagenta,
    dim: S.gray,
    border: S.magenta,
  },
  midnight: {
    primary: S.white,
    secondary: S.gray,
    accent: S.lightBlue,
    match: S.lightCyan,
    desc: S.lightBlue,
    dim: S.gray,
    border: S.white,
  },
} as const satisfies Readonly<Record<string, Theme>>;

export type ThemeName = keyof typeof THEMES;
const THEME_NAMES = Object.freeze(Object.keys(THEMES) as ThemeName[]);

function isThemeName(name: unknown): name is ThemeName {
  return typeof name === 'string' && name in THEMES;
}

export function getTheme(): Theme {
  const config = loadConfig();
  const themeName = config.theme;
  return isThemeName(themeName) ? THEMES[themeName] : THEMES.default;
}

export function setTheme(name: string): boolean {
  if (!isThemeName(name)) return false;
  const config = loadConfig();
  config.theme = name;
  saveConfig(config);
  return true;
}

export function getThemeNames(): readonly ThemeName[] {
  return THEME_NAMES;
}
