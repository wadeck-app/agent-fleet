# Architecture Overview -- CLI Distribution

**Version:** v0.2
**Last updated:** 2026-08-19
**Status:** Decisions resolved -- ready for implementation plan

## Decisions summary

| # | Decision |
|---|---|
| D1 | Audience: personal today, public-capable later |
| D2 | Core pain: mandatory repo checkout -- eliminate it |
| 1 | Node.js required on machine, never embedded |
| 2 | GitLab npm registry (@wadeck scope) |
| 3 | exe-in-npm: Go launcher in platform optionalDeps |
| 4 | Auto-update: detached post-execution, 30min cache, `flow cli` namespace |
| 5 | Two separate packages: @wadeck/flow-cli and @wadeck/task-cli |
| 6 | Path-filtered CI; edge on relevant commit, stable on tag; channel user-configurable |
| P-9 | Migration order: flow+task first, then violations-cli, then wdrive |

---

## Package structure

```
@wadeck/flow-cli
  package.json
    bin: { flow: "./bin/flow.js" }
    optionalDependencies:
      @wadeck/flow-cli-win32-x64:  "*"
      @wadeck/flow-cli-darwin-arm64: "*"
      @wadeck/flow-cli-darwin-x64:  "*"
  bin/flow.js          <-- JS shim (update of existing bin/flow.js)
  flow.cjs             <-- esbuild bundle (~2 MB)
  package.json

@wadeck/flow-cli-win32-x64
  package.json  { os: [win32], cpu: [x64] }
  flow.exe      <-- Go launcher (~2 MB)

@wadeck/flow-cli-darwin-arm64
  package.json  { os: [darwin], cpu: [arm64] }
  flow          <-- Go launcher (~2 MB)

@wadeck/flow-cli-darwin-x64
  package.json  { os: [darwin], cpu: [x64] }
  flow          <-- Go launcher (~2 MB)

(same structure for @wadeck/task-cli and platform packages)
```

---

## Build pipeline (per CLI)

```
packages/flow-cli/src/ (TypeScript)
  |
  tsc -> dist/
  |
  esbuild bundle -> flow.cjs (all workspace siblings inlined, no node_modules at runtime)
  |
  SDK build.sh -> launcher-go/dist/
    flow_windows_release.exe
    flow_darwin_arm64_release
    flow_darwin_amd64_release
  |
  CI: npm publish (path-filtered: only when flow-cli source changed)
    @wadeck/flow-cli          --tag edge|latest
    @wadeck/flow-cli-win32-x64
    @wadeck/flow-cli-darwin-arm64
    @wadeck/flow-cli-darwin-x64
```

---

## Install (user)

```bash
# One-time ~/.npmrc setup (already done for @wadeck/singleton-daemon-kit):
# @wadeck:registry=https://gitlab.com/api/v4/projects/.../packages/npm/
# //gitlab.com/...:_authToken=<token>

npm install -g @wadeck/flow-cli   # installs main + matching platform package
npm install -g @wadeck/task-cli   # separate

# devDependency (version-pinned, no global install needed):
# package.json: "devDependencies": { "@wadeck/flow-cli": "^1.2.0" }
# npx flow run my-flow.yml
```

---

## Runtime chain

```
flow run my-flow.yml
  |
  node bin/flow.js          (shim: detects platform, execFileSync)
  |
  flow.exe                  (Go launcher: finds node on PATH, runs flow.cjs)
  |                         (visible in Task Manager as flow.exe, not node.exe)
  node flow.cjs             (all business logic, workspace deps inlined by esbuild)
  |
  [execution completes]
  |
  spawn detached: node -e "<UpdateManager inline>" + child.unref()
  |
  flow.exe exits            (user gets prompt back)

Background (detached):
  npm view @wadeck/flow-cli dist-tags.<channel>  (cached, 30min)
  if newer: npm install -g @wadeck/flow-cli@<latest>
  health check: flow cli self-check
  if ok: write update-state.json { status: success }
  if fail: npm install -g @wadeck/flow-cli@<previous>  (rollback)
           write update-state.json { status: rolled-back }
```

---

## `flow cli` commands

| Command | Action |
|---|---|
| `flow cli version` | Show installed version + latest available in configured channel |
| `flow cli update` | Force synchronous update (bypasses 30min cache) |
| `flow cli rollback` | Restore previousVersion from update-state.json |
| `flow cli self-check` | Run all health checks (bundle, config, YAML, StepRunner, plugins, TaskStore, hooks, workspace config) |
| `flow cli update --check` | Show available version without applying |

Channel config: `~/.config/flow/config.yml`
```yaml
update:
  channel: edge        # edge | stable (default: edge)
  checkInterval: 30m   # duration (default: 30m)
  disabled: false
```

---

## Release CI (GitHub Actions, path-filtered)

```yaml
on:
  push:
    branches: [main]
    paths:
      - packages/flow-cli/**
      - packages/flow-engine/**  # key dep
  tags:
    - 'v*'

# Steps:
# 1. npm ci
# 2. tsc build
# 3. esbuild bundle
# 4. Go launcher build (3 platforms via SDK)
# 5. compute-version.sh (datetime-SHA for edge, semver tag for stable)
# 6. npm publish @wadeck/flow-cli + platform packages
#    edge: --tag edge   stable: --tag latest
```

---

## `flow cli self-check` test suite

No real API calls, no side effects outside temp dir. Target: < 500ms.

1. Bundle integrity -- core modules load without crash
2. Config loading -- parse ~/.flow-config.yaml + .flows/config.yml (read-only)
3. YAML flow parsing -- parse minimal in-memory flow definition
4. StepRunner init -- instantiate with mock executor, verify wiring
5. Plugin system -- load registered plugins, verify resolver chain
6. TaskStore -- create/read/delete in OS temp dir
7. HookDispatcher -- instantiate with empty config, verify dispatch no-ops
8. Workspace config -- read retainDays/maxWorkspaces, verify schema

---

## Migration order (P-9)

1. flow-cli + task-cli (this spec)
2. violations-cli (simpler: npm already works, add exe-in-npm if desired)
3. wdrive (most complex: daemon lifecycle, tray binary, updater redesign -- see wdrive plan)
