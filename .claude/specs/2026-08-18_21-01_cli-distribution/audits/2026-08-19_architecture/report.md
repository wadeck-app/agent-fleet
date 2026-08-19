# Audit Report -- Architecture + Breaking Changes -- CLI Distribution

**Date:** 2026-08-19
**Spec version:** v0.1
**Auditor:** Claude (spec mode)

## Scope

Files examined: _index.md, guiding-principles.md, architecture-overview.md, threat-model.md, out-of-scope.md
Code examined: packages/flow-cli/package.json, FlowIndex.ts (L1-24), TaskIndex.ts (L1-24)

## Executive summary

The spec has solid high-level decisions but several critical gaps that would block a correct implementation. The most serious are: (1) concurrent updater race condition not addressed, (2) Go launcher cannot locate flow.cjs across npm package boundaries, (3) no semver/breaking-change strategy, (4) CI path filter misses 5 workspace deps, (5) Linux not scoped.

## Findings

| ID | Severity | Finding | File / Section | Recommendation |
|---|---|---|---|---|
| A-01 | CRITICAL | Concurrent updater race: two parallel `flow` invocations each spawn a detached updater; both may run `npm install -g` simultaneously, corrupting node_modules | architecture-overview.md / Runtime chain | Add file lock (~/.config/flow/update.lock) before npm install; second updater exits if lock held |
| A-02 | CRITICAL | Go launcher cannot find flow.cjs via npm: flow.exe is in @wadeck/flow-cli-win32-x64/ but flow.cjs is in @wadeck/flow-cli/ -- different directories; launcher.config.json relative paths break | architecture-overview.md / Package structure | Either co-locate cjs with binary in platform package, or use absolute path resolution; requires SDK config support |
| A-03 | HIGH | No semver strategy for stable releases: spec uses datetime-based edge versions but never defines semver policy for stable; no major/minor/patch rules | _index.md / Decision Log | Add decision: stable = semver; major bump = breaking CLI change |
| A-04 | HIGH | No breaking-change detection mechanism: removed flags or changed JSON output silently breaks agents; no commit convention, no output schema version | architecture-overview.md | Add BREAKING CHANGE commit convention + schema version field in --json output |
| A-05 | HIGH | CI path filter incomplete: flow-cli depends on extension-points, plugin-none, plugin-worktree, plugin-cli-approval, shared-common (all file:../ deps) -- none in path filter | architecture-overview.md / Release CI | Add all 5 workspace deps to paths filter |
| A-06 | HIGH | Linux not scoped: only win32-x64 and darwin-* defined; agents in Docker (Linux) cannot install; not in out-of-scope.md either | architecture-overview.md | Explicitly scope in or out; add to out-of-scope.md if out |
| A-07 | HIGH | P-6 signed releases vs npm integrity: P-6 requires Ed25519 signing but npm uses SHA512; spec never describes how Ed25519 verification works for npm distribution (unlike wdrive GitHub Releases) | guiding-principles.md P-6 | Clarify whether npm SHA512 is sufficient or Ed25519 is still required; if still required, define where public key lives |
| A-08 | MEDIUM | Migration from current package not specified: flow-cli is private:true with both flow+task in one bin; spec never describes how to split and publish as two separate packages | _index.md | Add migration steps: rename, remove private, split task, update workspace refs |
| A-09 | MEDIUM | Self-check item 5 (plugin system) may fail on machines without plugins installed if it reads the user runtime config | architecture-overview.md / self-check | Use hardcoded minimal test config (built-in plugins only), not user runtime config |
| A-10 | MEDIUM | Node.js not on PATH error message not defined; SDK may produce cryptic output | guiding-principles.md | Require: error must say "flow requires Node.js >= X. Install from nodejs.org." |
| A-11 | MEDIUM | npmrc onboarding gap: no procedure documented for new users to obtain GitLab token and configure ~/.npmrc | architecture-overview.md / Install | Add onboarding section or a flow cli setup-registry command |
| A-12 | INFO | Double node startup: node(shim) -> flow.exe -> node(flow.cjs) = 3 processes vs current 2; adds ~50-100ms on Windows; no performance budget defined | architecture-overview.md | Document overhead or optimize shim to shell script |
| A-13 | INFO | P-8 appears after P-9 in guiding-principles.md (numbering out of order) | guiding-principles.md | Reorder sequentially |

## New open questions raised

1. (CRITICAL) How does Go launcher find flow.cjs when installed via npm across package boundaries? (A-02)
2. (HIGH) Is Linux/arm64 in scope for v1? (A-06)
3. (HIGH) Is npm SHA512 integrity sufficient, or is Ed25519 still required? (A-07)
4. (HIGH) What is the semver policy for stable releases and breaking-change signaling? (A-03, A-04)
5. (MEDIUM) Concrete migration path from private single-package to two published packages? (A-08)
