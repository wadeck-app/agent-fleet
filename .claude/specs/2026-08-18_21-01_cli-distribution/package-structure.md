# Package Structure -- CLI Distribution

**Version:** v0.1
**Last updated:** 2026-08-19
**Status:** Draft

## Overview

10 npm packages published to GitLab registry (project 84445653, `@wadeck` scope).
2 main packages (one per CLI) + 4 platform packages each.
Platform packages contain only the Go launcher binary.
Main packages contain the JS shim + esbuild bundle + optionalDependencies on all 4 platform packages.

**Registry URL:** `https://gitlab.com/api/v4/projects/84445653/packages/npm/`
**Registry reference:** same project as `@wadeck/violations-cli` and `@wadeck/violations-rules`.

---

## @wadeck/flow-cli (main package)

**Location:** `packages/flow-cli-dist/`

```json
{
  "name": "@wadeck/flow-cli",
  "version": "0.0.0",
  "private": false,
  "type": "commonjs",
  "bin": { "flow": "./bin/flow.js" },
  "files": ["bin/", "flow.cjs", "flow-updater.cjs", "package.json"],
  "optionalDependencies": {
    "@wadeck/flow-cli-win32-x64":    "*",
    "@wadeck/flow-cli-darwin-arm64": "*",
    "@wadeck/flow-cli-darwin-x64":   "*",
    "@wadeck/flow-cli-linux-x64":    "*"
  },
  "dependencies": {
    "semver": "^7.0.0"
  },
  "publishConfig": {
    "@wadeck:registry": "https://gitlab.com/api/v4/projects/84445653/packages/npm/"
  }
}
```

**Files included at publish time:**
- `bin/flow.js` -- JS shim (hand-written, committed to repo)
- `flow.cjs` -- esbuild bundle (copied from `packages/flow-cli/dist-bundle/flow.cjs` by CI)
- `flow-updater.cjs` -- separate updater bundle (copied from `packages/flow-cli/dist-bundle/flow-updater.cjs` by CI)

**bin/flow.js -- JS shim:**
```js
#!/usr/bin/env node
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const os = require('os');

const PLATFORM_PKG = {
  'win32-x64':    '@wadeck/flow-cli-win32-x64',
  'darwin-arm64': '@wadeck/flow-cli-darwin-arm64',
  'darwin-x64':   '@wadeck/flow-cli-darwin-x64',
  'linux-x64':    '@wadeck/flow-cli-linux-x64',
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
const bundlePath   = require.resolve('@wadeck/flow-cli/flow.cjs');

execFileSync(launcherPath, process.argv.slice(2), {
  stdio: 'inherit',
  env: { ...process.env, LAUNCHER_BUNDLE_OVERRIDE: bundlePath },
});
```

Note: `LAUNCHER_BUNDLE_OVERRIDE` overrides `cfg.NodeScript` in the Go launcher (singleton-daemon-kit v1.0.1+).

---

## @wadeck/flow-cli-win32-x64

**Location:** `packages/flow-cli-win32-x64/`

```json
{
  "name": "@wadeck/flow-cli-win32-x64",
  "version": "0.0.0",
  "os": ["win32"],
  "cpu": ["x64"],
  "files": ["flow.exe"],
  "publishConfig": {
    "@wadeck:registry": "https://gitlab.com/api/v4/projects/84445653/packages/npm/"
  }
}
```

- `flow.exe` is NOT committed to git. CI copies from `packages/flow-cli/launcher-go/dist/flow_windows_release.exe`.
- `.gitignore`: `*.exe` and all platform binaries.

---

## @wadeck/flow-cli-darwin-arm64

```json
{
  "name": "@wadeck/flow-cli-darwin-arm64",
  "version": "0.0.0",
  "os": ["darwin"],
  "cpu": ["arm64"],
  "files": ["flow"],
  "publishConfig": { "@wadeck:registry": "https://gitlab.com/api/v4/projects/84445653/packages/npm/" }
}
```

Binary: `flow` (no extension, chmod +x in CI). Source: `launcher-go/dist/flow_darwin_arm64_release`.

---

## @wadeck/flow-cli-darwin-x64

```json
{
  "name": "@wadeck/flow-cli-darwin-x64",
  "version": "0.0.0",
  "os": ["darwin"],
  "cpu": ["x64"],
  "files": ["flow"],
  "publishConfig": { "@wadeck:registry": "https://gitlab.com/api/v4/projects/84445653/packages/npm/" }
}
```

Binary: `flow`. Source: `launcher-go/dist/flow_darwin_amd64_release`.

---

## @wadeck/flow-cli-linux-x64

```json
{
  "name": "@wadeck/flow-cli-linux-x64",
  "version": "0.0.0",
  "os": ["linux"],
  "cpu": ["x64"],
  "files": ["flow"],
  "publishConfig": { "@wadeck:registry": "https://gitlab.com/api/v4/projects/84445653/packages/npm/" }
}
```

Binary: `flow`. Source: `launcher-go/dist/flow_linux_amd64_release`.

---

## @wadeck/task-cli (main package)

**Location:** `packages/task-cli-dist/`

Identical structure to `@wadeck/flow-cli` with:
- `bin: { "task": "./bin/task.js" }`
- `files: ["bin/", "task.cjs", "task-updater.cjs", "package.json"]`
- `optionalDependencies`: `@wadeck/task-cli-win32-x64` etc.
- `bin/task.js` shim: same pattern, uses `@wadeck/task-cli-*` platform packages and `task.cjs`

---

## @wadeck/task-cli-win32-x64, darwin-arm64, darwin-x64, linux-x64

Same structure as flow platform packages with `task.exe` / `task` binary names.
Source binaries: `launcher-go/dist/task_windows_release.exe` etc.

Note: task-cli currently shares the same launcher build from `packages/flow-cli`. The launcher config
will need a separate `launcher.config.json` for task (appName: task, nodeScript: task.cjs).

---

## Version synchronization

All 5 flow packages (main + 4 platform) are versioned together (same version string set by CI).
All 5 task packages are versioned together independently of flow.
Flow and task versions are NOT synchronized -- they can diverge.

Publish order (enforced by CI):
1. Platform packages first (all 4)
2. Main package last

Reason: npm resolves `optionalDependencies` at install time. If the platform package does not exist
yet when the main package is published, users installing immediately after publish may get a partial install.

---

## Security considerations

- Platform packages contain only the binary (`files` field is restrictive).
- Main package does not contain source maps or TypeScript sources.
- `semver` is the only runtime dependency (already in transitive node_modules; listed for explicit version pinning).
- Registry token required to install from GitLab (`~/.npmrc: @wadeck:registry=...` + `_authToken`).
