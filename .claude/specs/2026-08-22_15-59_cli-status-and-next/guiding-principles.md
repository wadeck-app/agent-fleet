# Guiding Principles -- CLI Status and Next Steps

These principles take priority in every design decision.
Any option that conflicts with a principle must be raised as an open question -- never silently accepted.

## Principles

### P-1: Single config directory per CLI

Every CLI tool has exactly one config directory on disk, shared by all its components (Go launcher, Node bundle, updater).
**Why:** Two directories for one tool (e.g., `~/.flow-cli` for the launcher and `~/.config/flow` for the Node bundle) confuse users and make debugging harder. Surfaced as B2 in the session analysis.

### P-2: Cross-platform consistency -- always ~/.config

All CLI config directories use `~/.config/<appName>` on all platforms, including Windows. `%APPDATA%` is not used.
**Why:** The user already has `~/.config` on their Windows machine and prefers the XDG-style layout. Platform branching in ConfigDir was a source of bugs (B1: task-cli writing to `~/.config/flow`).

### P-3: Shared infrastructure over duplication

Common patterns (ConfigDir, UpdateManager, CalVer, VbsLauncher, ProcessLock) are extracted to shared packages and consumed as dependencies -- never copy-pasted.
**Why:** The scrapers had identical code in 3 repositories. violations-framework had a partial reimplementation of UpdateManager. Each copy diverges silently.

### P-4: Distribute via npm only

New and migrated CLIs use the exe-in-npm pattern (platform optionalDependencies + JS shim). GitHub Releases and custom artifact servers are migration targets, not new patterns.
**Why:** npm provides registry, version management, and install UX for free. Maintaining a PHP artifact server or GitHub Release parser adds operational burden with no benefit once npm is available.

### P-5: Fail loudly -- no silent fallbacks

When a required artifact, config, or version is missing, the CLI must error with a clear actionable message. Silent defaults (return '0.0.0-dev', skip if missing) mask real problems.
**Why:** Silent fallbacks were responsible for multiple hard-to-diagnose bugs in this codebase. Loudness is preferred even at the cost of user friction on first run.

### P-6: CI-managed versioning (CalVer)

Package versions are never bumped manually. A `preversion` script blocks manual `npm version` calls. CI computes and injects the version using CalVer format `YYYY.MM.DD-BUILD-SHA` (e.g. `2026.08.22-5-d3140e53`) for edge builds, semver for stable releases.
**Why:** Manual version bumps cause merge conflicts, EBADPLATFORM errors on cross-OS CI runners, and drift between packages.
