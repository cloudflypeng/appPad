# apppad

`apppad` is an Electron desktop app for managing Homebrew packages and running
Mole commands with a GUI.

This README is aligned with the current Git history (latest tags and features up
to `v1.0.9`).

## Core Features

- Homebrew status management:
  - Detect install status and versions
  - Update/upgrade actions
  - Status cache persisted in SQLite, cache-first UI with background refresh
- Catalog-based package management:
  - Browser/Terminal/Tools/Essentials tabs
  - Install/uninstall actions with global terminal output
- Installed tab:
  - List installed casks and formulae from cache
- Homebrew Search tab:
  - Search formula/cask with `brew search`
  - Install/uninstall directly from search results
  - Search icons are cached in SQLite; missing icons are fetched and backfilled
- Mole tab:
  - Detect Mole installation and version (cached in SQLite)
  - Update Mole
  - Query uninstallable apps and uninstall by source:
    - If app is from Homebrew cache: use `brew uninstall --cask`
    - Otherwise: use `mo uninstall <app>`
- Global terminal panel:
  - Shared command output panel
  - Manual open button supported

## Tech Stack

- Electron + electron-vite
- React + TypeScript
- Tailwind CSS
- better-sqlite3 (local cache database)

## Local Development

### Install

```bash
pnpm install
```

### Run in development

```bash
pnpm dev
```

### Typecheck

```bash
pnpm typecheck
```

## Build

```bash
pnpm build:mac
```

## Release Flow

### Local release command

The project provides:

```bash
pnpm run release
```

This command:

1. bumps patch version
2. commits version files
3. creates `v<version>` tag
4. pushes commit and tag

### GitHub Actions

Tag push (`v*`) triggers `.github/workflows/tag-build.yml`:

1. create GitHub Release
2. build macOS artifacts
3. upload artifacts to the release

## macOS Gatekeeper (If Blocked)

If macOS reports the app as damaged or blocks opening:

```bash
xattr -dr com.apple.quarantine /Applications/apppad.app
```

If needed, open once from terminal:

```bash
open /Applications/apppad.app
```
