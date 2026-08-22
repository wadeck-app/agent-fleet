# Scrapers -- CLI Status and Next Steps

**Version:** v0.1
**Last updated:** 2026-08-22
**Status:** Draft

## Overview

The scrapers (assurance-scrapper, whatsapp-scrapper, chatgpt-scrapper) are local automation scripts running via Windows Scheduled Task. They are NOT distributed CLIs. They live in the monorepo at `C:\Workspace_Tooling\scrappers`. Distribution via npm is out of scope.

## Decisions

| #    | Decision                                                                                                                                                         | Rationale                                                                                      | Date       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------- |
| D-6  | Scrapers consolidated into monorepo at `C:\Workspace_Tooling\scrappers`; shared logic in `@wadeck/shared-scrapper`                                               | DRY violation -- identical code across 3 projects; plain JS CommonJS, no TypeScript            | 2026-08-22 |
| D-14 | `@wadeck/shared-scrapper` not published to registry; workspace resolution only                                                                                   | No external consumers; YAGNI; less attack surface                                              | 2026-08-22 |
| D-15 | Scrapers depend on `@wadeck/shared-cli` (published) in addition to `@wadeck/shared-scrapper`                                                                     | Normalize shared infrastructure across all tools; avoid reimplementing ConfigDir/UpdateManager | 2026-08-22 |
| D-16 | Config in `~/.config/<scraper-name>/config.yml`; data in `~/.config/<scraper-name>/data/` by default; configurable via `--data-dir`; runnable from any directory | XDG semantics respected; scraper runnable from any directory                                   | 2026-08-22 |

## Design

### Package layout

```
packages/shared-scrapper/    -- @wadeck/shared-scrapper (workspace only, not published)
  src/WindowsTask.js
  src/VbsLauncher.js
  src/ProcessLock.js
  src/RotatingLogger.js
  src/TrayNotifier.js

packages/assurance-scrapper/  -- depends on shared-scrapper + @wadeck/shared-cli
packages/whatsapp-scrapper/
packages/chatgpt-scrapper/
```

Note: package names use double-p (`shared-scrapper`, `assurance-scrapper`, etc.) -- this is intentional and must not be changed. Prose in documentation uses the single-p spelling "scraper" for the generic concept.

### Config and data directories

Each scraper uses `ConfigDir` from `@wadeck/shared-cli`:

```
~/.config/assurance-scrapper/
  config.yml           -- user config (sync interval, filters, etc.)
  data/                -- scraped data (default location, configurable via --data-dir)
  logs/                -- log rotation (RotatingLogger)
```

### Data migration (manual)

`migrateIfNeeded('assurance-scrapper')` handles:

- `%APPDATA%\assurance-scrapper` -> `~/.config/assurance-scrapper` (Windows legacy)
- `~/.assurance-scrapper` -> `~/.config/assurance-scrapper` (dot-dir legacy)

It does NOT migrate project-local `./data/` -- this is intentional. Existing project-local data must be moved manually by the user.

**This is a KNOWN MANUAL MIGRATION STEP, not a bug.** Rationale: scraper data can be gigabytes; auto-migrating it silently would be surprising and potentially slow. See also `config-dir.md` note on A-04.

### shared-cli adopted features

| Export            | Adopted? | Reason                                                        |
| ----------------- | -------- | ------------------------------------------------------------- |
| ConfigDir         | Yes      | `~/.config/<name>/` per D-16                                  |
| VersionValidation | Yes      | validate semver strings in config.yml                         |
| UpdateManager     | No       | Scrapers are not distributed via npm; no auto-update pipeline |
| HookDispatcher    | No       | No hook system needed for scheduled scripts                   |

### shared-cli dependency

Add to each scraper `package.json`:

```json
"@wadeck/shared-cli": "^1.YYYYMMDDHHMMSS.BUILD"
```

And to `~/.npmrc`:

```
@wadeck:registry=https://gitlab.com/api/v4/packages/npm/
```

## Open questions

Q-10: Should scrapers warn when running as root/admin? (pending decision)

## Security considerations

D-15 introduces `@wadeck/shared-cli` as a supply chain dependency in scrapers. The scrapers use `schtasks.exe` for OS persistence. A compromised shared-cli version would be installed on machines with scheduled tasks. Mitigated by same CI-only WRITE token controls as other packages (T-01). This risk is tracked in `threat-model.md` T-06.

> **Note (FP-3 / SEC-R3-03 audited):** Supply chain compromise via shared-cli + OS persistence via schtasks.exe. Accepted: same mitigations as all other CLIs (T-01, D-19). shared-scrapper is not published (D-14), reducing attack surface.

T-08: VbsLauncher.write() parameters (nodePath, scriptPath, args) must be sanitized before interpolation into VBScript. Implementation responsibility: `@wadeck/shared-scrapper` must enforce this before any scraper adopts VbsLauncher.
