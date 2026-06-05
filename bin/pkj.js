#!/usr/bin/env node
/**
 * pkj — Interactive package.json script picker & runner
 *
 * A zero-dependency CLI tool that finds package.json, lists scripts,
 * lets you filter & navigate interactively, then runs the selected script.
 *
 * Usage:
 *   pkj                    # Auto-find package.json from cwd
 *   pkj [path]             # Use specific package.json or directory
 *   pkj --help             # Show help
 *   pkj --version          # Show version
 *   pkj --copy             # Copy command instead of running
 *   pkj --multi            # Enable multi-select mode
 *   pkj --args --watch     # Pass arguments to script
 *
 * Controls:
 *   ↑/↓         Navigate scripts
 *   Type        Filter scripts (fuzzy search)
 *   Backspace   Remove filter character
 *   Enter       Run selected script
 *   Space       Toggle multi-select
 *   /           Open command palette
 *   Ctrl+C      Quit
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

// ─── Configuration ──────────────────────────────────────────────────────────
const VERSION = '1.0.0';
const APP_NAME = 'pkj';

// ─── ANSI Styles ────────────────────────────────────────────────────────────
const S = {
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
};

const c = (s, code) => (code || '') + s + S.reset;

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function visibleLength(str) {
  return stripAnsi(str).length;
}

// ─── Themes ─────────────────────────────────────────────────────────────────
const THEMES = {
  default:  { primary: S.white,      secondary: S.lightBlue,  accent: S.lightGreen,  match: S.lightCyan,   desc: S.lightBlue,   dim: S.gray,  border: S.gray },
  ocean:    { primary: S.blue,       secondary: S.cyan,       accent: S.lightBlue,   match: S.lightBlue,   desc: S.lightCyan,   dim: S.gray,  border: S.blue },
  sunset:   { primary: S.yellow,     secondary: S.red,        accent: S.lightYellow, match: S.lightRed,    desc: S.lightRed,    dim: S.gray,  border: S.yellow },
  forest:   { primary: S.green,      secondary: S.lightGreen, accent: S.lightGreen,  match: S.lightCyan,   desc: S.lightGreen,  dim: S.gray,  border: S.green },
  rose:     { primary: S.magenta,    secondary: S.lightMagenta,accent:S.lightMagenta, match: S.lightRed,    desc: S.lightMagenta,dim: S.gray,  border: S.magenta },
  midnight: { primary: S.white,      secondary: S.gray,       accent: S.lightBlue,   match: S.lightCyan,   desc: S.lightBlue,   dim: S.gray,  border: S.white },
};

function getConfigPath() {
  return path.join(getConfigDir(), 'config.json');
}

function loadConfig() {
  try {
    const data = fs.readFileSync(getConfigPath(), 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveConfig(config) {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
  } catch { /* ignore */ }
}

function getTheme() {
  const config = loadConfig();
  return THEMES[config.theme] || THEMES.default;
}

function setTheme(name) {
  if (!THEMES[name]) return false;
  const config = loadConfig();
  config.theme = name;
  saveConfig(config);
  return true;
}

// ─── Box Drawing ────────────────────────────────────────────────────────────
const BOX = {
  h: '─', v: '│', tl: '╭', tr: '╮', bl: '╰', br: '╯',
  ml: '├', mr: '┤', tm: '┬', bm: '┴', mm: '┼',
  arrow: '▸', bullet: '•', check: '✓', cross: '✗',
  star: '★', circle: '○', dot: '·', dash: '─',
};

// ─── Script Icons ───────────────────────────────────────────────────────────
const ICONS = [
  { re: /\bdev\b|dev:|start|serve|watch|hot/i, icon: '▸' },
  { re: /test|jest|mocha|vitest|playwright|cypress|e2e|spec/i, icon: '●' },
  { re: /build|compile|bundle|tsup|esbuild|rollup|webpack|vite|tsc|transpile/i, icon: '■' },
  { re: /infra|docker|compose|localstack|deploy|provision|k8s|helm/i, icon: '◆' },
  { re: /lint|format|prettier|eslint|stylelint|biome/i, icon: '✦' },
  { re: /sonar|scan|audit|security|snyk|trivy/i, icon: '◈' },
  { re: /db|dynamo|redis|minio|mongo|postgres|mysql|prisma|migrate|seed|sqlite/i, icon: '❖' },
  { re: /clean|reset|rm|remove|clear|purge|nuke/i, icon: '✕' },
  { re: /story|doc|md|readme|typedoc|jsdoc/i, icon: '◉' },
  { re: /ci|cd|github|gitlab|jenkins|pipeline/i, icon: '↻' },
  { re: /release|publish|ship/i, icon: '▲' },
  { re: /install|postinstall|preinstall/i, icon: '▼' },
  { re: /generate|gen|scaffold|create|init/i, icon: '✚' },
  { re: /analyze|size|perf|benchmark|profile/i, icon: '○' },
  { re: /typecheck|type-check|types/i, icon: '□' },
];

function getIcon(name) {
  const match = ICONS.find(({ re }) => re.test(name));
  return match ? match.icon : BOX.bullet;
}

// ─── Package Manager Detection ──────────────────────────────────────────────
function detectPackageManager(pkgDir) {
  const lockFiles = [
    { file: 'bun.lockb', pm: 'bun' },
    { file: 'pnpm-lock.yaml', pm: 'pnpm' },
    { file: 'yarn.lock', pm: 'yarn' },
    { file: 'package-lock.json', pm: 'npm' },
  ];
  for (const { file, pm } of lockFiles) {
    if (fs.existsSync(path.join(pkgDir, file))) return pm;
  }
  if (fs.existsSync(path.join(pkgDir, 'pnpm-workspace.yaml'))) return 'pnpm';
  return 'npm';
}

function getPmCommand(pm, script, args = []) {
  const cmd = process.platform === 'win32' ? `${pm}.cmd` : pm;
  if (pm === 'npm') return [cmd, 'run', script, '--', ...args];
  if (pm === 'bun') return [cmd, 'run', script, ...args];
  return [cmd, 'run', script, ...args];
}

// ─── Config / History ───────────────────────────────────────────────────────
const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function decayCount(count, lastRunAt, now = Date.now()) {
  if (!count || !lastRunAt) return 0;
  const elapsed = now - lastRunAt;
  if (elapsed <= 0) return count;
  return count * Math.pow(0.5, elapsed / HALF_LIFE_MS);
}

function roundDisplayCount(count) {
  if (count < 0.5) return 0;
  if (count < 10) return Math.round(count * 10) / 10; // 1 decimal for small numbers
  return Math.round(count);
}
function getConfigDir() {
  const configDir = process.platform === 'win32'
    ? path.join(process.env.APPDATA || os.homedir(), 'pkj')
    : path.join(os.homedir(), '.config', 'pkj');
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  return configDir;
}

function getHistoryPath() {
  return path.join(getConfigDir(), 'history.json');
}

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(getHistoryPath(), 'utf8'));
  } catch { return {}; }
}

function saveHistory(history) {
  try {
    fs.writeFileSync(getHistoryPath(), JSON.stringify(history, null, 2));
  } catch { /* ignore */ }
}

function migrateRuns(runs, fallbackAt) {
  const migrated = {};
  for (const [script, val] of Object.entries(runs)) {
    if (typeof val === 'number') {
      migrated[script] = { count: val, lastRunAt: fallbackAt };
    } else if (val && typeof val === 'object' && typeof val.count === 'number') {
      migrated[script] = val;
    }
  }
  return migrated;
}

function recordRun(pkgPath, script) {
  const now = Date.now();
  const history = loadHistory();
  const key = pkgPath;
  if (!history[key]) history[key] = { runs: {}, lastRun: null, lastRunAt: now };

  // Migrate old format if needed
  if (!history[key].runs) history[key].runs = {};
  if (typeof history[key].runs[script] === 'number') {
    history[key].runs = migrateRuns(history[key].runs, history[key].lastRunAt || now);
  }

  const entry = history[key].runs[script];
  const prevCount = entry && typeof entry === 'object' ? entry.count : 0;
  const prevAt = entry && typeof entry === 'object' ? entry.lastRunAt : (history[key].lastRunAt || now);

  const decayed = decayCount(prevCount, prevAt, now);
  history[key].runs[script] = { count: decayed + 1, lastRunAt: now };
  history[key].lastRun = script;
  history[key].lastRunAt = now;
  saveHistory(history);
}

function getScriptStats(pkgPath) {
  const h = loadHistory()[pkgPath];
  if (!h) return { runs: {}, lastRun: null };

  const now = Date.now();
  const runs = migrateRuns(h.runs || {}, h.lastRunAt || now);
  const decayed = {};
  for (const [script, entry] of Object.entries(runs)) {
    decayed[script] = roundDisplayCount(decayCount(entry.count, entry.lastRunAt, now));
  }
  return { runs: decayed, lastRun: h.lastRun };
}

function resetHistory(pkgPath) {
  const history = loadHistory();
  if (history[pkgPath]) {
    delete history[pkgPath];
    saveHistory(history);
  }
}

// ─── Argument Parsing ───────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = argv.slice(2);
  const options = { copy: false, help: false, version: false, multi: false, path: null, args: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--version' || arg === '-v') options.version = true;
    else if (arg === '--copy' || arg === '-c') options.copy = true;
    else if (arg === '--multi' || arg === '-m') options.multi = true;
    else if (arg === '--args' || arg === '-a') { options.args = args.slice(i + 1); break; }
    else if (!arg.startsWith('-') && !options.path) options.path = arg;
  }
  return options;
}

function showHelp() {
  console.log(`
${c(APP_NAME, S.bold + S.cyan)} ${c('v' + VERSION, S.dim)} — Interactive package.json script runner

${c('Usage:', S.bold)}
  ${c(APP_NAME, S.cyan)} [options] [path]

${c('Options:', S.bold)}
  ${c('-h, --help', S.yellow)}       Show this help message
  ${c('-v, --version', S.yellow)}    Show version
  ${c('-c, --copy', S.yellow)}       Copy command to clipboard instead of running
  ${c('-m, --multi', S.yellow)}      Enable multi-select mode
  ${c('-a, --args', S.yellow)}       Pass arguments to script

${c('Arguments:', S.bold)}
  path             Path to package.json or directory

${c('Controls:', S.bold)}
  ${c('↑ / ↓', S.yellow)}            Navigate scripts
  ${c('Type', S.yellow)}             Filter scripts (fuzzy search)
  ${c('Backspace', S.yellow)}        Remove filter character
  ${c('Enter', S.yellow)}            Run selected script
  ${c('Space', S.yellow)}            Toggle multi-select
  ${c('/', S.yellow)}                Open command palette
  ${c('Ctrl+C', S.yellow)}           Quit

${c('Command Palette:', S.bold)} (press / then)
  ${c('a', S.yellow)}                Add arguments to script
  ${c('c', S.yellow)}                Copy command to clipboard
  ${c('m', S.yellow)}                Toggle multi-select mode
  ${c('t', S.yellow)}                Open theme picker
  ${c('q', S.yellow)}                Quit
  ${c('h', S.yellow)}                Show help

${c('Features:', S.bold)}
  ${BOX.bullet} Auto-detects package manager (npm, yarn, pnpm, bun)
  ${BOX.bullet} Fuzzy search with smart sorting
  ${BOX.bullet} Shows last run & run count
  ${BOX.bullet} Script descriptions from scriptsMeta
  ${BOX.bullet} Copy command mode
  ${BOX.bullet} Multi-select mode
  ${BOX.bullet} Run duration tracking
`);
}

// ─── Package.json Discovery ─────────────────────────────────────────────────
function findPackageJson(startDir) {
  let cur = path.resolve(startDir || process.cwd());
  while (true) {
    const candidate = path.join(cur, 'package.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

function resolvePackageJson(arg) {
  if (!arg) return findPackageJson(process.cwd());
  const p = path.resolve(arg);
  const stat = fs.existsSync(p) ? fs.statSync(p) : null;
  if (!stat) return findPackageJson(p);
  if (stat.isFile() && path.basename(p) === 'package.json') return p;
  if (stat.isDirectory()) return findPackageJson(p);
  return findPackageJson(path.dirname(p));
}

// ─── Package.json Loading ───────────────────────────────────────────────────
function loadPackageJson(pkgPath) {
  if (!pkgPath || !fs.existsSync(pkgPath)) {
    throw new Error(`package.json not found${pkgPath ? ` at ${pkgPath}` : ''}`);
  }
  let raw;
  try { raw = fs.readFileSync(pkgPath, 'utf8'); } catch (e) {
    throw new Error(`Cannot read package.json: ${e.message}`);
  }
  let pkg;
  try { pkg = JSON.parse(raw); } catch (e) {
    throw new Error(`Invalid JSON in package.json: ${e.message}`);
  }
  const scripts = pkg.scripts || {};
  const names = Object.keys(scripts);
  if (names.length === 0) throw new Error('No scripts found in package.json');
  const scriptsMeta = pkg.scriptsMeta || {};
  const pm = detectPackageManager(path.dirname(pkgPath));
  return { pkgPath, scripts, names, pkgName: pkg.name || path.basename(path.dirname(pkgPath)), scriptsMeta, pm };
}

// ─── Fuzzy Search ───────────────────────────────────────────────────────────
function fuzzyScore(pattern, str) {
  if (!pattern) return 0;
  pattern = pattern.toLowerCase();
  str = str.toLowerCase();
  let score = 0, pi = 0, lastMatch = -1;
  for (let si = 0; si < str.length && pi < pattern.length; si++) {
    if (str[si] === pattern[pi]) {
      if (lastMatch >= 0 && si === lastMatch + 1) score += 2;
      else score += 1;
      if (si === 0 || str[si - 1] === ':' || str[si - 1] === '-') score += 3;
      lastMatch = si;
      pi++;
    }
  }
  if (pi !== pattern.length) return -1;
  if (str === pattern) score += 10;
  else if (str.startsWith(pattern)) score += 5;
  return score;
}

// ─── Highlight Match ────────────────────────────────────────────────────────
function highlightName(name, filter, theme) {
  if (!filter) return c(name, theme.primary);
  const lp = filter.toLowerCase();
  const ln = name.toLowerCase();

  // Find all matched positions
  let pi = 0;
  const matched = [];
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

  return (
    name.slice(0, first) +
    c(name.slice(first, last + 1), theme.match + S.bold) +
    name.slice(last + 1)
  );
}

// ─── Terminal Utilities ─────────────────────────────────────────────────────
const stdout = process.stdout;
const stdin = process.stdin;

function clearScreen() {
  stdout.write('\x1b[2J\x1b[3J\x1b[H');
}

function enterAltScreen() {
  if (stdin.isTTY) stdout.write('\x1b[?1049h\x1b[?25l');
}

function exitAltScreen() {
  if (stdin.isTTY) stdout.write('\x1b[?25h\x1b[?1049l');
}

function getTermSize() {
  return { rows: process.stdout.rows || 24, cols: process.stdout.columns || 80 };
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 2) + '…';
}

function padRight(str, len) {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function center(str, width) {
  const pad = Math.max(0, width - str.length);
  const left = Math.floor(pad / 2);
  return ' '.repeat(left) + str + ' '.repeat(pad - left);
}

function drawLine(char, width, color) {
  return (color || '') + char.repeat(width) + S.reset;
}

// ─── Picker State ───────────────────────────────────────────────────────────
class Picker {
  constructor({ pkgPath, scripts, names, pkgName, scriptsMeta, pm }, options) {
    this.pkgPath = pkgPath;
    this.scripts = scripts;
    this.allNames = names;
    this.pkgName = pkgName;
    this.scriptsMeta = scriptsMeta;
    this.pm = pm;
    this.options = options;
    this.filter = '';
    this.filteredNames = [...names];
    this.selected = 0;
    this.viewOffset = 0;
    this.running = false;
    this.multiSelected = new Set();
    this.scriptArgs = '';
    this.mode = 'normal';
    this.commandBuffer = '';
    const stats = getScriptStats(pkgPath);
    this.runs = stats.runs;
    this.lastRun = stats.lastRun;
    this.headerLines = 6;
    this.footerLines = 3;
  }

  get availableLines() {
    return Math.max(4, getTermSize().rows - this.headerLines - this.footerLines);
  }

  updateFiltered() {
    if (!this.filter) {
      this.filteredNames = [...this.allNames].sort((a, b) => {
        if (a === this.lastRun) return -1;
        if (b === this.lastRun) return 1;
        const ra = this.runs[a] || 0;
        const rb = this.runs[b] || 0;
        if (rb !== ra) return rb - ra;
        return a.localeCompare(b);
      });
    } else {
      this.filteredNames = this.allNames
        .map(name => ({ name, score: fuzzyScore(this.filter, name) }))
        .filter(({ score }) => score >= 0)
        .sort((a, b) => b.score - a.score)
        .map(s => s.name);
    }
    if (this.selected >= this.filteredNames.length) {
      this.selected = Math.max(0, this.filteredNames.length - 1);
    }
  }

  getPmBadge() {
    const badges = { npm: c('npm', S.red), yarn: c('yarn', S.cyan), pnpm: c('pnpm', S.yellow), bun: c('bun', S.magenta) };
    return badges[this.pm] || this.pm;
  }

  renderHeader() {
    const { cols } = getTermSize();
    const T = getTheme();
    const pmBadge = this.getPmBadge();

    const left = `${T.border}─┤ ${S.reset}`;
    const right = `${T.border} ├─${S.reset}`;
    const text = `${T.primary}${this.pkgName}${S.reset} · ${pmBadge}`;
    const totalVis = visibleLength(left) + visibleLength(text) + visibleLength(right);
    const pad = Math.max(0, cols - totalVis);
    const leftPad = Math.floor(pad / 2);
    const rightPad = pad - leftPad;

    return ' '.repeat(leftPad) + left + text + right + ' '.repeat(rightPad) + '\n';
  }

  renderPath() {
    const { cols } = getTermSize();
    const T = getTheme();

    const pathText = `${c('◈', T.dim)} ${T.dim}${truncate(this.pkgPath, cols - 4)}${S.reset}`;
    const pathVis = visibleLength(pathText);
    const rightPad = Math.max(0, cols - pathVis - 2);

    return `  ${pathText}${' '.repeat(rightPad)}\n`;
  }

  renderFilterBar() {
    const { cols } = getTermSize();
    const T = getTheme();

    let leftText, rightText;

    if (this.mode === 'command') {
      leftText = this.commandBuffer
        ? `${S.yellow}/${this.commandBuffer}${S.reset}${S.yellow}█${S.reset}`
        : `${S.dim}/${S.reset}${S.yellow}█${S.reset}`;
      rightText = `${T.dim}a·c·m·t·r·q · Esc${S.reset}`;
    } else if (this.mode === 'args') {
      leftText = this.scriptArgs
        ? `${S.yellow}${this.scriptArgs}${S.reset}${S.yellow}█${S.reset}`
        : `${S.dim}type arguments…${S.reset}`;
      rightText = `${T.dim}Enter · Esc${S.reset}`;
    } else {
      leftText = this.filter
        ? `${T.primary}${this.filter}${S.reset}${S.yellow}█${S.reset}`
        : `${T.dim}type to filter…${S.reset}`;
      let hint = '↑↓ · Enter · / · q';
      if (this.options.multi) hint = `Space · ${hint}`;
      rightText = `${T.dim}${hint}${S.reset}`;
    }

    const leftVis = visibleLength(leftText);
    const rightVis = visibleLength(rightText);
    const contentWidth = cols - 2; // 2 spaces indent
    const midSpace = Math.max(1, contentWidth - leftVis - rightVis - 2); // -2 for "> " prefix

    const line = `> ${leftText}${' '.repeat(midSpace)}${rightText}`;
    const lineVis = visibleLength(line);
    const finalPad = Math.max(0, contentWidth - lineVis);

    return `  ${line}${' '.repeat(finalPad)}\n`;
  }

  renderItems() {
    const avail = this.availableLines;
    const { cols } = getTermSize();
    const T = getTheme();
    let output = '';

    if (this.filteredNames.length === 0) {
      output += `  ${T.dim}${BOX.bullet} no match for "${this.filter}"${S.reset}\n`;
      return output;
    }

    let lines = 0;
    for (let i = this.viewOffset; i < this.filteredNames.length; i++) {
      const isSelected = i === this.selected;
      const itemLines = isSelected ? 2 : 1;
      if (lines + itemLines > avail) break;
      lines += itemLines;

      const name = this.filteredNames[i];
      const cmd = this.scripts[name];
      const icon = getIcon(name);
      const isMulti = this.multiSelected.has(name);
      const runCount = this.runs[name] || 0;
      const isLastRun = name === this.lastRun;

      const badges = [];
      if (isLastRun) badges.push(c('↻', T.accent));
      if (runCount >= 1) badges.push(c(`${runCount}×`, T.dim));
      if (isMulti) badges.push(c(BOX.check, T.accent));
      const badgeStr = badges.length ? ` ${badges.join(' ')}` : '';

      if (isSelected) {
        const cursor = this.options.multi
          ? (isMulti ? c(BOX.check, T.accent) : c(BOX.circle, T.dim))
          : c(BOX.arrow, T.accent);
        const highlighted = highlightName(name, this.filter, T);

        output += `${S.bold}${cursor} ${highlighted}${badgeStr}${S.reset}\n`;

        const cmdDisplay = truncate(cmd, cols - 10);
        output += `  ${T.dim}${icon} ${cmdDisplay}${S.reset}\n`;
      } else {
        const prefix = this.options.multi
          ? (isMulti ? c(BOX.check, T.accent) : ' ')
          : ' ';
        const highlighted = highlightName(name, this.filter, T);
        const short = truncate(cmd, cols - name.length - badgeStr.length - 12);
        output += `  ${prefix} ${T.dim}${icon}${S.reset} ${highlighted}${badgeStr} ${T.dim}${BOX.dot} ${short}${S.reset}\n`;
      }
    }

    return output;
  }

  renderFooter() {
    const { cols } = getTermSize();
    const current = this.filteredNames[this.selected] || '';
    const count = `${this.selected + 1}/${this.filteredNames.length}`;
    const T = getTheme();

    const left = current ? `${BOX.arrow} ${S.bold}${T.primary}${current}${S.reset}` : '';
    const right = `${T.dim}${count}${S.reset}`;

    // Calculate visible widths (strip ANSI)
    const leftVis = visibleLength(left);
    const rightVis = visibleLength(right);
    const contentWidth = cols - 4; // │ + space + line + space + │
    const midSpace = Math.max(0, contentWidth - leftVis - rightVis);

    const line = left + ' '.repeat(midSpace) + right;

    let output = '';
    output += `${T.border}${BOX.tl}${drawLine(BOX.h, cols - 2)}${BOX.tr}${S.reset}\n`;
    output += `${T.border}${BOX.v}${S.reset} ${line}${S.reset} ${T.border}${BOX.v}${S.reset}\n`;
    output += `${T.border}${BOX.bl}${drawLine(BOX.h, cols - 2)}${BOX.br}${S.reset}\n`;

    return output;
  }

  render() {
    clearScreen();
    const { cols } = getTermSize();
    const T = getTheme();
    let output = '';
    output += this.renderHeader();
    output += this.renderPath();
    output += this.renderFilterBar();
    output += `${T.border}${drawLine(BOX.h, cols)}${S.reset}\n`;
    output += this.renderItems();
    output += '\n';
    output += this.renderFooter();
    stdout.write(output);
  }

  moveUp() {
    if (this.filteredNames.length === 0) return;
    this.selected = (this.selected - 1 + this.filteredNames.length) % this.filteredNames.length;
    this.adjustViewOffset();
    this.render();
  }

  moveDown() {
    if (this.filteredNames.length === 0) return;
    this.selected = (this.selected + 1) % this.filteredNames.length;
    this.adjustViewOffset();
    this.render();
  }

  addFilterChar(char) {
    if (this.mode === 'command') {
      this.commandBuffer += char;
      this.handleCommand();
      return;
    }
    if (this.mode === 'args') {
      this.scriptArgs += char;
      this.render();
      return;
    }
    this.filter += char;
    this.selected = 0;
    this.viewOffset = 0;
    this.updateFiltered();
    this.adjustViewOffset();
    this.render();
  }

  removeFilterChar() {
    if (this.mode === 'command') {
      this.commandBuffer = this.commandBuffer.slice(0, -1);
      if (this.commandBuffer === '') this.mode = 'normal';
      this.render();
      return;
    }
    if (this.mode === 'args') {
      this.scriptArgs = this.scriptArgs.slice(0, -1);
      this.render();
      return;
    }
    this.filter = this.filter.slice(0, -1);
    this.selected = 0;
    this.viewOffset = 0;
    this.updateFiltered();
    this.adjustViewOffset();
    this.render();
  }

  startCommand() {
    this.mode = 'command';
    this.commandBuffer = '';
    this.render();
  }

  handleCommand() {
    const cmd = this.commandBuffer;
    if (cmd === 'q') { cleanupAndExit(0); return; }
    if (cmd === 'a') { this.mode = 'args'; this.render(); return; }
    if (cmd === 'c') { this.copyCommand(); return; }
    if (cmd === 'm') { this.options.multi = !this.options.multi; this.mode = 'normal'; this.render(); return; }
    if (cmd === 'h') {
      this.mode = 'normal';
      exitAltScreen();
      showHelp();
      stdout.write(`\n${S.dim}Press any key to return…${S.reset}\n`);
      stdin.once('data', () => { enterAltScreen(); this.render(); });
      return;
    }
    if (cmd === 't') { this.showThemePicker(); return; }
    if (cmd === 'r') { resetHistory(this.pkgPath); this.runs = {}; this.lastRun = null; this.mode = 'normal'; this.updateFiltered(); this.render(); return; }
    this.mode = 'normal';
    this.render();
  }

  cancelMode() {
    if (this.mode === 'args') this.scriptArgs = '';
    this.mode = 'normal';
    this.commandBuffer = '';
    this.render();
  }

  confirmArgs() {
    this.mode = 'normal';
    this.render();
  }

  toggleMultiSelect() {
    if (!this.options.multi) return;
    const name = this.filteredNames[this.selected];
    if (!name) return;
    if (this.multiSelected.has(name)) this.multiSelected.delete(name);
    else this.multiSelected.add(name);
    this.render();
  }

  adjustViewOffset() {
    const avail = this.availableLines;
    if (this.selected < this.viewOffset) {
      this.viewOffset = this.selected;
      return;
    }
    let lines = 0, lastVisible = this.viewOffset - 1;
    for (let i = this.viewOffset; i < this.filteredNames.length; i++) {
      const itemLines = i === this.selected ? 3 : 1;
      if (lines + itemLines > avail) break;
      lines += itemLines;
      lastVisible = i;
    }
    if (this.selected > lastVisible) {
      let newOffset = this.selected;
      let remaining = avail - 3;
      for (let i = this.selected - 1; i >= 0 && remaining > 0; i--) {
        remaining -= 1;
        newOffset = i;
      }
      this.viewOffset = newOffset;
    }
  }

  showThemePicker() {
    this.mode = 'normal';
    const themeNames = Object.keys(THEMES);
    const currentTheme = loadConfig().theme || 'default';
    let themeIdx = themeNames.indexOf(currentTheme);
    if (themeIdx < 0) themeIdx = 0;

    const renderThemes = () => {
      clearScreen();
      const { cols } = getTermSize();
      const T = getTheme();

      let output = '';
      output += `${T.border}${BOX.tl}${drawLine(BOX.h, cols - 2)}${BOX.tr}${S.reset}\n`;
      output += `${T.border}${BOX.v}${S.reset} ${S.bold}${S.white}${center('Select Theme', cols - 4)}${S.reset}${T.border} ${BOX.v}${S.reset}\n`;
      output += `${T.border}${BOX.ml}${drawLine(BOX.h, cols - 2)}${BOX.mr}${S.reset}\n`;

      for (let i = 0; i < themeNames.length; i++) {
        const name = themeNames[i];
        const theme = THEMES[name];
        const isSelected = i === themeIdx;
        const marker = isSelected ? c(BOX.arrow, T.accent) : ' ';
        const label = isSelected ? c(name, S.bold + theme.primary) : c(name, theme.primary);
        const preview = `${theme.primary}████${S.reset}${theme.secondary}████${S.reset}${theme.accent}████${S.reset}`;
        const previewLen = visibleLength(preview);
        const padding = ' '.repeat(Math.max(0, cols - visibleLength(name) - previewLen - 10));
        output += `${T.border}${BOX.v}${S.reset} ${marker} ${label}${S.reset} ${preview}${padding}${T.border}${BOX.v}${S.reset}\n`;
      }

      output += `${T.border}${BOX.v}${S.reset} ${T.dim}${center('↑↓ navigate • Enter select • q cancel', cols - 4)}${S.reset} ${T.border}${BOX.v}${S.reset}\n`;
      output += `${T.border}${BOX.bl}${drawLine(BOX.h, cols - 2)}${BOX.br}${S.reset}\n`;
      stdout.write(output);
    };

    const cleanupTheme = () => {
      stdin.removeAllListeners('data');
      stdin.on('data', this._onData);
      this.render();
    };

    this._onData = stdin.listeners('data')[0];
    stdin.removeAllListeners('data');
    renderThemes();

    stdin.on('data', (key) => {
      if (key === '\u0003' || key === 'q' || key === 'Q' || key === '\u001b') {
        cleanupTheme();
        return;
      }
      if (key === '\u001b[A') { themeIdx = (themeIdx - 1 + themeNames.length) % themeNames.length; renderThemes(); return; }
      if (key === '\u001b[B') { themeIdx = (themeIdx + 1) % themeNames.length; renderThemes(); return; }
      if (key === '\r') { setTheme(themeNames[themeIdx]); cleanupTheme(); return; }
    });
  }

  copyCommand() {
    const names = this.options.multi && this.multiSelected.size > 0
      ? [...this.multiSelected]
      : [this.filteredNames[this.selected]];
    if (!names[0]) return;

    const commands = names.map(name => {
      const [cmd, ...args] = getPmCommand(this.pm, name, this.scriptArgs ? this.scriptArgs.split(' ') : []);
      return `${cmd} ${args.join(' ')}`;
    });
    const output = commands.join(' && ');

    let copied = false;
    try {
      const { execSync } = require('child_process');
      if (process.platform === 'darwin') {
        execSync(`echo ${JSON.stringify(output)} | pbcopy`, { stdio: 'pipe' });
        copied = true;
      } else if (process.platform === 'win32') {
        execSync(`echo ${JSON.stringify(output)} | clip`, { stdio: 'pipe' });
        copied = true;
      } else {
        execSync(`echo ${JSON.stringify(output)} | xclip -selection clipboard 2>/dev/null || echo ${JSON.stringify(output)} | xsel --clipboard --input 2>/dev/null`, { stdio: 'pipe' });
        copied = true;
      }
    } catch { /* ignore */ }

    exitAltScreen();
    const msg = copied
      ? `\n${S.green}${BOX.check} Copied to clipboard${S.reset}\n`
      : `\n${S.yellow}${BOX.bullet} Clipboard tools not found — command printed below${S.reset}\n`;
    stdout.write(msg + `\n${S.dim}> ${S.reset}${S.green}${output}${S.reset}\n`, () => {
      cleanupAndExit(0, true);
    });
  }

  runSelected() {
    const names = this.options.multi && this.multiSelected.size > 0
      ? [...this.multiSelected]
      : [this.filteredNames[this.selected]];
    if (!names[0]) return;
    this.running = true;
    if (this.options.copy) { this.copyCommand(); return; }
    runScripts(names, this.pkgPath, this.pm, this.scriptArgs);
  }
}

// ─── Script Runner ──────────────────────────────────────────────────────────
function runScripts(names, pkgPath, pm, extraArgs) {
  const dir = path.dirname(pkgPath);
  const args = extraArgs ? extraArgs.split(' ') : [];
  if (names.length === 1) runSingle(names[0], dir, pm, args);
  else runSequential(names, dir, pm, args);
}

function runSingle(name, dir, pm, extraArgs) {
  const [cmd, ...args] = getPmCommand(pm, name, extraArgs);
  const { cols } = getTermSize();
  stdout.write(`${S.cyan}${BOX.tl}${drawLine(BOX.h, cols - 2)}${BOX.tr}${S.reset}\n`);
  stdout.write(`${S.cyan}${BOX.v}${S.reset} ${S.bold}${S.white}▶ ${cmd} ${args.join(' ')}${S.reset} ${S.cyan}${BOX.v}${S.reset}\n`);
  stdout.write(`${S.cyan}${BOX.ml}${drawLine(BOX.h, cols - 2)}${BOX.mr}${S.reset}\n`);
  stdout.write(`${S.cyan}${BOX.v}${S.reset} ${S.dim}${dir}${S.reset} ${S.cyan}${BOX.v}${S.reset}\n`);
  stdout.write(`${S.cyan}${BOX.bl}${drawLine(BOX.h, cols - 2)}${BOX.br}${S.reset}\n\n`);

  const startTime = Date.now();
  exitAltScreen();
  if (stdin.isTTY) {
    try { stdin.setRawMode(false); } catch (e) {}
  }
  stdin.pause();

  const child = spawn(cmd, args, { stdio: 'inherit', cwd: dir, shell: process.platform === 'win32' });

  child.on('exit', (code, signal) => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    if (!signal && code === 0) {
      stdout.write(`\n${S.green}${BOX.check} Done in ${duration}s${S.reset}\n`);
    } else {
      stdout.write(`\n${S.red}${BOX.cross} Failed (${signal || code}) after ${duration}s${S.reset}\n`);
    }
    setTimeout(() => {
      stdout.write('\n', () => cleanupAndExit(signal ? 1 : (code || 0), true));
    }, 300);
  });

  child.on('error', (err) => {
    console.error(`\n${S.red}${BOX.cross} Failed to run script: ${err.message}${S.reset}`);
    cleanupAndExit(1);
  });
}

function runSequential(names, dir, pm, extraArgs) {
  const { cols } = getTermSize();
  stdout.write(`${S.cyan}${BOX.tl}${drawLine(BOX.h, cols - 2)}${BOX.tr}${S.reset}\n`);
  stdout.write(`${S.cyan}${BOX.v}${S.reset} ${S.bold}${S.white}▶ Running ${names.length} scripts${S.reset} ${S.cyan}${BOX.v}${S.reset}\n`);
  stdout.write(`${S.cyan}${BOX.ml}${drawLine(BOX.h, cols - 2)}${BOX.mr}${S.reset}\n`);
  stdout.write(`${S.cyan}${BOX.v}${S.reset} ${S.dim}${dir}${S.reset} ${S.cyan}${BOX.v}${S.reset}\n`);
  stdout.write(`${S.cyan}${BOX.bl}${drawLine(BOX.h, cols - 2)}${BOX.br}${S.reset}\n\n`);

  let index = 0;
  const totalStart = Date.now();

  function next() {
    if (index >= names.length) {
      const duration = ((Date.now() - totalStart) / 1000).toFixed(2);
      stdout.write(`\n${S.green}${BOX.check} All ${names.length} scripts done in ${duration}s${S.reset}\n`);
      setTimeout(() => {
        stdout.write('\n', () => cleanupAndExit(0, true));
      }, 300);
      return;
    }

    const name = names[index++];
    const [cmd, ...args] = getPmCommand(pm, name, extraArgs);
    stdout.write(`${S.cyan}[${index}/${names.length}]${S.reset} ${S.bold}${name}${S.reset}\n`);
    stdout.write(`  ${S.dim}${cmd} ${args.join(' ')}${S.reset}\n`);

    const startTime = Date.now();
    const child = spawn(cmd, args, { stdio: 'inherit', cwd: dir, shell: process.platform === 'win32' });

    child.on('exit', (code, signal) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      if (!signal && code === 0) {
        stdout.write(`  ${S.green}${BOX.check} ${name} (${duration}s)${S.reset}\n\n`);
        next();
      } else {
        stdout.write(`\n${S.red}${BOX.cross} ${name} failed (${signal || code}) after ${duration}s${S.reset}\n`);
        setTimeout(() => {
          stdout.write('\n', () => cleanupAndExit(1, true));
        }, 300);
      }
    });

    child.on('error', (err) => {
      console.error(`\n${S.red}${BOX.cross} Failed to run ${name}: ${err.message}${S.reset}`);
      cleanupAndExit(1);
    });
  }

  exitAltScreen();
  if (stdin.isTTY) {
    try { stdin.setRawMode(false); } catch (e) {}
  }
  stdin.pause();
  next();
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────
function cleanupAndExit(code = 0, skipAltScreen = false) {
  if (!skipAltScreen) exitAltScreen();
  if (stdin.isTTY) {
    try { stdin.setRawMode(false); } catch (e) {}
  }
  stdin.pause();
  stdin.removeAllListeners('data');
  process.exit(code);
}

// ─── Main ───────────────────────────────────────────────────────────────────
function main() {
  const options = parseArgs(process.argv);
  if (options.help) { showHelp(); process.exit(0); }
  if (options.version) { console.log(VERSION); process.exit(0); }

  let pkgPath;
  try { pkgPath = resolvePackageJson(options.path); }
  catch (e) { console.error(`${S.red}${BOX.cross} Error: ${e.message}${S.reset}`); process.exit(2); }

  let data;
  try { data = loadPackageJson(pkgPath); }
  catch (e) { console.error(`${S.red}${BOX.cross} Error: ${e.message}${S.reset}`); process.exit(2); }

  const picker = new Picker(data, options);

  stdin.setEncoding('utf8');
  if (stdin.isTTY) {
    enterAltScreen();
    try { stdin.setRawMode(true); }
    catch (e) { console.error(`${S.yellow}${BOX.bullet} Warning: Cannot set raw mode. Interactive features may be limited.${S.reset}`); }
  }
  stdin.resume();
  stdin.removeAllListeners('data');

  picker.updateFiltered();
  picker.adjustViewOffset();
  picker.render();

  process.stdout.on('resize', () => {
    if (!picker.running) {
      picker.adjustViewOffset();
      picker.render();
    }
  });

  stdin.on('data', (key) => {
    if (key === '\u0003') { cleanupAndExit(1); return; }
    if (key === '\u001b') {
      if (picker.mode !== 'normal') { picker.cancelMode(); return; }
      cleanupAndExit(0);
      return;
    }
    if (key === '\r') {
      if (picker.mode === 'args') { picker.confirmArgs(); return; }
      if (picker.mode === 'command') { picker.handleCommand(); return; }
      recordRun(pkgPath, picker.filteredNames[picker.selected]);
      picker.runSelected();
      return;
    }
    if (key === ' ') {
      if (picker.mode === 'args') { picker.addFilterChar(' '); return; }
      picker.toggleMultiSelect();
      return;
    }
    if (key === '\u001b[A') { picker.moveUp(); return; }
    if (key === '\u001b[B') { picker.moveDown(); return; }
    if (key === '\u0008' || key === '\u007f') { picker.removeFilterChar(); return; }
    if (key === '/' && picker.mode === 'normal') { picker.startCommand(); return; }
    if (key.startsWith('/') && key.length > 1 && picker.mode === 'normal') {
      picker.startCommand();
      for (let i = 1; i < key.length; i++) picker.addFilterChar(key[i]);
      return;
    }
    if (key >= ' ' && key <= '~') { picker.addFilterChar(key); return; }
  });
}

process.on('uncaughtException', (err) => {
  console.error(`${S.red}${BOX.cross} Unexpected error: ${err.message}${S.reset}`);
  cleanupAndExit(1);
});

process.on('SIGINT', () => cleanupAndExit(1));
process.on('SIGTERM', () => cleanupAndExit(1));

if (require.main === module) {
  main();
} else {
  module.exports = {
    stripAnsi,
    visibleLength,
    fuzzyScore,
    decayCount,
    roundDisplayCount,
    truncate,
    getPmCommand,
    highlightName,
    getIcon,
    detectPackageManager,
    findPackageJson,
    resolvePackageJson,
    loadPackageJson,
    parseArgs,
    THEMES,
    getTheme,
    setTheme,
  };
}
