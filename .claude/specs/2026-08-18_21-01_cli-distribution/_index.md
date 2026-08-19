# Spec: CLI Distribution

**Created:** 2026-08-18
**Version:** v0.1
**Status:** In Progress -- v0.1 -- 6/6 core decisions resolved -- 9 open issues from audit (2 critical blockers)
**Iteration:** 1

## Summary

flow-cli and task-cli currently require a full monorepo checkout with `npm install` and `npm link` to run.
This spec defines how to distribute them as standalone, installable binaries that work without a local source tree.
The wdrive project already solves a similar problem (esbuild bundle + GitHub Releases + self-updater) and serves as a reference implementation.

## Context (from exploration)

- Current bin files invoke `tsx` on TypeScript source -- dev-time only, not distributable.
- Dependencies include workspace siblings (`file:../`) that must be resolved at bundle time.
- No bundler, no release pipeline, no GitHub Actions in agent-fleet today.
- wdrive: esbuild -> single CJS bundle -> GitHub Release. Reference for esbuild bundling only -- its updater and distribution channel are NOT used here (npm GitLab registry chosen instead).

## Decision Log

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| D1 | Audience: personal use today (Wadeck only), colleagues + potentially public later | Resolved | 2026-08-18 | Drives choice of private registry now, public-ready architecture later |
| D2 | Core pain: mandatory repo checkout to install -- remove this dependency | Resolved | 2026-08-18 | npm publish lets users install without cloning agent-fleet |
| 1 | Node.js required on target machine; never embedded in binary | Resolved | 2026-08-18 | Keeps binaries lightweight (<5 MB); same constraint as Claude CLI |
| 2 | Distribution channel: npm publish to GitLab registry (@wadeck scope) | Resolved | 2026-08-18 | Same pattern as violations-framework, already proven, no new infrastructure |
| 3 | Install UX: exe-in-npm (Go launcher in @wadeck/flow-cli-<platform> optionalDeps) | Resolved | 2026-08-18 | flow.exe / task.exe visible in Task Manager, not node.exe |
| 4 | Auto-update: detached post-execution, 30min cache, self-check health, auto-rollback, `flow cli` namespace | Resolved | 2026-08-18 | No library needed (npm view + semver + cache file); `flow cli update/rollback/self-check/version` |
| 5 | Two separate packages: @wadeck/flow-cli and @wadeck/task-cli | Resolved | 2026-08-18 | task does not import FlowEngine; independent versioning required |
| 6 | Release trigger: path-filtered CI per package; channel (edge/stable) user-configurable | Resolved | 2026-08-19 | Only publish when flow-cli or task-cli source changed; users can pin to edge or stable channel |

## Open Questions

| # | Question | Priority | Status |
|---|---|---|---|
| D1 | Who are the users today and tomorrow? | Critical | Resolved |
| 1 | Node.js requirement: bundle+node vs fully self-contained binary | Critical | Resolved |
| 2 | Distribution channel: GitHub Releases vs private registry vs other | High | Resolved |
| 3 | Install UX: exe-in-npm pattern (Go launcher via optionalDependencies) | High | Resolved |
| 4 | Auto-update: background post-execution, 30min cache, self-check, rollback, `flow cli` namespace | Medium | Resolved |
| 5 | Bundle strategy: two separate packages @wadeck/flow-cli and @wadeck/task-cli | Medium | Resolved |
| 6 | Release trigger: path-filtered CI (only when flow-cli/task-cli source changes) + channel config | Low | Resolved |
| A-01 | Concurrent updater race: file lock strategy for background updater | Critical | Open |
| A-02 | Go launcher + flow.cjs cross-package path resolution | Critical | Open |
| S-01 | Replace `node -e` inline script with dedicated `flow-updater.cjs` bundle | High | Open |
| S-02 | Semver validation of version string before `npm install -g` | High | Open |
| S-03 | Semver validation of previousVersion before rollback | High | Open |
| A-05 | CI path filter: add missing workspace deps (extension-points, plugin-*, shared-common) | High | Open |
| C-05 | Semver / breaking-change policy for edge releases | High | Open |
| C-06 | Node.js not on PATH: Go launcher error message spec | Medium | Open |
| C-07 | Linux support: explicitly in or out of scope | Medium | Open |

## Modules / Sub-files

| File | Contents |
|---|---|
| `guiding-principles.md` | Core principles driving all decisions |
| `out-of-scope.md` | Explicitly excluded items |
| `threat-model.md` | Security threats and mitigations |

## Changelog

| Version | Date | Summary |
|---|---|---|
| v0.1 | 2026-08-18 | Initial spec created |
