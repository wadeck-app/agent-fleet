# wdrive npm Migration (T7-T9) -- CLI Status and Next Steps

**Version:** v0.1
**Last updated:** 2026-08-22
**Status:** Draft -- T7 ready; T8-T9 deferred pending T5

## Overview

wdrive currently distributes via GitHub Releases + PHP artifact server as a zip. This spec covers the migration to the exe-in-npm pattern (same as flow-cli/task-cli), eliminating the custom download/verify/extract pipeline. The migration is a single-pass change -- no intermediate state where launcher and Node bundle use different config dirs.

## Decisions

| #    | Decision                                                                                                 | Rationale                                                | Date       |
| ---- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------- |
| D-13 | Ed25519 signature verification dropped on migration; GitLab registry + CI WRITE token is the trust model | Key rotation too complex; marginal gain                  | 2026-08-22 |
| D-17 | wdrive unchanged until T9; `~/.wdrive` is the config dir until T5+T9 land together                       | Avoids B2 (two dirs for one tool)                        | 2026-08-22 |
| D-18 | `--config <dir>` override preserved in T9 migration                                                      | Multi-instance is a core wdrive feature; hard constraint | 2026-08-22 |
| D-7  | T8 (SDK UpdateCmd) and T9 (npm migration) deferred                                                       | T5 must land first                                       | 2026-08-22 |

> Note (D-13 / SEC-03): The loss of Ed25519 was audited and explicitly accepted as a trade-off (D-13). WRITE token protection is the sole defense by design. SEC-03 from the security audit is a documented decision, not an open finding.

## Design

### T7 -- Dead code cleanup (ready to implement)

Per `wdrive/.claude/plans/2026-08-18_wdrive-npm-migration-and-dead-code.md`:

- `bundle.ts`: remove unused externals (`sharp` -> devDeps)
- Remove deprecated systray functions

### T8 -- SDK UpdateCmd (blocks T9)

New field in `singleton-daemon-kit` launcher config: `UpdateCmd []string`. When the Go launcher receives an update signal, it spawns `UpdateCmd` as a detached process (SW_HIDE on Windows) then exits -- releasing the file lock before npm overwrites the `.exe`.

Requirement: the launcher exits before npm tries to overwrite it. On Windows, a running `.exe` cannot be replaced in-place (EPERM).

**Note (A-09):** `wdrive-tray.exe` is also a running process during update -- it holds its own file lock. The same SW_HIDE + detach pattern must be applied to the tray process before npm overwrites it. T8 design must account for signaling and exiting both `wdrive.exe` and `wdrive-tray.exe` before the npm replace step.

**T-07 gate:** T-07 (UpdateCmd injection risk) must be resolved before T8 is merged. Minimum: restrict UpdateCmd to npm commands only (e.g., `npm install -g @wadeck/*`). T8 must not ship with an unconstrained UpdateCmd field.

### T9 -- npm migration (requires T5 + T7 + T8)

**New packages:**

- `@wadeck/wdrive` -- main package (JS shim `bin/wdrive.js` + `wdrive.cjs` bundle)
- `@wadeck/wdrive-win32-x64` -- contains `wdrive.exe` (Go launcher) + `wdrive-tray.exe`
- `@wadeck/wdrive-darwin-arm64` -- contains `wdrive_darwin_arm64_release` + tray binary
- `@wadeck/wdrive-darwin-x64` -- contains `wdrive_darwin_amd64_release` + tray binary

> Note: Node bundle (wdrive.cjs) is cross-platform CommonJS. Darwin packages contain only the platform-specific Go launcher binary. No platform-specific Node code required.

**Config dir migration (single pass):**

- `launcher.config.json`: `"defaultConfigDir": "wdrive"` -> SDK XDG -> `~/.config/wdrive`
- `ConfigDir.get('wdrive')` in Node bundle
- `migrateIfNeeded('wdrive')`: `~/.wdrive` -> `~/.config/wdrive` (rename, printed to stderr)

**`--config <dir>` support:**

- Go launcher: `--config <dir>` overrides XDG default (preserved from today)
- Node bundle: reads config dir from same flag (already supported via `resolveConfigDir()`)
- Multiple instances: `wdrive --config ~/.wdrive2` continues to work

**Auto-update:**

- Replaces custom `Updater` class (GitHub API + zip + Ed25519 + PKZIP extractor) with `UpdateManager` from `@wadeck/shared-cli`
- `npm install -g @wadeck/wdrive@<version>` is the update command
- Self-check + rollback via shared-cli pattern
- `UpdateCmd` in launcher config enables the two-phase Windows update (T8)

**CI changes:**

- Add `publish-wdrive.yml` GitHub Actions workflow (same pattern as `publish-flow-cli.yml`)
- Remove GitHub Releases artifact upload step
- Remove PHP server upload step
- `GITLAB_NPM_WRITE_TOKEN` secret already present in agent-fleet; add to wdrive repo

## Open questions

None -- all resolved.

## Security considerations

T-01: WRITE token is CI-only. Existing token validation (PyPI probe) applies.
T-04: Self-check + rollback via UpdateManager.
T-05: wdrive must not run as root/admin -- self-check should verify.
