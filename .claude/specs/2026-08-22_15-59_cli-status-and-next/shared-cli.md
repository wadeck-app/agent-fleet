# shared-cli Package -- CLI Status and Next Steps

**Version:** v0.1
**Last updated:** 2026-08-22
**Status:** Draft

## Overview

`@wadeck/shared-cli` is a private npm package that provides shared utilities for all Wadeck CLIs: ConfigDir, UpdateManager, HookDispatcher, VersionValidation. It lives in its own repo (`https://github.com/Wadeck/shared-cli`, local: `C:\Workspace_Tooling\shared-cli`) and is published to the GitLab npm registry so that all consumers (flow-cli, task-cli, violations-framework, wdrive, scrapers) can depend on it.

It does NOT contain anything specific to flow or task business logic.

## Decisions

| #   | Decision                                                                                                                                                                                       | Rationale                                                                                      | Date       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------- |
| D-3 | Source lives in its own repo (`C:\Workspace_Tooling\shared-cli`); published as `@wadeck/shared-cli` to GitLab registry; same CalVer pattern as singleton-daemon-kit; no `file:` path overrides | Clean separation; own repo serves as documentation for CLI best practices; same pattern as SDK | 2026-08-22 |
| D-4 | `ConfigDir.get(appName)` parameterized                                                                                                                                                         | Fixes B1; enables per-app config dirs                                                          | 2026-08-22 |

## Design

### Current exports

- `ConfigDir` -- static `get(appName)`, `migrateIfNeeded(appName)`
- `UpdateManager` -- class with `scheduleBackgroundUpdate()`, `readAndClearState()`
- `HookDispatcher` -- hook lifecycle management
- `VersionValidation` -- static `validate(v)`, `VERSION_RE`

### Publishing

Resolved by D-3 and D-9: CalVer (same format as singleton-daemon-kit), published via CI pipeline on the `shared-cli` repo. No `file:` path overrides in consumers.

### package.json (T-NEW: pre-publish changes required)

The current `packages/shared-cli/package.json` in agent-fleet (used during initial development) must be updated before the repo is extracted and published:

- `"name"`: must be `"@wadeck/shared-cli"` (add `@wadeck/` scope)
- Remove `"private": true`
- Add `"publishConfig": { "registry": "https://gitlab.com/api/v4/packages/npm/" }`

### Consumer setup

Consumers add to `~/.npmrc`:

```
@wadeck:registry=https://gitlab.com/api/v4/packages/npm/
//gitlab.com/api/v4/packages/npm/:_authToken=<READ_TOKEN>
```

Then: `npm install @wadeck/shared-cli`

## Open questions

None -- all resolved (Q-1 resolved by D-3).

## Security considerations

T-06: shared-cli is a supply chain dependency. A malicious publish would affect all consumers. Mitigated by same token controls as other packages (CI-only WRITE token, D-3). Blast radius of a compromised version is limited by the caret range strategy (D-19).
