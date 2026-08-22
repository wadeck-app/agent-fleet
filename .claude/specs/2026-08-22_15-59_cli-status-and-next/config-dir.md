# Config Directory Strategy -- CLI Status and Next Steps

**Version:** v0.1
**Last updated:** 2026-08-22
**Status:** Partially Implemented

## Overview

Every CLI tool uses a single config directory: `~/.config/<appName>` on all platforms. This covers both the Go launcher component and the Node.js bundle. The directory is the sole location for update state, logs, user config (config.yml), and future data.

## Decisions

| #   | Decision                                                   | Rationale                                  | Date       |
| --- | ---------------------------------------------------------- | ------------------------------------------ | ---------- |
| D-1 | All platforms use `~/.config/<appName>` including Windows  | User preference; consistency; XDG standard | 2026-08-22 |
| D-2 | Single dir for Go launcher + Node bundle (requires SDK T5) | P-1: one config dir per CLI                | 2026-08-22 |
| D-4 | `ConfigDir.get(appName)` implemented in shared-cli         | Fixes B1 (task-cli using flow dir)         | 2026-08-22 |

## Design

### Resolution algorithm (ConfigDir.get)

```
1. If $XDG_CONFIG_HOME is set -> $XDG_CONFIG_HOME/<appName>
2. Otherwise             -> $HOME/.config/<appName>
   (Windows: same -- no APPDATA branch)
```

### Migration path for existing installations

`ConfigDir.migrateIfNeeded(appName)` runs once at CLI startup:

1. If `~/.config/<appName>` already exists -> no-op
2. Check `%APPDATA%\<appName>` (Windows legacy) -> move if found
3. Check `~/.<appName>` (old dot-dir pattern, e.g., `~/.wdrive`) -> move if found
4. Print to stderr: `[flow] Config migrated: <old> -> <new>`
5. Non-fatal BUT prints warning to stderr: `[<appName>] Config migration failed: <error message>. Your config is still at <oldDir>.`
   This is a WARNING (not an error exit) because the app can still function -- it just uses a fresh config dir.

> **Note (FP-1 / SEC-R3-01):** This satisfies P-5: failure is never silent (stderr warning is always printed). The app continues with a fresh empty config dir rather than aborting, because a missing migration is recoverable -- the user's data is still at the old path.

**Note (A-04 -- intentional design):** Project-local data directories (e.g., `./data/` in scrapers) are NOT auto-migrated -- this is intentional. Scraper data can be gigabytes; auto-migrating it silently would be surprising and potentially slow. Manual migration is required and documented in `scrapers.md`.

### Per-CLI target paths

| CLI                | Config dir                        |
| ------------------ | --------------------------------- |
| flow               | `~/.config/flow`                  |
| task               | `~/.config/task`                  |
| wdrive             | `~/.config/wdrive` (after T9)     |
| violations         | `~/.config/violations` (after T4) |
| assurance-scrapper | `~/.config/assurance-scrapper`    |
| whatsapp-scrapper  | `~/.config/whatsapp-scrapper`     |
| chatgpt-scrapper   | `~/.config/chatgpt-scrapper`      |

### Current state (2026-08-22)

| Component            | Actual path                           | Conformant?            |
| -------------------- | ------------------------------------- | ---------------------- |
| flow-cli Node bundle | `~/.config/flow`                      | Yes                    |
| task-cli Node bundle | `~/.config/task`                      | Yes (fixed D-4)        |
| flow-cli Go launcher | `~/.flow-cli`                         | No -- blocked on T5    |
| task-cli Go launcher | `~/.task-cli`                         | No -- blocked on T5    |
| wdrive Node bundle   | `~/.wdrive`                           | No -- blocked on T9    |
| wdrive Go launcher   | `~/.wdrive`                           | No -- blocked on T5+T9 |
| violations           | `.violations/.cache/` (project-local) | No -- blocked on T4    |

## Open questions

Q-2: SDK T5 approach -- see _index.md

## Security considerations

T-02: `migrateIfNeeded` copies files from legacy paths. If malicious content exists at the legacy path, it moves to the new dir. Mitigated: config files are YAML/JSON (not executable); migration is a one-time rename, not a merge.

> Note (SEC-R02 -- audited): XDG_CONFIG_HOME injection was evaluated. An attacker who can set arbitrary env vars already has full process control; validating XDG_CONFIG_HOME adds no real security boundary. Accepted as-is.
