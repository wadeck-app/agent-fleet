# SDK XDG Support (T5) -- CLI Status and Next Steps

**Version:** v0.1
**Last updated:** 2026-08-22
**Status:** Draft -- pending implementation

## Overview

The `singleton-daemon-kit` Go SDK currently computes the config directory as `~/.<defaultConfigDir>` (adds a `.` prefix, places in home). This prevents unifying the Go launcher config dir with the Node bundle config dir (`~/.config/<appName>`). T5 adds XDG support to the SDK as the new default behavior.

## Decisions

| #    | Decision                                                                                                   | Rationale                                                    | Date       |
| ---- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------- |
| D-10 | SDK adopts XDG as default (breaking change); no legacy opt-out                                             | Clean code; manual migration is explicit                     | 2026-08-22 |
| D-17 | wdrive not touched before T9; `~/.wdrive` remains config dir until T5+T9 land together                     | Avoids intentionally recreating B2; clean one-pass migration | 2026-08-22 |
| D-18 | `--config <dir>` override preserved in T9 migration -- wdrive supports multiple instances; hard constraint | Multi-instance is a core wdrive feature                      | 2026-08-22 |

## Design

### New SDK config dir resolution

```
1. If --config <dir> is passed as CLI arg -> use that dir (override, multi-instance support)
2. If $XDG_CONFIG_HOME is set            -> $XDG_CONFIG_HOME/<appName>
3. Otherwise                             -> $HOME/.config/<appName>
   (Windows: same -- no APPDATA branch)
```

> **WARNING: T5 and T6 must be applied atomically in the same release.**
> Publishing the new SDK (T5) without updating launcher.config.json (T6) in consumers
> recreates B2: the launcher writes to a different path than the Node bundle reads.
> Never merge T5 without T6 ready to ship in the same version bump.

### launcher.config.json changes required in consumers

```json
// Before (old SDK behavior: ~/.<defaultConfigDir>)
{ "defaultConfigDir": "flow-cli" }   -> ~/.flow-cli
{ "defaultConfigDir": "wdrive" }     -> ~/.wdrive

// After (new SDK XDG default)
{ "defaultConfigDir": "flow" }       -> ~/.config/flow
{ "defaultConfigDir": "wdrive" }     -> ~/.config/wdrive
{ "defaultConfigDir": "task" }       -> ~/.config/task
```

The `defaultConfigDir` value changes: it is now the bare app name (no suffix, no dot).

### Migration of existing data

The SDK itself does NOT perform data migration (that is the Node bundle's responsibility via `ConfigDir.migrateIfNeeded`). The Node bundle calls `migrateIfNeeded` at startup which handles:

- `%APPDATA%\<appName>` -> `~/.config/<appName>` (Windows legacy)
- `~/.<appName>` -> `~/.config/<appName>` (old dot-dir pattern)

For wdrive: `migrateIfNeeded('wdrive')` handles `~/.wdrive` -> `~/.config/wdrive` during T9.

### Multi-instance support (wdrive constraint)

The `--config <dir>` parameter override must survive the SDK change. Resolution order:

1. `--config <dir>` flag (explicit, highest priority)
2. XDG default

This is already supported by wdrive's `configDirFromArgs()` pattern and must be preserved in the new SDK.

## Open questions

None -- all resolved.

## Security considerations

Migration (`migrateIfNeeded`) moves files atomically via `fs.renameSync`. Non-fatal on cross-device failure. Config files are YAML/JSON -- not executable. See T-02 in threat-model.md.

> **Note (FP-2 / SEC-R3-02):** `--config` override STRIDE was evaluated. T-07 covers the UpdateCmd injection vector; D-18 documents the legitimate multi-instance use case. Accepted as-is.
