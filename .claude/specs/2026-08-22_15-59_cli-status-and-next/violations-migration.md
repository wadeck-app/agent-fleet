# violations-framework Migration (T4) -- CLI Status and Next Steps

**Version:** v0.1
**Last updated:** 2026-08-22
**Status:** Draft -- pending implementation

## Overview

violations-framework is migrated from a tsc multi-file distribution to a single esbuild bundle, and its custom version-check code is replaced by `UpdateManager` from `@wadeck/shared-cli`. Scope: violations-cli only -- violations-rules is out of scope.

## Decisions

| #    | Decision                                                                                                 | Rationale                                                              | Date       |
| ---- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------- |
| D-11 | esbuild single bundle `violations.cjs`; tsc for type-check only                                          | Fastest runtime; no module resolution issues; same pattern as flow-cli | 2026-08-22 |
| D-12 | Full background auto-update via `UpdateManager`; cache in `~/.config/violations/`; self-check + rollback | Normalize automatic updates across all CLIs                            | 2026-08-22 |
| D-5  | CI: `npm pkg set version=` instead of `npm version --workspaces`                                         | Prevents EBADPLATFORM; already implemented                             | 2026-08-22 |

## Design

### Build pipeline

Two separate steps -- do not conflate them:

**Step 1: Compile (tsc WITH emit)**

```
tsc                               <- compiles src/ to dist/ (emit enabled)
```

This produces `dist/cli.js` which esbuild needs as its entry point.

**Step 2: Bundle (esbuild)**

```
esbuild dist/cli.js -> dist-bundle/violations.cjs
esbuild dist/updater.js -> dist-bundle/violations-updater.cjs
```

**Step 3: Type-check (CI only, separate job)**

```
tsc --noEmit                      <- separate type-check pass; does NOT produce dist/
```

`tsc --noEmit` is the CI type-check step; it is NOT part of the bundle pipeline. Running `tsc --noEmit` alone (without prior tsc emit) would leave `dist/` absent and cause esbuild to fail.

`scripts/bundle.ts` (copy from flow-cli pattern):

- `entryPoints`: `['dist/cli.js', 'dist/updater.js']`
- `format: 'cjs'`, `platform: 'node'`, `target: 'node24'`
- `external: ['typescript', '@wadeck/violations-rules']`
    - `typescript` must be external: `violations config validate` uses `ts.createProgram()` /
      `ts.createCompilerHost()` which resolve `lib/*.d.ts` files via `__dirname` relative to the
      TypeScript package root. If bundled inline, `__dirname` inside the TypeScript package code
      points to `violations.cjs` location and the `lib/` lookup fails at runtime.
    - `@wadeck/violations-rules` must be external: loaded dynamically from the project at runtime;
      bundling it would freeze the rule set inside `violations.cjs` and break the plugin model.
- `supported: { 'top-level-await': false }`
- `define`: `__VIOLATIONS_CLI_VERSION__` injected at build time
- `banner`: `__importMetaUrl` shim

`package.json` changes:

- `"bin": { "violations": "./dist-bundle/violations.cjs" }`
- `"scripts.build"`: `tsc && npx tsx scripts/bundle.ts`
- `"scripts.typecheck"`: `tsc --noEmit` (used in CI type-check job, separate from build)

### violations-updater.cjs bundle

`UpdateManager.scheduleBackgroundUpdate()` spawns a co-located updater script as a detached background process. Without that script, `scheduleBackgroundUpdate` silently does nothing (no update is ever triggered).

Required second esbuild entry point:

- Input: `dist/updater.js` -- violations-cli must include its own `src/updater/UpdaterMain.ts` that re-exports from `@wadeck/shared-cli/UpdaterMain`. This file is compiled by tsc (step 1) and bundled by esbuild into `violations-updater.cjs`. Same pattern as flow-cli's `packages/flow-cli/src/updater/UpdaterMain.ts`.
- Output: `dist-bundle/violations-updater.cjs`
- Must be co-located with `violations.cjs`

This is the same pattern as `flow-updater.cjs` in flow-cli. Migration plan must include adding this as an explicit step.

### Update mechanism

Remove `runVersionCheckInBackground()` from `cli.ts`. Replace with:

```ts
import { UpdateManager } from '@wadeck/shared-cli/UpdateManager';

// At startup (after self-check display):
const updater = new UpdateManager('@wadeck/violations-cli');
updater.scheduleBackgroundUpdate(__filename); // __filename = violations.cjs path
```

Update state displayed at next interactive run via `updater.readAndClearState()`.

Cache location: `~/.config/violations/` (via `ConfigDir.get('violations')` inside UpdateManager).

### What is removed

- `runVersionCheckInBackground()` in `cli.ts` (~55 lines)
- `.violations/.cache/version-check.json` (replaced by `~/.config/violations/.update-cache.json`)

### Dependency

Add to `violations-cli/package.json`:

```json
"@wadeck/shared-cli": "^1.YYYYMMDDHHMMSS.BUILD"
```

And to project `~/.npmrc`:

```
@wadeck:registry=https://gitlab.com/api/v4/packages/npm/
```

## Open questions

None -- all resolved.

## Security

**CI usage warning:** Never run `violations check` in CI jobs that have `GITLAB_NPM_WRITE_TOKEN` in the environment. Violations loads and executes code from the project's `.violations/rules/` directory and `@wadeck/violations-rules` package. Run violations in a dedicated CI job with READ-only tokens only. This is inherent to the tool's design (user-defined rules), not a bug.

## Security considerations

T-01 applies: auto-update installs from GitLab registry. WRITE token is CI-only. Self-check rollback mitigates T-04. No new surface vs flow-cli.
