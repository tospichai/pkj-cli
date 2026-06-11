#!/usr/bin/env node
/**
 * pkj — Interactive package.json script picker & runner
 *
 * A zero-dependency CLI tool that finds package.json, lists scripts,
 * lets you filter & navigate interactively, then runs the selected script.
 */

import { pathToFileURL } from 'node:url';
import { S } from './theme.js';
import { BOX, stdin, enterAltScreen } from './ui.js';
import { parseArgs, showHelp, VERSION } from './args.js';
import { resolvePackageJson, loadPackageJson } from './pkg.js';
import { recordRun } from './history.js';
import { Picker } from './picker.js';
import { cleanupAndExit } from './runner.js';
import { getErrorMessage } from './utils/errors.js';

// ─── Main ───────────────────────────────────────────────────────────────────
function main(): void {
  const options = parseArgs(process.argv);
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  if (options.version) {
    console.log(VERSION);
    process.exit(0);
  }

  let pkgPath: string | null;
  try {
    pkgPath = resolvePackageJson(options.path ?? undefined);
  } catch (_e) {
    console.error(`${S.red}${BOX.cross} Error: ${getErrorMessage(_e)}${S.reset}`);
    process.exit(2);
  }

  let data;
  try {
    if (!pkgPath) throw new Error('package.json not found');
    data = loadPackageJson(pkgPath);
  } catch (e) {
    console.error(`${S.red}${BOX.cross} Error: ${getErrorMessage(e)}${S.reset}`);
    process.exit(2);
  }

  const picker = new Picker(data, options);

  stdin.setEncoding('utf8');
  if (stdin.isTTY) {
    enterAltScreen();
    try {
      stdin.setRawMode(true);
    } catch {
      console.error(
        `${S.yellow}${BOX.bullet} Warning: Cannot set raw mode. Interactive features may be limited.${S.reset}`,
      );
    }
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

  stdin.on('data', (key: string) => {
    if (key === '\u0003') {
      cleanupAndExit(1);
      return;
    }
    if (key === '\u001b') {
      if (picker.mode !== 'normal') {
        picker.cancelMode();
        return;
      }
      cleanupAndExit(0);
      return;
    }
    if (key === '\r') {
      if (picker.mode === 'args') {
        picker.confirmArgs();
        return;
      }
      if (picker.mode === 'command') {
        picker.handleCommand();
        return;
      }
      recordRun(data.pkgPath, picker.filteredNames[picker.selected] ?? '');
      picker.runSelected();
      return;
    }
    if (key === ' ') {
      if (picker.mode === 'args') {
        picker.addFilterChar(' ');
        return;
      }
      picker.toggleMultiSelect();
      return;
    }
    if (key === '\u001b[A') {
      picker.moveUp();
      return;
    }
    if (key === '\u001b[B') {
      picker.moveDown();
      return;
    }
    if (key === '\u0008' || key === '\u007f') {
      picker.removeFilterChar();
      return;
    }
    if (key === '/' && picker.mode === 'normal') {
      picker.startCommand();
      return;
    }
    if (key.startsWith('/') && key.length > 1 && picker.mode === 'normal') {
      picker.startCommand();
      for (let i = 1; i < key.length; i++) picker.addFilterChar(key.charAt(i));
      return;
    }
    if (key >= ' ' && key <= '~') {
      picker.addFilterChar(key);
      return;
    }
  });
}

process.on('uncaughtException', (err) => {
  console.error(`${S.red}${BOX.cross} Unexpected error: ${err.message}${S.reset}`);
  cleanupAndExit(1);
});

process.on('SIGINT', () => cleanupAndExit(1));
process.on('SIGTERM', () => cleanupAndExit(1));

const mainModule = process.argv[1];
if (mainModule && import.meta.url === pathToFileURL(mainModule).href) {
  main();
}

// ─── Exports for testing ────────────────────────────────────────────────────
export { stripAnsi, visibleLength, truncate } from './ui.js';

export { fuzzyScore, highlightName } from './fuzzy.js';

export { decayCount, roundDisplayCount, recordRun, getScriptStats, resetHistory, migrateRuns } from './history.js';

export { getPmCommand, detectPackageManager } from './pm.js';

export { getIcon } from './icons.js';

export { parseArgs } from './args.js';

export { THEMES, getTheme, setTheme } from './theme.js';

export { findPackageJson, resolvePackageJson, loadPackageJson } from './pkg.js';

export { Picker } from './picker.js';
export { cleanupAndExit } from './runner.js';
