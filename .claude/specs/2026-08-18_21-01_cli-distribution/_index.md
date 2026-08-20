# Spec: CLI Distribution

**Created:** 2026-08-18
**Version:** v0.1
**Status:** In Progress -- v0.1 -- All questions resolved -- implementation in progress
**Iteration:** 1

## Summary

flow-cli and task-cli currently require a full monorepo checkout with `npm install` and `npm link` to run.
This spec defines how to distribute them as `npm install -g @wadeck/flow-cli` with a Go launcher binary
(flow.exe visible in Task Manager), auto-update on every invocation, and rollback on failure.
No repo checkout required after installation.

## Context (from exploration)

- Current bin files invoke `tsx` on TypeScript source -- dev-time only, not distributable.
- Dependencies include workspace siblings (`file:../`) that must be resolved at bundle time.
- No bundler, no release pipeline, no GitHub Actions in agent-fleet today.
- wdrive: esbuild -> single CJS bundle -> GitHub Release. Reference for esbuild bundling only -- its updater and distribution channel are NOT used here (npm GitLab registry chosen instead).
- violations-framework: publishes to GitLab npm registry via `npm publish` on push-to-main. Direct reference for the publish pipeline.
- singleton-daemon-kit: provides the Go launcher build infrastructure already used in flow-cli.

## Decision Log

| #    | Decision                                                                                                                                                                                                             | Status   | Date       | Rationale                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| D1   | Audience: personal use today (Wadeck only), colleagues + potentially public later                                                                                                                                    | Resolved | 2026-08-18 | Drives choice of private registry now, public-ready architecture later                               |
| D2   | Core pain: mandatory repo checkout to install -- remove this dependency                                                                                                                                              | Resolved | 2026-08-18 | npm publish lets users install without cloning agent-fleet                                           |
| 1    | Node.js required on target machine; never embedded in binary                                                                                                                                                         | Resolved | 2026-08-18 | Keeps binaries lightweight (<5 MB); same constraint as Claude CLI                                    |
| 2    | Distribution channel: npm publish to GitLab registry (@wadeck scope)                                                                                                                                                 | Resolved | 2026-08-18 | Same pattern as violations-framework, already proven, no new infrastructure                          |
| 3    | Install UX: exe-in-npm (Go launcher in @wadeck/flow-cli-<platform> optionalDeps)                                                                                                                                     | Resolved | 2026-08-18 | flow.exe / task.exe visible in Task Manager, not node.exe                                            |
| 4    | Auto-update: detached post-execution, 30min cache, self-check health, auto-rollback, `flow cli` namespace                                                                                                            | Resolved | 2026-08-18 | No library needed (npm view + semver + cache file); `flow cli update/rollback/self-check/version`    |
| 5    | Two separate packages: @wadeck/flow-cli and @wadeck/task-cli                                                                                                                                                         | Resolved | 2026-08-18 | task does not import FlowEngine; independent versioning required                                     |
| 6    | Release trigger: path-filtered CI per package; channel (edge/stable) user-configurable                                                                                                                               | Resolved | 2026-08-19 | Only publish when flow-cli or task-cli source changed; users can pin to edge or stable channel       |
| A-01 | File lock: open ~/.config/flow/.update.lock with O_CREAT OR_EXCL. If EEXIST: exit 0. Release in finally block. Lock includes PID; on acquire verify PID still alive to handle stale locks.                           | Resolved | 2026-08-19 | Prevents concurrent updater race corrupting node_modules                                             |
| A-02 | JS shim sets LAUNCHER_BUNDLE_OVERRIDE=<abs path to flow.cjs> env var before execFileSync(launcher). Launcher reads env var and overrides cfg.NodeScript. SDK contribution required (Phase 1 of plan).                | Resolved | 2026-08-19 | flow.exe and flow.cjs live in different npm packages -- relative path in launcher.config.json breaks |
| S-01 | flow-updater.cjs is a separate esbuild entry point (dist/updater/UpdaterMain.js). No flow runtime imports. Spawned as detached node process + child.unref().                                                         | Resolved | 2026-08-19 | Dedicated bundle keeps updater minimal; avoids node -e injection risk                                |
| S-02 | Version string from npm view validated: /^\d+\.\d+\.\d+([-+][\w.-]+)?$/ before use in npm install command. execFile with argv array -- never shell: true.                                                            | Resolved | 2026-08-19 | Prevents injection if registry response is compromised                                               |
| S-03 | previousVersion from update-state.json same semver validation before rollback. Log and refuse if invalid.                                                                                                            | Resolved | 2026-08-19 | update-state.json is user-writable; prevents tampered rollback target                                |
| A-05 | Full CI path filter: packages/flow-cli/**, packages/flow-engine/**, packages/extension-points/**, packages/plugin-none/**, packages/plugin-worktree/**, packages/plugin-cli-approval/**, packages/shared-common/\*\* | Resolved | 2026-08-19 | Missing deps would silently skip rebuilds when shared code changes                                   |
| C-05 | Breaking changes: CHANGELOG.md entry required + publish with --tag breaking-edge for 48h before promoting to edge. Stable channel users unaffected until next stable release.                                        | Resolved | 2026-08-19 | Gives edge users 48h warning before breaking change lands                                            |
| C-06 | Node.js not on PATH: Go launcher exits with message: "flow requires Node.js >= 22. Install from https://nodejs.org and ensure 'node' is on your PATH."                                                               | Resolved | 2026-08-19 | Clear error prevents silent failure                                                                  |
| C-07 | Linux in scope: linux/amd64 added as 4th platform for containerized agents. Platform package: @wadeck/flow-cli-linux-x64. Linux/arm64 out of scope.                                                                  | Resolved | 2026-08-19 | Agents in Docker containers typically run linux/amd64                                                |

## Open Questions

| #    | Question                                                                                        | Priority | Status   |
| ---- | ----------------------------------------------------------------------------------------------- | -------- | -------- |
| D1   | Who are the users today and tomorrow?                                                           | Critical | Resolved |
| 1    | Node.js requirement: bundle+node vs fully self-contained binary                                 | Critical | Resolved |
| 2    | Distribution channel: GitHub Releases vs private registry vs other                              | High     | Resolved |
| 3    | Install UX: exe-in-npm pattern (Go launcher via optionalDependencies)                           | High     | Resolved |
| 4    | Auto-update: background post-execution, 30min cache, self-check, rollback, `flow cli` namespace | Medium   | Resolved |
| 5    | Bundle strategy: two separate packages @wadeck/flow-cli and @wadeck/task-cli                    | Medium   | Resolved |
| 6    | Release trigger: path-filtered CI (only when flow-cli/task-cli source changes) + channel config | Low      | Resolved |
| A-01 | Concurrent updater race: exclusive file lock with PID check                                     | Critical | Resolved |
| A-02 | Go launcher + flow.cjs cross-package path: LAUNCHER_BUNDLE_OVERRIDE env var                     | Critical | Resolved |
| S-01 | Dedicated flow-updater.cjs separate esbuild entry                                               | High     | Resolved |
| S-02 | Semver validation of version string before npm install                                          | High     | Resolved |
| S-03 | Semver validation of previousVersion before rollback                                            | High     | Resolved |
| A-05 | Full CI path filter including all shared workspace deps                                         | High     | Resolved |
| C-05 | Breaking-change policy: breaking-edge dist-tag 48h buffer                                       | High     | Resolved |
| C-06 | Node.js not on PATH error message                                                               | Medium   | Resolved |
| C-07 | Linux/amd64 in scope; Linux/arm64 out of scope                                                  | Medium   | Resolved |

## Modules / Sub-files

| File                                       | Contents                                                       |
| ------------------------------------------ | -------------------------------------------------------------- |
| `guiding-principles.md`                    | Core principles driving all decisions                          |
| `out-of-scope.md`                          | Explicitly excluded items with rationale                       |
| `threat-model.md`                          | STRIDE analysis, mitigations (all resolved)                    |
| `architecture-overview.md`                 | End-to-end design: packages, runtime chain, update flow, CI    |
| `self-check.md`                            | 8 health checks for flow cli self-check command                |
| `ci-pipeline.md`                           | GitHub Actions workflows, compute-version.sh, copy-binaries.sh |
| `audits/2026-08-19_security/report.md`     | Security audit: 3 HIGH, 3 MEDIUM, 2 INFO                       |
| `audits/2026-08-19_completeness/report.md` | Completeness audit: 5 HIGH, 5 MEDIUM, 4 INFO                   |
| `audits/2026-08-19_consistency/report.md`  | Consistency audit: 6 HIGH, 4 MEDIUM, 2 INFO                    |
| `audits/2026-08-19_architecture/report.md` | Architecture audit: 2 CRITICAL, 5 HIGH, 4 MEDIUM, 2 INFO       |

## Changelog

| Version | Date       | Summary                                                                                                 |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| v0.1    | 2026-08-18 | Initial spec created                                                                                    |
| v0.1    | 2026-08-19 | All open questions resolved post-audit; self-check.md, ci-pipeline.md, threat-model, out-of-scope added |
