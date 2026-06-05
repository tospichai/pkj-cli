# pkj-cli

> Interactive `package.json` script picker & runner — zero dependencies

[![npm version](https://img.shields.io/npm/v/pkj-cli.svg)](https://www.npmjs.com/package/pkj-cli)
[![license](https://img.shields.io/npm/l/pkj-cli.svg)](https://github.com/tospichai/pkj-cli/blob/main/LICENSE)

`pkj` is a lightweight, beautiful CLI tool that finds the nearest `package.json`, lists its scripts, and lets you filter & navigate interactively to run them.

```
╭──────────────────────────────────────────────────────────────╮
│                         pkj  my-app  npm                     │
├──────────────────────────────────────────────────────────────┤
│ ~/projects/my-app/package.json                               │
╰──────────────────────────────────────────────────────────────╯

• Filter: type to filter…
• ↑↓ nav  Enter run  / cmd  Ctrl+C quit

  ▸ dev  ↻ 5×
    ▶ npm run dev
    Start development server with hot reload
    ◈ build  · npm run build
    ◈ build:prod  · npm run build:prod
    ✓ test  · npm run test
    ✓ test:e2e  · npm run test:e2e
    ✦ lint  · npm run lint
    ✦ lint:fix  · npm run lint:fix
    ⌫ clean  · npm run clean

╭──────────────────────────────────────────────────────────────╮
│ 1/41 · 41 scripts ▸ dev                                      │
╰──────────────────────────────────────────────────────────────╯
```

## Installation

```bash
npm install -g pkj-cli
```

Or use with npx (no install):

```bash
npx pkj-cli
```

## Usage

```bash
pkj                    # Auto-find package.json from current directory
pkj [path]             # Use specific package.json or directory
pkj --help             # Show help
pkj --version          # Show version
pkj --copy             # Copy command instead of running
pkj --multi            # Enable multi-select mode
pkj --args --watch     # Pass arguments to script
```

### Controls

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate scripts |
| Type | Filter scripts by name (fuzzy search) |
| `Backspace` | Remove last filter character |
| `Enter` | Run selected script |
| `Space` | Toggle multi-select |
| `/` | Open command palette |
| `Ctrl+C` | Quit |

### Command Palette

Press `/` to open the command palette, then type:

| Command | Action |
|---------|--------|
| `a` | Add arguments to script |
| `c` | Copy command to clipboard |
| `m` | Toggle multi-select mode (เลือกหลาย script แล้วรันต่อกัน) |
| `t` | Open theme picker |
| `q` | Quit |
| `h` | Show help |

## Features

- **Zero dependencies** — Only uses Node.js built-in modules
- **Beautiful UI** — Box-drawing borders, elegant icons, and clean typography
- **Auto-discovery** — Walks up directory tree to find `package.json`
- **Auto-detect package manager** — Detects npm, yarn, pnpm, or bun from lock files
- **Fuzzy search** — Type to filter scripts with fuzzy matching (e.g. `bd` → `build:dev`)
- **Smart sorting** — Last run and most-used scripts appear first
- **Script icons** — Visual icons based on script names (build, test, lint, etc.)
- **Script descriptions** — Add `scriptsMeta` in `package.json` to show descriptions
- **Copy mode** — Copy command to clipboard instead of running
- **Multi-select** — Select and run multiple scripts sequentially
- **Run duration** — Shows how long each script took with beautiful output
- **History tracking** — Remembers your most-used scripts across sessions
- **Workspace support** — Detects `-w <workspace>` flags and shows badges
- **Command palette** — Access advanced features with `/` without conflicting with search
- **Theme picker** — Choose from 6 color themes (default, ocean, sunset, forest, rose, midnight)
- **Terminal resize** — Adapts to terminal window size

## Script Descriptions

Add a `scriptsMeta` field to your `package.json` to show descriptions in pkj:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "test": "jest"
  },
  "scriptsMeta": {
    "dev": { "desc": "Start development server with hot reload" },
    "build": { "desc": "Create optimized production build" },
    "test": { "desc": "Run unit tests with Jest" }
  }
}
```

## Examples

```bash
# Navigate to any project and run
pkj

# Point to a specific project
pkj ./my-project

# Point to a specific package.json
pkj ./my-project/package.json

# Copy command to clipboard instead of running
pkj --copy

# Select multiple scripts to run
pkj --multi

# Pass arguments to script
pkj --args --watch
```

## Requirements

- Node.js >= 14.0.0

## License

MIT © [Tospichai Kumngern](https://github.com/tospichai)
