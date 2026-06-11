import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

import {
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
  parseArgs,
  THEMES,
} from '../src/index.js';

// ─── ANSI Utilities ─────────────────────────────────────────────────────────
describe('stripAnsi', () => {
  it('strips color codes', () => {
    assert.strictEqual(stripAnsi('\x1b[31mred\x1b[0m'), 'red');
    assert.strictEqual(stripAnsi('\x1b[1m\x1b[32mbold green\x1b[0m'), 'bold green');
  });

  it('leaves plain text untouched', () => {
    assert.strictEqual(stripAnsi('hello world'), 'hello world');
  });

  it('handles empty string', () => {
    assert.strictEqual(stripAnsi(''), '');
  });
});

describe('visibleLength', () => {
  it('counts visible chars only', () => {
    assert.strictEqual(visibleLength('\x1b[31mhi\x1b[0m'), 2);
  });

  it('matches plain string length', () => {
    assert.strictEqual(visibleLength('hello'), 5);
  });
});

// ─── Fuzzy Search ───────────────────────────────────────────────────────────
describe('fuzzyScore', () => {
  it('returns 0 for empty pattern', () => {
    assert.strictEqual(fuzzyScore('', 'build'), 0);
  });

  it('returns -1 when pattern does not match', () => {
    assert.strictEqual(fuzzyScore('xyz', 'build'), -1);
  });

  it('scores exact match highest', () => {
    const exact = fuzzyScore('build', 'build');
    const prefix = fuzzyScore('bui', 'build');
    const subseq = fuzzyScore('bld', 'build');
    assert.ok(exact > prefix);
    assert.ok(prefix > subseq);
  });

  it('scores prefix match higher than substring', () => {
    const prefix = fuzzyScore('bui', 'build');
    const mid = fuzzyScore('ild', 'build');
    assert.ok(prefix > mid);
  });

  it('scores consecutive chars higher', () => {
    const consecutive = fuzzyScore('bui', 'build');
    const scattered = fuzzyScore('bid', 'build');
    assert.ok(consecutive > scattered);
  });
});

// ─── Half-Life Decay ────────────────────────────────────────────────────────
describe('decayCount', () => {
  const HALF_LIFE = 7 * 24 * 60 * 60 * 1000;

  it('returns 0 for missing inputs', () => {
    assert.strictEqual(decayCount(0, Date.now()), 0);
    assert.strictEqual(decayCount(10, 0), 0);
  });

  it('returns full count when elapsed is 0', () => {
    const now = Date.now();
    assert.strictEqual(decayCount(10, now, now), 10);
  });

  it('halves after one half-life', () => {
    const now = Date.now();
    const result = decayCount(10, now - HALF_LIFE, now);
    assert.strictEqual(result, 5);
  });

  it('quarters after two half-lives', () => {
    const now = Date.now();
    const result = decayCount(10, now - 2 * HALF_LIFE, now);
    assert.strictEqual(result, 2.5);
  });

  it('approaches zero over long time', () => {
    const now = Date.now();
    const result = decayCount(10, now - 10 * HALF_LIFE, now);
    assert.ok(result < 0.01);
  });
});

describe('roundDisplayCount', () => {
  it('returns 0 for values under 0.5', () => {
    assert.strictEqual(roundDisplayCount(0.3), 0);
    assert.strictEqual(roundDisplayCount(0), 0);
  });

  it('rounds to 1 decimal for small values', () => {
    assert.strictEqual(roundDisplayCount(2.34), 2.3);
    assert.strictEqual(roundDisplayCount(9.99), 10);
  });

  it('rounds to integer for values >= 10', () => {
    assert.strictEqual(roundDisplayCount(10.4), 10);
    assert.strictEqual(roundDisplayCount(15.6), 16);
  });
});

// ─── String Utilities ───────────────────────────────────────────────────────
describe('truncate', () => {
  it('returns original if within limit', () => {
    assert.strictEqual(truncate('hello', 10), 'hello');
  });

  it('truncates with ellipsis', () => {
    assert.strictEqual(truncate('hello world', 8), 'hello …');
    assert.strictEqual(truncate('hello world', 10), 'hello wo…');
  });

  it('handles empty string', () => {
    assert.strictEqual(truncate('', 5), '');
  });
});

// ─── Package Manager ────────────────────────────────────────────────────────
describe('getPmCommand', () => {
  it('formats npm command with -- separator', () => {
    const [_cmd, ...args] = getPmCommand('npm', 'build', ['--watch']);
    assert.deepStrictEqual(args, ['run', 'build', '--', '--watch']);
  });

  it('formats pnpm command without --', () => {
    const [_cmd, ...args] = getPmCommand('pnpm', 'dev', ['--port', '3000']);
    assert.deepStrictEqual(args, ['run', 'dev', '--port', '3000']);
  });

  it('formats bun command directly', () => {
    const [_cmd, ...args] = getPmCommand('bun', 'start', ['--help']);
    assert.deepStrictEqual(args, ['run', 'start', '--help']);
  });

  it('handles no extra args', () => {
    const [_cmd, ...args] = getPmCommand('npm', 'test', []);
    assert.deepStrictEqual(args, ['run', 'test', '--']);
  });
});

describe('detectPackageManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkj-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects bun from bun.lockb', () => {
    fs.writeFileSync(path.join(tmpDir, 'bun.lockb'), '');
    assert.strictEqual(detectPackageManager(tmpDir), 'bun');
  });

  it('detects pnpm from pnpm-lock.yaml', () => {
    fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');
    assert.strictEqual(detectPackageManager(tmpDir), 'pnpm');
  });

  it('detects yarn from yarn.lock', () => {
    fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '');
    assert.strictEqual(detectPackageManager(tmpDir), 'yarn');
  });

  it('detects npm from package-lock.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '');
    assert.strictEqual(detectPackageManager(tmpDir), 'npm');
  });

  it('defaults to npm when no lock file', () => {
    assert.strictEqual(detectPackageManager(tmpDir), 'npm');
  });

  it('detects pnpm workspace', () => {
    fs.writeFileSync(path.join(tmpDir, 'pnpm-workspace.yaml'), '');
    assert.strictEqual(detectPackageManager(tmpDir), 'pnpm');
  });
});

// ─── Highlight ──────────────────────────────────────────────────────────────
describe('highlightName', () => {
  const theme = {
    primary: '\x1b[36m',
    secondary: '\x1b[34m',
    accent: '\x1b[32m',
    match: '\x1b[33m',
    desc: '\x1b[34m',
    dim: '\x1b[90m',
    border: '\x1b[90m',
  };

  it('returns plain colored name when no filter', () => {
    const result = highlightName('build', '', theme);
    assert.ok(result.includes('build'));
  });

  it('highlights matched range', () => {
    const result = highlightName('build', 'bld', theme);
    assert.ok(result.includes('bui')); // prefix
    assert.ok(result.includes('ld')); // suffix
  });

  it('returns plain name when no match', () => {
    const result = highlightName('build', 'xyz', theme);
    assert.strictEqual(result, 'build');
  });
});

// ─── Icons ──────────────────────────────────────────────────────────────────
describe('getIcon', () => {
  it('returns dev icon for dev scripts', () => {
    assert.strictEqual(getIcon('dev'), '▸');
    assert.strictEqual(getIcon('start'), '▸');
    assert.strictEqual(getIcon('watch'), '▸');
  });

  it('returns test icon for test scripts', () => {
    assert.strictEqual(getIcon('test'), '●');
    assert.strictEqual(getIcon('jest'), '●');
  });

  it('returns build icon for build scripts', () => {
    assert.strictEqual(getIcon('build'), '■');
    assert.strictEqual(getIcon('tsc'), '■');
  });

  it('returns default bullet for unknown', () => {
    assert.strictEqual(getIcon('foobar'), '•');
  });
});

// ─── Argument Parsing ───────────────────────────────────────────────────────
describe('parseArgs', () => {
  it('parses --help', () => {
    const opts = parseArgs(['node', 'pkj', '--help']);
    assert.strictEqual(opts.help, true);
  });

  it('parses --version', () => {
    const opts = parseArgs(['node', 'pkj', '--version']);
    assert.strictEqual(opts.version, true);
  });

  it('parses --copy', () => {
    const opts = parseArgs(['node', 'pkj', '--copy']);
    assert.strictEqual(opts.copy, true);
  });

  it('parses --multi', () => {
    const opts = parseArgs(['node', 'pkj', '--multi']);
    assert.strictEqual(opts.multi, true);
  });

  it('parses --args', () => {
    const opts = parseArgs(['node', 'pkj', '--args', '--watch', '--port', '3000']);
    assert.deepStrictEqual(opts.args, ['--watch', '--port', '3000']);
  });

  it('parses path argument', () => {
    const opts = parseArgs(['node', 'pkj', '/some/path']);
    assert.strictEqual(opts.path, '/some/path');
  });

  it('defaults all options to false/null', () => {
    const opts = parseArgs(['node', 'pkj']);
    assert.strictEqual(opts.copy, false);
    assert.strictEqual(opts.help, false);
    assert.strictEqual(opts.version, false);
    assert.strictEqual(opts.multi, false);
    assert.strictEqual(opts.path, null);
    assert.deepStrictEqual(opts.args, []);
  });
});

// ─── Themes ─────────────────────────────────────────────────────────────────
describe('THEMES', () => {
  it('has 6 themes', () => {
    assert.strictEqual(Object.keys(THEMES).length, 6);
  });

  it('each theme has required color keys', () => {
    const required = ['primary', 'secondary', 'accent', 'match', 'desc', 'dim', 'border'];
    for (const [name, theme] of Object.entries(THEMES)) {
      for (const key of required) {
        assert.ok((theme as unknown as Record<string, string>)[key], `theme "${name}" missing "${key}"`);
      }
    }
  });
});
