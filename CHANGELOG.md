# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-06-12

### Changed

- **Migrated the entire codebase from JavaScript (CommonJS) to TypeScript (ESM)** for better type safety and maintainability.
- Split the monolithic `bin/pkj.js` (~1,100 lines) into focused modules under `src/`.
- Added strict TypeScript configuration including `useUnknownInCatchVariables`, `noUncheckedIndexedAccess`, `noImplicitReturns`, and `noUnusedLocals`.

### Added

- Runtime type guards for `package.json`, config, and history JSON files — corrupted user files no longer crash the CLI.
- Centralized `getErrorMessage()` utility for safe error handling without `(e as Error).message` casts.
- Lightweight `Result<T, E>` utility type.
- ESLint + Prettier setup for consistent code style.
- GitHub Actions CI now runs typecheck, lint, format check, build, and tests.
- GitHub Actions publish workflow triggers on `v*` tags.
- `prepublishOnly` hook ensures every publish is typechecked, linted, and tested.
- `exports` and `types` fields in `package.json` for proper ESM + TypeScript consumer support.

### Removed

- All `require()` calls in favor of ESM `import`/`export`.
- All runtime `any` types and unsafe JSON casts.

## [1.0.0] - 2025-06-01

### Added

- Interactive TUI for browsing and running `package.json` scripts
- **Zero runtime dependencies** — pure Node.js, no npm install bloat
- **Auto-detect package manager** from lock files (npm, yarn, pnpm, bun)
- **Fuzzy search** with subsequence matching and smart scoring
- **Smart sort** — last-run script floats to top, then by frequency
- **Half-life decay** for run counts — old runs fade over 7-day half-life
- **Command palette** (`/`) — single-keystroke commands without hijacking filter input
  - `/a` add arguments, `/c` copy to clipboard, `/m` toggle multi-select
  - `/t` theme picker, `/r` reset history, `/q` quit, `/h` help
- **Multi-select mode** — run multiple scripts sequentially
- **Copy mode** — copy full `npm run …` command to clipboard (pbcopy/clip/xclip)
- **6 color themes** — default, ocean, sunset, forest, rose, midnight
- **Search highlight** — continuous range from first to last matched character
- **Script icons** — 15 geometric Unicode symbols mapped by script name
- **Script descriptions** — reads from `scriptsMeta` field in package.json
- **Run history persistence** — stored in `~/.config/pkj/history.json`
- **Config persistence** — theme preference in `~/.config/pkj/config.json`
- **Non-TTY safe** — graceful fallback when stdin is not a terminal
- **Alternate screen buffer** — clean TUI that restores terminal on exit
- **"Press any key to exit"** — pause after short-running scripts so output is visible
- **ANSI-safe** — proper escape sequence handling and visible-length calculations

### Changed

- Slim boxed header — compact 3-line header + filter + separator layout
- Footer with selected script name and pagination count

## [0.1.0] - 2025-05-28

### Added

- Initial proof-of-concept
- Basic script listing with arrow navigation
- Simple filter by typing
