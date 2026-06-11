import { S } from './theme.js';
import { BOX } from './ui.js';
import type { CliOptions } from './types.js';

export const VERSION = '1.0.0';
export const APP_NAME = 'pkj';

export function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const options: CliOptions = { copy: false, help: false, version: false, multi: false, path: null, args: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--version' || arg === '-v') options.version = true;
    else if (arg === '--copy' || arg === '-c') options.copy = true;
    else if (arg === '--multi' || arg === '-m') options.multi = true;
    else if (arg === '--args' || arg === '-a') {
      options.args = args.slice(i + 1);
      break;
    } else if (!arg.startsWith('-') && !options.path) options.path = arg;
  }
  return options;
}

export function showHelp(): void {
  const c = (s: string, code: string) => (code || '') + s + S.reset;
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
