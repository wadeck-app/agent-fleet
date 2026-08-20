# CLI Distribution -- Implementation Plan

**Created:** 2026-08-19
**Spec:** `.claude/specs/2026-08-18_21-01_cli-distribution/`
**Goal:** Distribute `flow` and `task` as `npm install -g @wadeck/flow-cli` with Go launcher (flow.exe in Task Manager). No repo checkout required.
**Registry:** GitLab npm -- same `@wadeck` scope as `@wadeck/singleton-daemon-kit` and `@wadeck/violations-cli`. Get registry URL from `C:\Workspace_Tooling\agent-fleet\.npmrc` or existing package publishConfig.

---

## Dependency graph

```
Phase 1 (SDK check, ~1h)
    |
    +-------------------------------+
    |                               |
    v                               v
Phase 2a (spec: package-      Phase 2b (spec: threat-model,
structure, A-02 resolution)   out-of-scope, self-check,
~1h -- needs SDK result       ci-pipeline, _index.md)
    |                               |
    +-------------------------------+
                    |
                    v
          Phase 3 (esbuild bundles, ~2h)
                    |
                    v
          Phase 4 (package structure, ~2h)
                    |
                    v
          Phase 5 (UpdateManager, ~3h)
                    |
                    v
          Phase 6 (flow cli commands, ~2h)
                    |
                    v
          Phase 7 (CI pipeline, ~2h)
                    |
                    v
          Phase 8 (validation, ~1h)

Total: ~14h
```

**Critical path:** Phase 1 unblocks Phase 2a, which unblocks Phase 4 (can't write package-structure.md until SDK env var approach is confirmed).

---

## Phase 1 -- SDK check and contribution [~1h]

**Goal:** Confirm or add `LAUNCHER_BUNDLE_OVERRIDE` env var support in the Go launcher.

**Why:** `flow.exe` (from `@wadeck/flow-cli-win32-x64`) and `flow.cjs` (from `@wadeck/flow-cli`) are in different npm packages -- different directories. The launcher's `nodeScript` relative path breaks. The JS shim must pass the absolute bundle path to the launcher via env var.

- [ ] Read `C:\Workspace_Tooling\singleton-daemon-kit\go-launcher\launcher.go`
    - Does it check `LAUNCHER_BUNDLE_OVERRIDE` env var and use it instead of `cfg.NodeScript`?

**If YES:** document the env var name, move to Phase 2.

**If NO:** contribute to SDK (~10 lines in `launcher.go`):

```go
// in runDaemon(), before constructing node command args:
if override := os.Getenv("LAUNCHER_BUNDLE_OVERRIDE"); override != "" {
    cfg.NodeScript = override
}
```

- Commit to `C:\Workspace_Tooling\singleton-daemon-kit`
- Bump SDK version and publish to GitLab npm
- Update `@wadeck/singleton-daemon-kit` dependency in `packages/flow-cli/package.json`
- Re-run `npm install` in agent-fleet

---

## Phase 2a -- Spec: package structure and A-02 resolution [~1h]

**Prerequisite:** Phase 1 (SDK env var name confirmed)

Write in `.claude/specs/2026-08-18_21-01_cli-distribution/`:

- [ ] `package-structure.md` -- exact package.json for all 10 packages:
    - `@wadeck/flow-cli` (main) + 4 platform packages: `win32-x64`, `darwin-arm64`, `darwin-x64`, `linux-x64`
    - `@wadeck/task-cli` (main) + 4 platform packages
    - Document: registry URL from existing `@wadeck` npmrc config
    - Document: `LAUNCHER_BUNDLE_OVERRIDE` env var set by JS shim

- [ ] Resolve in `_index.md`:
    - A-02: "JS shim sets `LAUNCHER_BUNDLE_OVERRIDE=<abs path to flow.cjs>` before execFileSync(launcher)"
    - A-01: "File lock at `~/.config/flow/.update.lock` (O_EXCL, exit immediately if locked)"
    - S-01: "flow-updater.cjs is a separate esbuild entry -- no flow runtime loaded"
    - S-02: "Version string from npm view validated: `/^\d+\.\d+\.\d+([-+][\w.-]+)?$/` before use"
    - S-03: "previousVersion from update-state.json same validation before rollback"
    - A-05: "Full CI path list: flow-cli, flow-engine, extension-points, plugin-none, plugin-worktree, plugin-cli-approval, shared-common"
    - C-05: "Breaking changes: CHANGELOG.md entry required + dist-tag `breaking-edge` for 48h before moving to `edge`"
    - C-06: "Node.js not on PATH: `flow requires Node.js >= 22. Install from https://nodejs.org and ensure 'node' is on your PATH.`"
    - C-07: "Linux in scope: linux/amd64 (for containerized agents)"

---

## Phase 2b -- Spec: remaining module files [~1h]

**Prerequisite:** none (start immediately, parallel with Phase 1)

Write in `.claude/specs/2026-08-18_21-01_cli-distribution/`:

- [ ] `self-check.md` -- 8 checks with mock strategy per check:
    1. Bundle integrity: `import FlowExecutor` -- no mock, pass if no throw
    2. Config loading: `FlowConfig.load(os.tmpdir())` -- no mock, pass if no throw
    3. YAML flow parsing: parse inline minimal YAML string -- no mock
    4. StepRunner init: `new StepRunner({ executor: { execute: () => Promise.resolve() } })` -- inline mock
    5. Plugin system: `PluginRegistry.load({ manifestOnly: true })` -- add `manifestOnly` flag to PluginRegistry (no plugin activation)
    6. TaskStore: `new TaskStore(fs.mkdtempSync('flow-check-'))` + create + findByPrefix + delete -- cleanup after
    7. HookDispatcher: `new HookDispatcher({})` + `dispatch('onTaskCreated', {}, () => {})` -- no mock
    8. Workspace config: `FlowConfig.load().workspace` -- assert `retainDays` and `maxWorkspaces` present

- [ ] `ci-pipeline.md` -- GitHub Actions workflow spec (input for Phase 7)

- [ ] Update `threat-model.md`:
    - Mark T-01 **Mitigated**: npm SHA512 integrity check on GitLab private registry
    - Mark T-02 **Mitigated**: P-4 (user-local install, no sudo)
    - Replace asset "GitHub Release hosting" with "GitLab npm registry"
    - Fill all STRIDE sections referencing actual decisions
    - Add T-03: concurrent updater race -- Mitigated by file lock (A-01)
    - Add T-04: version string injection -- Mitigated by semver validation (S-02)

- [ ] Update `out-of-scope.md` (record rejected options):
    - GitHub Releases as distribution channel -- replaced by npm GitLab registry
    - Embedded Node.js runtime (pkg/bun/deno compile) -- binary size unacceptable (>80 MB)
    - Single combined `@wadeck/flow-task-cli` package -- independent versioning required
    - HTTP self-updater downloading zip artifacts -- replaced by `npm install -g`
    - `update-check` npm library -- replaceable with 30 lines using `npm view` + cache file

---

## Phase 3 -- esbuild bundles [~2h]

**Prerequisite:** Phase 2a + Phase 2b complete. TypeScript builds cleanly.

All work in `packages/flow-cli/`:

- [ ] Create `scripts/bundle.ts`:
    - Entry: `dist/cli/FlowIndex.js` (tsc output)
    - Output: `dist-bundle/flow.cjs`
    - Config: `format: 'cjs'`, `platform: 'node'`, `target: 'node22'`, `bundle: true`, `external: []`
    - ESM top-level await workaround (same as wdrive): `supported: { 'top-level-await': false }`
    - `import.meta.url` shim (same as wdrive): `define` + banner
    - All `file:../` workspace siblings inlined (verify: no `require('../../../flow-engine')` in output)

- [ ] Create `scripts/bundle-task.ts`:
    - Entry: `dist/cli/TaskIndex.js`, Output: `dist-bundle/task.cjs`
    - Same config as above

- [ ] Create `scripts/bundle-updater.ts`:
    - Entry: `dist/updater/UpdaterMain.js` (new file, see Phase 5)
    - Output: `dist-bundle/flow-updater.cjs`
    - **Must NOT import any flow runtime** (FlowExecutor, StepRunner, FlowEngine, etc.)
    - Allowed imports: `node:fs`, `node:path`, `node:child_process`, `node:os`, `semver`
    - Verify output size < 200 KB (no accidental flow runtime inclusion)

- [ ] Update `packages/flow-cli/package.json` scripts:

    ```json
    "bundle": "tsx scripts/bundle.ts",
    "bundle-task": "tsx scripts/bundle-task.ts",
    "bundle-updater": "tsx scripts/bundle-updater.ts",
    "bundle:all": "npm run bundle && npm run bundle-task && npm run bundle-updater"
    ```

- [ ] Run `npm run build && npm run bundle:all`
- [ ] Verify `dist-bundle/` contains: `flow.cjs`, `task.cjs`, `flow-updater.cjs`
- [ ] Verify `flow.cjs` has no unresolved workspace references

---

## Phase 4 -- Publishable package structure [~2h]

**Prerequisite:** Phase 3 (bundles verified). Phase 2a (registry URL, env var name confirmed).

### 4a. Main packages

- [ ] Create `packages/flow-cli-dist/package.json`:

    ```json
    {
    	"name": "@wadeck/flow-cli",
    	"version": "0.0.0",
    	"private": false,
    	"bin": { "flow": "./bin/flow.js" },
    	"files": ["bin/", "flow.cjs", "package.json"],
    	"optionalDependencies": {
    		"@wadeck/flow-cli-win32-x64": "*",
    		"@wadeck/flow-cli-darwin-arm64": "*",
    		"@wadeck/flow-cli-darwin-x64": "*",
    		"@wadeck/flow-cli-linux-x64": "*"
    	},
    	"publishConfig": { "registry": "<same URL as @wadeck/singleton-daemon-kit>" }
    }
    ```

- [ ] Create `packages/flow-cli-dist/bin/flow.js` (JS shim):

    ```js
    #!/usr/bin/env node
    'use strict';
    const { execFileSync } = require('child_process');
    const path = require('path');
    const os = require('os');

    const PLATFORM_PKG = {
    	'win32-x64': '@wadeck/flow-cli-win32-x64',
    	'darwin-arm64': '@wadeck/flow-cli-darwin-arm64',
    	'darwin-x64': '@wadeck/flow-cli-darwin-x64',
    	'linux-x64': '@wadeck/flow-cli-linux-x64',
    };

    const arch = os.arch() === 'arm64' ? 'arm64' : 'x64';
    const key = `${process.platform}-${arch}`;
    const pkgName = PLATFORM_PKG[key];
    if (!pkgName) {
    	process.stderr.write(`flow: unsupported platform ${key}\n`);
    	process.exit(1);
    }

    const ext = process.platform === 'win32' ? '.exe' : '';
    const launcherPath = require.resolve(`${pkgName}/flow${ext}`);
    const bundlePath = require.resolve('@wadeck/flow-cli/flow.cjs');

    execFileSync(launcherPath, process.argv.slice(2), {
    	stdio: 'inherit',
    	env: { ...process.env, LAUNCHER_BUNDLE_OVERRIDE: bundlePath },
    });
    ```

- [ ] Create `packages/task-cli-dist/` -- same structure for `@wadeck/task-cli` / `task.cjs` / `task.js`

### 4b. Platform packages (8 new directories -- binaries NOT committed, populated by CI)

For each of `flow-cli-win32-x64`, `flow-cli-darwin-arm64`, `flow-cli-darwin-x64`, `flow-cli-linux-x64`:

- [ ] Create `packages/<name>/package.json`:
    ```json
    {
    	"name": "@wadeck/flow-cli-win32-x64",
    	"version": "0.0.0",
    	"os": ["win32"],
    	"cpu": ["x64"],
    	"files": ["flow.exe"],
    	"publishConfig": { "registry": "<same URL>" }
    }
    ```
- [ ] `.gitignore` entry: `*.exe` and platform binaries (never committed)

Same 4 packages for `@wadeck/task-cli-*`.

### 4c. Root workspace update

- [ ] Add all 10 new packages to root `package.json` workspaces array
- [ ] Run `npm install` to verify workspace linking

### 4d. Manual install test (local)

- [ ] From a temp dir: `npm pack packages/flow-cli-dist && npm install -g ./wadeck-flow-cli-0.0.0.tgz`
- [ ] `flow --version` must work (using local launcher from Phase 1)
- [ ] `flow.exe` must appear in Task Manager (not `node.exe`)

---

## Phase 5 -- UpdateManager [~3h]

**Prerequisite:** Phase 4 (package names and paths finalized).

### 5a. New file: `packages/flow-cli/src/updater/UpdaterMain.ts`

Standalone entry for `flow-updater.cjs`. No flow runtime imports allowed.

```
Logic:
1. Acquire exclusive lock: open(~/.config/flow/.update.lock, O_CREAT | O_EXCL)
   If EEXIST: exit 0 (another updater already running)

2. Read update config: ~/.config/flow/config.yml
   Defaults: { channel: 'edge', checkInterval: '30m', disabled: false }
   If disabled: release lock, exit 0

3. Read cache: ~/.config/flow/.update-cache.json { checkedAt: number }
   If (Date.now() - checkedAt) < parseInterval(checkInterval): release lock, exit 0

4. execFile('npm', ['view', `@wadeck/flow-cli`, `dist-tags.${channel}`])
   On EUNAUTHORIZED or network error:
     write update-state.json { status: 'update-failed', reason: 'auth' | 'network' }
     append to ~/.config/flow/update-log.txt
     release lock, exit 0

5. latestVersion = stdout.trim()
   Validate: /^\d+\.\d+\.\d+([-+][\w.-]+)?$/.test(latestVersion)
   If invalid: write state { status: 'update-failed', reason: 'invalid-version' }, release lock, exit 1

6. Write cache: { checkedAt: Date.now() }

7. currentVersion = require('../../../package.json').version (bundled at compile time)
   If semver.lte(latestVersion, currentVersion): release lock, exit 0

8. Save to update-state.json:
   { status: 'applying', previousVersion: currentVersion, targetVersion: latestVersion, timestamp: ISO }

9. execFile('npm', ['install', '-g', `@wadeck/flow-cli@${latestVersion}`])
   (execFile with argv array -- never shell: true)

10. Health check: execFileSync(process.execPath, [bundlePath, 'cli', 'self-check'],
      { stdio: 'pipe', timeout: 10000, env: { ...process.env, FLOW_SELF_CHECK_QUIET: '1' } })
    If exit code != 0:
      execFile('npm', ['install', '-g', `@wadeck/flow-cli@${currentVersion}`])
      write state: { status: 'rolled-back', reason: 'self-check-failed', targetVersion, previousVersion }
      append error to update-log.txt
    Else:
      write state: { status: 'success', newVersion: latestVersion, previousVersion }

11. Release lock (fs.unlinkSync -- wrapped in try/catch)
```

### 5b. New file: `packages/flow-cli/src/updater/UpdateManager.ts`

```ts
export function scheduleBackgroundUpdate(bundlePath: string): void {
	const updaterPath = path.join(path.dirname(bundlePath), 'flow-updater.cjs');
	if (!fs.existsSync(updaterPath)) return; // dev mode: updater not built
	const child = spawn(process.execPath, [updaterPath], {
		detached: true,
		stdio: 'ignore',
		env: { ...process.env, LAUNCHER_BUNDLE_OVERRIDE: bundlePath },
	});
	child.unref();
}
```

### 5c. Wire into `FlowIndex.ts` and `TaskIndex.ts`

At end of `main()`, before `process.exit`:

```ts
scheduleBackgroundUpdate(process.env['LAUNCHER_BUNDLE_OVERRIDE'] ?? __filename);
```

Update notice at start of `main()`, before command routing:

```ts
const state = readAndClearUpdateState(); // reads + deletes ~/.config/flow/update-state.json
if (state?.status === 'success') process.stderr.write(`[flow] Updated to v${state.newVersion}\n`);
if (state?.status === 'rolled-back')
	process.stderr.write(
		`[flow] Update to v${state.targetVersion} failed (self-check failed). Rolled back to v${state.previousVersion}. Run: flow cli update --log\n`
	);
if (state?.status === 'update-failed')
	process.stderr.write(`[flow] Update check failed (${state.reason}). Run: flow cli update\n`);
```

---

## Phase 6 -- `flow cli` commands [~2h]

**Prerequisite:** Phase 5 (UpdateManager).

Add `cli` subcommand routing to `FlowIndex.ts` and `TaskIndex.ts` before the existing command switch:

```ts
if (command === 'cli') {
  const subcommand = rest[0];
  switch (subcommand) {
    case 'version': ...
    case 'update': ...
    case 'rollback': ...
    case 'self-check': ...
    default: throw new Error(`Unknown cli subcommand: ${subcommand}`);
  }
}
```

### `flow cli version`

- [ ] Print `flow v<currentVersion>`
- [ ] `execFile('npm', ['view', '@wadeck/flow-cli', `dist-tags.${channel}`])` -- print latest
- [ ] If up to date: `Up to date.`

### `flow cli update [--check]`

- [ ] `--check`: only show available version, do not apply
- [ ] Without flag: run UpdaterMain synchronously (bypass cache + bypass lock check, run inline)

### `flow cli rollback`

- [ ] Read `update-state.json.previousVersion`
- [ ] Validate: `/^\d+\.\d+\.\d+([-+][\w.-]+)?$/` -- throw `Invalid previousVersion` if fails
- [ ] `execFile('npm', ['install', '-g', '@wadeck/flow-cli@' + previousVersion])`
- [ ] Print: `Rolled back to v${previousVersion}`

### `flow cli self-check`

- [ ] Run all 8 checks from `self-check.md`
- [ ] Add `manifestOnly: true` option to `PluginRegistry.load()` (no plugin activation during check)
- [ ] Print `[ok]` / `[FAIL] <check-name> -- <error message>` per check
- [ ] Exit 0 if all pass, exit 1 if any fail
- [ ] Respect `FLOW_SELF_CHECK_QUIET=1` env var: suppress output (for internal use by updater)

### `flow cli update --log`

- [ ] Read and print `~/.config/flow/update-log.txt`

---

## Phase 7 -- CI pipeline [~2h]

**Prerequisite:** Phase 4 (all packages exist and publishable).

### 7a. `ci/scripts/compute-version.sh`

Adapt from `C:\Workspace_Tooling\wdrive\ci\scripts\compute-version.sh`:

- Edge (push to main): `YYYY.MM.DD-<git-rev-count>-<sha8>`, dist-tag: `edge`
- Stable (git tag `v*`): semver from tag, dist-tag: `latest`

### 7b. `.github/workflows/publish-flow-cli.yml`

Note: GitHub Actions does not support combining `paths` filter with `tags` in a single `push` trigger cleanly. Use two separate jobs within one workflow, differentiated by a condition:

```yaml
name: Publish flow-cli

on:
  push:
    branches: [main]
    paths:
      - packages/flow-cli/**
      - packages/flow-engine/**
      - packages/extension-points/**
      - packages/plugin-none/**
      - packages/plugin-worktree/**
      - packages/plugin-cli-approval/**
      - packages/shared-common/**
  push:
    tags:
      - 'v*'
```

Note: duplicate `push` key is invalid YAML. Use this pattern instead:

```yaml
on:
  push:
    branches: [main]
    paths:
      - packages/flow-cli/**
      - packages/flow-engine/**
      - packages/extension-points/**
      - packages/plugin-none/**
      - packages/plugin-worktree/**
      - packages/plugin-cli-approval/**
      - packages/shared-common/**

  push:  # second push for tags -- WORKAROUND: use workflow_dispatch for stable
```

**Correct pattern for stable releases:** Use `workflow_dispatch` (manual trigger) for stable, not a tag push. This avoids the paths+tags GitHub Actions limitation:

```yaml
on:
    push:
        branches: [main]
        paths:
            - packages/flow-cli/**
            - packages/flow-engine/**
            - packages/extension-points/**
            - packages/plugin-none/**
            - packages/plugin-worktree/**
            - packages/plugin-cli-approval/**
            - packages/shared-common/**
    workflow_dispatch:
        inputs:
            version:
                description: 'Stable version (e.g. 1.2.0)'
                required: true

jobs:
    publish:
        steps:
            - uses: actions/checkout@v4
            - uses: actions/setup-node@v4
              with: { node-version: 22 }
            - run: npm ci
            - run: npm run build --workspaces
            - run: npm run bundle:all --workspace packages/flow-cli
            - run: npm run build-launcher --workspace packages/flow-cli
            - run: bash ci/scripts/compute-version.sh
            - name: Copy binaries to platform packages
              run: |
                  cp packages/flow-cli/launcher-go/dist/flow_windows_release.exe packages/flow-cli-win32-x64/flow.exe
                  cp packages/flow-cli/launcher-go/dist/flow_darwin_arm64_release packages/flow-cli-darwin-arm64/flow
                  cp packages/flow-cli/launcher-go/dist/flow_darwin_amd64_release  packages/flow-cli-darwin-x64/flow
                  cp packages/flow-cli/launcher-go/dist/flow_linux_amd64_release   packages/flow-cli-linux-x64/flow
                  cp packages/flow-cli/dist-bundle/flow.cjs packages/flow-cli-dist/flow.cjs
            - name: Set version in all packages
              run: |
                  for pkg in flow-cli-dist flow-cli-win32-x64 flow-cli-darwin-arm64 flow-cli-darwin-x64 flow-cli-linux-x64; do
                    npm version ${{ env.VERSION }} --no-git-tag-version --workspace packages/$pkg
                  done
            - name: Publish platform packages first
              run: |
                  for pkg in flow-cli-win32-x64 flow-cli-darwin-arm64 flow-cli-darwin-x64 flow-cli-linux-x64; do
                    npm publish --workspace packages/$pkg
                  done
            - name: Publish main package
              run: npm publish --workspace packages/flow-cli-dist --tag ${{ env.DIST_TAG }}
        env:
            NODE_AUTH_TOKEN: ${{ secrets.GITLAB_NPM_TOKEN }}
```

- [ ] Create `.github/workflows/publish-task-cli.yml` -- same structure, paths include `packages/task-cli/**` (task CLI source when split from flow-cli)
- [ ] Add `GITLAB_NPM_TOKEN` to GitHub Actions secrets (same token as used in local `~/.npmrc`)

---

## Phase 8 -- Validation [~1h]

**Prerequisite:** Phase 7 complete, at least one edge release published to GitLab registry.

All steps from a shell where `agent-fleet` is NOT in PATH (no npm link active):

- [ ] `npm install -g @wadeck/flow-cli` -- no errors
- [ ] `flow --version` -- prints version
- [ ] Open Task Manager: process must show as `flow.exe`, not `node.exe`
- [ ] `flow cli self-check` -- all 8 checks `[ok]`, exits 0
- [ ] `flow run <simple-flow>` -- end-to-end execution works
- [ ] `npm install -g @wadeck/task-cli`
- [ ] `task new "test task"` -- creates task, `task.exe` in Task Manager
- [ ] Simulate update check:
    - Set `~/.config/flow/config.yml: update: checkInterval: 1s`
    - Run `flow --version` (spawns background updater)
    - Wait 3s, check `~/.config/flow/update-state.json` is written
- [ ] Simulate rollback notice:
    - Write `{ "status": "rolled-back", "targetVersion": "9.9.9", "previousVersion": "1.0.0" }` to `update-state.json`
    - Run `flow --version` -- must print rollback warning
- [ ] `flow cli rollback` -- must restore previousVersion
- [ ] From a project directory with `devDependencies: { "@wadeck/flow-cli": "*" }`:
    - `npm install && npx flow --version` -- must work without global install

---

## New files (21)

| Path                                             | Description                                         |
| ------------------------------------------------ | --------------------------------------------------- |
| `packages/flow-cli/scripts/bundle.ts`            | esbuild config for flow.cjs                         |
| `packages/flow-cli/scripts/bundle-task.ts`       | esbuild config for task.cjs                         |
| `packages/flow-cli/scripts/bundle-updater.ts`    | esbuild config for flow-updater.cjs                 |
| `packages/flow-cli/src/updater/UpdaterMain.ts`   | Background updater entry point                      |
| `packages/flow-cli/src/updater/UpdateManager.ts` | scheduleBackgroundUpdate()                          |
| `packages/flow-cli-dist/package.json`            | @wadeck/flow-cli publishable package                |
| `packages/flow-cli-dist/bin/flow.js`             | JS shim (platform detect + execFileSync)            |
| `packages/task-cli-dist/package.json`            | @wadeck/task-cli publishable package                |
| `packages/task-cli-dist/bin/task.js`             | JS shim for task                                    |
| `packages/flow-cli-win32-x64/package.json`       | Platform package (os: win32, cpu: x64)              |
| `packages/flow-cli-darwin-arm64/package.json`    | Platform package (os: darwin, cpu: arm64)           |
| `packages/flow-cli-darwin-x64/package.json`      | Platform package (os: darwin, cpu: x64)             |
| `packages/flow-cli-linux-x64/package.json`       | Platform package (os: linux, cpu: x64)              |
| `packages/task-cli-win32-x64/package.json`       | Platform package                                    |
| `packages/task-cli-darwin-arm64/package.json`    | Platform package                                    |
| `packages/task-cli-darwin-x64/package.json`      | Platform package                                    |
| `packages/task-cli-linux-x64/package.json`       | Platform package                                    |
| `.github/workflows/publish-flow-cli.yml`         | CI publish workflow                                 |
| `.github/workflows/publish-task-cli.yml`         | CI publish workflow                                 |
| `ci/scripts/compute-version.sh`                  | Version computation (adapted from wdrive)           |
| `ci/scripts/copy-binaries.sh`                    | Helper: copy launcher binaries to platform packages |

## Files to modify (6)

| Path                                                                | Change                                                                           |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `packages/flow-cli/package.json`                                    | Add bundle:\* scripts                                                            |
| `packages/flow-cli/src/cli/FlowIndex.ts`                            | Add `cli` subcommand routing + scheduleBackgroundUpdate + update notice          |
| `packages/flow-cli/src/cli/TaskIndex.ts`                            | Add `cli` subcommand routing + scheduleBackgroundUpdate                          |
| `packages/flow-cli/src/plugins/PluginRegistry.ts`                   | Add `manifestOnly: true` option to `load()`                                      |
| `package.json` (root)                                               | Add 10 new packages to workspaces array                                          |
| `C:\Workspace_Tooling\singleton-daemon-kit\go-launcher\launcher.go` | Add LAUNCHER_BUNDLE_OVERRIDE env var support (if Phase 1 confirms it is missing) |
