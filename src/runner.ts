import { spawn } from 'child_process';
import { S } from './theme.js';
import { BOX, stdout, stdin, getTermSize, drawLine, exitAltScreen } from './ui.js';
import { getPmCommand } from './pm.js';

// ─── Script Runner ──────────────────────────────────────────────────────────
export function runScripts(names: string[], pkgPath: string, pm: string, extraArgs: string): void {
  const dir = pkgPath.slice(0, Math.max(pkgPath.lastIndexOf('/'), pkgPath.lastIndexOf('\\')));
  const args = extraArgs ? extraArgs.split(' ') : [];
  if (names.length === 1) {
    const name = names[0];
    if (!name) return;
    runSingle(name, dir, pm, args);
  } else {
    runSequential(names, dir, pm, args);
  }
}

function spawnChild(cmd: string, args: string[], dir: string): ReturnType<typeof spawn> {
  return spawn(cmd, args, { stdio: 'inherit', cwd: dir, shell: process.platform === 'win32' });
}

function runSingle(name: string, dir: string, pm: string, extraArgs: string[]): void {
  const command = getPmCommand(pm, name, extraArgs);
  const cmd = command[0];
  if (!cmd) return;
  const args = command.slice(1);
  const { cols } = getTermSize();
  stdout.write(`${S.cyan}${BOX.tl}${drawLine(BOX.h, cols - 2)}${BOX.tr}${S.reset}\n`);
  stdout.write(
    `${S.cyan}${BOX.v}${S.reset} ${S.bold}${S.white}▶ ${cmd} ${args.join(' ')}${S.reset} ${S.cyan}${BOX.v}${S.reset}\n`,
  );
  stdout.write(`${S.cyan}${BOX.ml}${drawLine(BOX.h, cols - 2)}${BOX.mr}${S.reset}\n`);
  stdout.write(`${S.cyan}${BOX.v}${S.reset} ${S.dim}${dir}${S.reset} ${S.cyan}${BOX.v}${S.reset}\n`);
  stdout.write(`${S.cyan}${BOX.bl}${drawLine(BOX.h, cols - 2)}${BOX.br}${S.reset}\n\n`);

  const startTime = Date.now();
  exitAltScreen();
  if (stdin.isTTY) {
    try {
      stdin.setRawMode(false);
    } catch {
      /* ignore */
    }
  }
  stdin.pause();

  const child = spawnChild(cmd, args, dir);

  child.on('exit', (code, signal) => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    if (!signal && code === 0) {
      stdout.write(`\n${S.green}${BOX.check} Done in ${duration}s${S.reset}\n`);
    } else {
      stdout.write(`\n${S.red}${BOX.cross} Failed (${signal ?? code}) after ${duration}s${S.reset}\n`);
    }
    setTimeout(() => {
      stdout.write('\n', () => cleanupAndExit(signal ? 1 : (code ?? 0), true));
    }, 300);
  });

  child.on('error', (err) => {
    console.error(`\n${S.red}${BOX.cross} Failed to run script: ${err.message}${S.reset}`);
    cleanupAndExit(1);
  });
}

function runSequential(names: string[], dir: string, pm: string, extraArgs: string[]): void {
  const { cols } = getTermSize();
  stdout.write(`${S.cyan}${BOX.tl}${drawLine(BOX.h, cols - 2)}${BOX.tr}${S.reset}\n`);
  stdout.write(
    `${S.cyan}${BOX.v}${S.reset} ${S.bold}${S.white}▶ Running ${names.length} scripts${S.reset} ${S.cyan}${BOX.v}${S.reset}\n`,
  );
  stdout.write(`${S.cyan}${BOX.ml}${drawLine(BOX.h, cols - 2)}${BOX.mr}${S.reset}\n`);
  stdout.write(`${S.cyan}${BOX.v}${S.reset} ${S.dim}${dir}${S.reset} ${S.cyan}${BOX.v}${S.reset}\n`);
  stdout.write(`${S.cyan}${BOX.bl}${drawLine(BOX.h, cols - 2)}${BOX.br}${S.reset}\n\n`);

  let index = 0;
  const totalStart = Date.now();

  function next(): void {
    if (index >= names.length) {
      const duration = ((Date.now() - totalStart) / 1000).toFixed(2);
      stdout.write(`\n${S.green}${BOX.check} All ${names.length} scripts done in ${duration}s${S.reset}\n`);
      setTimeout(() => {
        stdout.write('\n', () => cleanupAndExit(0, true));
      }, 300);
      return;
    }

    const name = names[index++];
    if (!name) {
      next();
      return;
    }
    const command = getPmCommand(pm, name, extraArgs);
    const cmd = command[0];
    if (!cmd) {
      next();
      return;
    }
    const args = command.slice(1);
    stdout.write(`${S.cyan}[${index}/${names.length}]${S.reset} ${S.bold}${name}${S.reset}\n`);
    stdout.write(`  ${S.dim}${cmd} ${args.join(' ')}${S.reset}\n`);

    const startTime = Date.now();
    const child = spawnChild(cmd, args, dir);

    child.on('exit', (code, signal) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      if (!signal && code === 0) {
        stdout.write(`  ${S.green}${BOX.check} ${name} (${duration}s)${S.reset}\n\n`);
        next();
      } else {
        stdout.write(`\n${S.red}${BOX.cross} ${name} failed (${signal ?? code}) after ${duration}s${S.reset}\n`);
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
    try {
      stdin.setRawMode(false);
    } catch {
      /* ignore */
    }
  }
  stdin.pause();
  next();
}

// ─── Cleanup ────────────────────────────────────────────────────────────────
export function cleanupAndExit(code = 0, skipAltScreen = false): void {
  if (!skipAltScreen) exitAltScreen();
  if (stdin.isTTY) {
    try {
      stdin.setRawMode(false);
    } catch {
      /* ignore */
    }
  }
  stdin.pause();
  stdin.removeAllListeners('data');
  process.exit(code);
}
