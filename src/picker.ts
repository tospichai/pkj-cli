import { execSync } from 'child_process';
import {
  clearScreen,
  enterAltScreen,
  exitAltScreen,
  getTermSize,
  truncate,
  visibleLength,
  drawLine,
  center,
  BOX,
  stdout,
  stdin,
} from './ui.js';
import { S, getTheme, setTheme, THEMES, getThemeNames } from './theme.js';
import type { ThemeName } from './theme.js';
import { getIcon } from './icons.js';
import { fuzzyScore, highlightName } from './fuzzy.js';
import { getPmCommand } from './pm.js';
import { getScriptStats, resetHistory } from './history.js';
import { runScripts, cleanupAndExit } from './runner.js';
import { showHelp } from './args.js';
import { loadConfig } from './config.js';
import type { PackageData, CliOptions } from './types.js';

type PickerMode = 'normal' | 'command' | 'args';
type StdinDataHandler = (key: string) => void;

function isStdinDataHandler(value: unknown): value is StdinDataHandler {
  return typeof value === 'function';
}

// ─── Picker State ───────────────────────────────────────────────────────────
export class Picker {
  readonly pkgPath: string;
  readonly scripts: Readonly<Record<string, string>>;
  readonly allNames: readonly string[];
  readonly pkgName: string;
  readonly scriptsMeta: Readonly<Record<string, { desc: string }>>;
  readonly pm: string;
  readonly options: CliOptions;
  filter = '';
  filteredNames: string[] = [];
  selected = 0;
  viewOffset = 0;
  running = false;
  multiSelected = new Set<string>();
  scriptArgs = '';
  mode: PickerMode = 'normal';
  commandBuffer = '';
  runs: Record<string, number> = {};
  lastRun: string | null = null;
  readonly headerLines = 6;
  readonly footerLines = 3;
  private _onData?: StdinDataHandler;

  constructor({ pkgPath, scripts, names, pkgName, scriptsMeta, pm }: PackageData, options: CliOptions) {
    this.pkgPath = pkgPath;
    this.scripts = scripts;
    this.allNames = names;
    this.pkgName = pkgName;
    this.scriptsMeta = scriptsMeta;
    this.pm = pm;
    this.options = options;
    const stats = getScriptStats(pkgPath);
    this.runs = stats.runs;
    this.lastRun = stats.lastRun;
    this.filteredNames = [...names];
  }

  get availableLines(): number {
    return Math.max(4, getTermSize().rows - this.headerLines - this.footerLines);
  }

  updateFiltered(): void {
    if (!this.filter) {
      this.filteredNames = [...this.allNames].sort((a, b) => {
        if (a === this.lastRun) return -1;
        if (b === this.lastRun) return 1;
        const ra = this.runs[a] ?? 0;
        const rb = this.runs[b] ?? 0;
        if (rb !== ra) return rb - ra;
        return a.localeCompare(b);
      });
    } else {
      this.filteredNames = this.allNames
        .map((name) => ({ name, score: fuzzyScore(this.filter, name) }))
        .filter(({ score }) => score >= 0)
        .sort((a, b) => b.score - a.score)
        .map((s) => s.name);
    }
    if (this.selected >= this.filteredNames.length) {
      this.selected = Math.max(0, this.filteredNames.length - 1);
    }
  }

  getPmBadge(): string {
    const badges: Record<string, string> = {
      npm: S.reset + S.red + 'npm' + S.reset,
      yarn: S.reset + S.cyan + 'yarn' + S.reset,
      pnpm: S.reset + S.yellow + 'pnpm' + S.reset,
      bun: S.reset + S.magenta + 'bun' + S.reset,
    };
    return badges[this.pm] ?? this.pm;
  }

  renderHeader(): string {
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

  renderPath(): string {
    const { cols } = getTermSize();
    const T = getTheme();

    const pathText = `${S.reset + T.dim}◈${S.reset} ${T.dim}${truncate(this.pkgPath, cols - 4)}${S.reset}`;
    const pathVis = visibleLength(pathText);
    const rightPad = Math.max(0, cols - pathVis - 2);

    return `  ${pathText}${' '.repeat(rightPad)}\n`;
  }

  renderFilterBar(): string {
    const { cols } = getTermSize();
    const T = getTheme();

    let leftText: string;
    let rightText: string;

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
        : `${S.dim}type to filter…${S.reset}`;
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

  renderItems(): string {
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
      if (!name) continue;
      const cmd = this.scripts[name];
      if (cmd === undefined) continue;
      const icon = getIcon(name);
      const isMulti = this.multiSelected.has(name);
      const runCount = this.runs[name] ?? 0;
      const isLastRun = name === this.lastRun;

      const badges: string[] = [];
      if (isLastRun) badges.push(S.reset + T.accent + '↻' + S.reset);
      if (runCount >= 1) badges.push(S.reset + T.dim + `${runCount}×` + S.reset);
      if (isMulti) badges.push(S.reset + T.accent + BOX.check + S.reset);
      const badgeStr = badges.length ? ` ${badges.join(' ')}` : '';

      if (isSelected) {
        const cursor = this.options.multi
          ? isMulti
            ? S.reset + T.accent + BOX.check + S.reset
            : S.reset + T.dim + BOX.circle + S.reset
          : S.reset + T.accent + BOX.arrow + S.reset;
        const highlighted = highlightName(name, this.filter, T);

        output += `${S.bold}${cursor} ${highlighted}${badgeStr}${S.reset}\n`;

        const cmdDisplay = truncate(cmd, cols - 10);
        output += `  ${T.dim}${icon} ${cmdDisplay}${S.reset}\n`;
      } else {
        const prefix = this.options.multi ? (isMulti ? S.reset + T.accent + BOX.check + S.reset : ' ') : ' ';
        const highlighted = highlightName(name, this.filter, T);
        const short = truncate(cmd, cols - name.length - badgeStr.length - 12);
        output += `  ${prefix} ${T.dim}${icon}${S.reset} ${highlighted}${badgeStr} ${T.dim}${BOX.dot} ${short}${S.reset}\n`;
      }
    }

    return output;
  }

  renderFooter(): string {
    const { cols } = getTermSize();
    const current = this.filteredNames[this.selected] ?? '';
    const count = `${this.selected + 1}/${this.filteredNames.length}`;
    const T = getTheme();

    const left = current ? `${BOX.arrow} ${S.bold}${T.primary}${current}${S.reset}` : '';
    const right = `${T.dim}${count}${S.reset}`;

    const leftVis = visibleLength(left);
    const rightVis = visibleLength(right);
    const contentWidth = cols - 4;
    const midSpace = Math.max(0, contentWidth - leftVis - rightVis);

    const line = left + ' '.repeat(midSpace) + right;

    let output = '';
    output += `${T.border}${BOX.tl}${drawLine(BOX.h, cols - 2)}${BOX.tr}${S.reset}\n`;
    output += `${T.border}${BOX.v}${S.reset} ${line}${S.reset} ${T.border}${BOX.v}${S.reset}\n`;
    output += `${T.border}${BOX.bl}${drawLine(BOX.h, cols - 2)}${BOX.br}${S.reset}\n`;

    return output;
  }

  render(): void {
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

  moveUp(): void {
    if (this.filteredNames.length === 0) return;
    this.selected = (this.selected - 1 + this.filteredNames.length) % this.filteredNames.length;
    this.adjustViewOffset();
    this.render();
  }

  moveDown(): void {
    if (this.filteredNames.length === 0) return;
    this.selected = (this.selected + 1) % this.filteredNames.length;
    this.adjustViewOffset();
    this.render();
  }

  addFilterChar(char: string): void {
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

  removeFilterChar(): void {
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

  startCommand(): void {
    this.mode = 'command';
    this.commandBuffer = '';
    this.render();
  }

  handleCommand(): void {
    const cmd = this.commandBuffer;
    if (cmd === 'q') {
      cleanupAndExit(0);
      return;
    }
    if (cmd === 'a') {
      this.mode = 'args';
      this.render();
      return;
    }
    if (cmd === 'c') {
      this.copyCommand();
      return;
    }
    if (cmd === 'm') {
      this.options.multi = !this.options.multi;
      this.mode = 'normal';
      this.render();
      return;
    }
    if (cmd === 'h') {
      this.mode = 'normal';
      exitAltScreen();
      showHelp();
      stdout.write(`\n${S.dim}Press any key to return…${S.reset}\n`);
      stdin.once('data', () => {
        enterAltScreen();
        this.render();
      });
      return;
    }
    if (cmd === 't') {
      this.showThemePicker();
      return;
    }
    if (cmd === 'r') {
      resetHistory(this.pkgPath);
      this.runs = {};
      this.lastRun = null;
      this.mode = 'normal';
      this.updateFiltered();
      this.render();
      return;
    }
    this.mode = 'normal';
    this.render();
  }

  cancelMode(): void {
    if (this.mode === 'args') this.scriptArgs = '';
    this.mode = 'normal';
    this.commandBuffer = '';
    this.render();
  }

  confirmArgs(): void {
    this.mode = 'normal';
    this.render();
  }

  toggleMultiSelect(): void {
    if (!this.options.multi) return;
    const name = this.filteredNames[this.selected];
    if (!name) return;
    if (this.multiSelected.has(name)) this.multiSelected.delete(name);
    else this.multiSelected.add(name);
    this.render();
  }

  adjustViewOffset(): void {
    const avail = this.availableLines;
    if (this.selected < this.viewOffset) {
      this.viewOffset = this.selected;
      return;
    }
    let lines = 0;
    let lastVisible = this.viewOffset - 1;
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

  showThemePicker(): void {
    this.mode = 'normal';
    const themeNames = getThemeNames();
    const configTheme = loadConfig().theme;
    const currentTheme = typeof configTheme === 'string' ? configTheme : 'default';
    let themeIdx = themeNames.indexOf(currentTheme as ThemeName);
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
        if (!name) continue;
        const theme = THEMES[name];
        if (!theme) continue;
        const isSelected = i === themeIdx;
        const marker = isSelected ? S.reset + T.accent + BOX.arrow + S.reset : ' ';
        const label = isSelected
          ? S.reset + S.bold + theme.primary + name + S.reset
          : S.reset + theme.primary + name + S.reset;
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
      if (this._onData) stdin.on('data', this._onData);
      this.render();
    };

    const firstListener = stdin.listeners('data')[0];
    this._onData = isStdinDataHandler(firstListener) ? firstListener : undefined;
    stdin.removeAllListeners('data');
    renderThemes();

    stdin.on('data', (key: string) => {
      if (key === '\u0003' || key === 'q' || key === 'Q' || key === '\u001b') {
        cleanupTheme();
        return;
      }
      if (key === '\u001b[A') {
        themeIdx = (themeIdx - 1 + themeNames.length) % themeNames.length;
        renderThemes();
        return;
      }
      if (key === '\u001b[B') {
        themeIdx = (themeIdx + 1) % themeNames.length;
        renderThemes();
        return;
      }
      if (key === '\r') {
        setTheme(themeNames[themeIdx] ?? 'default');
        cleanupTheme();
        return;
      }
    });
  }

  copyCommand(): void {
    const names =
      this.options.multi && this.multiSelected.size > 0 ? [...this.multiSelected] : [this.filteredNames[this.selected]];
    const firstName = names[0];
    if (!firstName) return;

    const commands = names
      .filter((name): name is string => typeof name === 'string')
      .map((name) => {
        const [cmd, ...args] = getPmCommand(this.pm, name, this.scriptArgs ? this.scriptArgs.split(' ') : []);
        return `${cmd} ${args.join(' ')}`;
      });
    const output = commands.join(' && ');

    let copied = false;
    try {
      if (process.platform === 'darwin') {
        execSync(`echo ${JSON.stringify(output)} | pbcopy`, { stdio: 'pipe' });
        copied = true;
      } else if (process.platform === 'win32') {
        execSync(`echo ${JSON.stringify(output)} | clip`, { stdio: 'pipe' });
        copied = true;
      } else {
        execSync(
          `echo ${JSON.stringify(output)} | xclip -selection clipboard 2>/dev/null || echo ${JSON.stringify(output)} | xsel --clipboard --input 2>/dev/null`,
          { stdio: 'pipe' },
        );
        copied = true;
      }
    } catch {
      /* ignore */
    }

    exitAltScreen();
    const msg = copied
      ? `\n${S.green}${BOX.check} Copied to clipboard${S.reset}\n`
      : `\n${S.yellow}${BOX.bullet} Clipboard tools not found — command printed below${S.reset}\n`;
    stdout.write(msg + `\n${S.dim}> ${S.reset}${S.green}${output}${S.reset}\n`, () => {
      cleanupAndExit(0, true);
    });
  }

  runSelected(): void {
    const names =
      this.options.multi && this.multiSelected.size > 0 ? [...this.multiSelected] : [this.filteredNames[this.selected]];
    const selectedNames = names.filter((name): name is string => typeof name === 'string');
    const firstName = selectedNames[0];
    if (!firstName) return;
    this.running = true;
    if (this.options.copy) {
      this.copyCommand();
      return;
    }
    runScripts(selectedNames, this.pkgPath, this.pm, this.scriptArgs);
  }
}
