# Audit Report -- Security -- CLI Distribution

**Date:** 2026-08-19
**Spec version:** v0.1
**Auditor:** Claude (spec mode)

## Scope

Files reviewed:
- `_index.md`
- `guiding-principles.md`
- `architecture-overview.md`
- `threat-model.md`
- `out-of-scope.md`

Focus: subprocess spawning, version string handling, state file tampering, STRIDE coverage.

## Executive summary

The architecture-overview.md describes a detached updater that spawns subprocesses and handles untrusted strings from the npm registry and the local filesystem. Three HIGH-severity issues exist: the `node -e` inline spawn pattern is injection-fragile, and two unsanitized strings (registry version, state file previousVersion) are used to construct shell-adjacent npm install commands. The threat model is entirely stale and does not reflect any of the 6 core decisions made in the spec.

## Findings

| ID | Severity | Finding | File / Section | Recommendation |
|---|---|---|---|---|
| S-01 | HIGH | `node -e "<UpdateManager inline>"` pattern is injection-fragile. If any string literal in the inline script contains quotes or if a version string is ever interpolated into it during implementation, it becomes a code injection vector. | architecture-overview.md -- "Background updater" section | Replace with a dedicated `flow-updater.cjs` bundle: `spawn('node', [updaterPath])`. Never use `node -e` with dynamic content. |
| S-02 | HIGH | Version string from `npm view @wadeck/flow-cli dist-tags.<channel>` is used to construct `npm install -g @wadeck/flow-cli@<version>`. If the GitLab registry is compromised and a dist-tag value contains shell metacharacters, and if `execSync` with `shell: true` is used during implementation, this is RCE. | architecture-overview.md -- "Background updater" section | Validate version string against `/^\d+\.\d+\.\d+([-+][\w.-]+)?$/` before use. Use `execFile` with argv array (never `shell: true`). |
| S-03 | HIGH | `previousVersion` is read from `~/.config/flow/update-state.json` (user-writable) and used to run `npm install -g @package@<previousVersion>` during rollback. A process running as the same user could tamper the file to install a known-vulnerable version. | architecture-overview.md -- "flow cli rollback" section | Same semver validation as S-02 on rollback path. Log and refuse if validation fails. |
| S-04 | MEDIUM | `threat-model.md` is entirely stale. All STRIDE sections say "(pending)". T-01 and T-02 have status "Open" despite being resolved by decisions P-6 and P-4. Assets table references "GitHub Release hosting" -- superseded by the npm/GitLab decision. The threat model does not reflect any of the 6 core decisions. | threat-model.md | Update all STRIDE sections. Mark T-01 Mitigated (npm SHA512), T-02 Mitigated (P-4 user-local install). Add T-03 (concurrent updater race, mitigated by file lock) and T-04 (version string injection, mitigated by semver validation). Replace GitHub asset with GitLab npm registry. |
| S-05 | MEDIUM | Artifact signing was never decided. The threat model references Ed25519 signing (carried over from the wdrive/GitHub Releases pattern). The npm distribution pattern chosen here relies on npm's own SHA512 integrity check -- a valid mitigation, but never explicitly stated or accepted in the spec. This leaves T-01 ambiguous. | threat-model.md -- T-01 | Explicitly close T-01: "npm registry SHA512 integrity is the accepted mitigation for this private GitLab registry, single-user scenario. No application-level Ed25519 signing required." |
| S-06 | MEDIUM | `flow cli self-check` step 5 (Plugin system) loads plugins from disk. Plugin initialization code could have side effects if full activation runs. The spec states "no side effects outside temp dir" but does not specify manifest-only vs full activation. | architecture-overview.md -- "flow cli self-check" section | Specify that self-check step 5 uses `PluginRegistry.load({ manifestOnly: true })` -- reads manifests only, no activation. Document the `manifestOnly` flag requirement in `self-check.md`. |
| S-07 | INFO | `require.resolve('@wadeck/flow-cli-win32-x64/flow.exe')` -- no path traversal risk. Package name is hardcoded; no user-controlled input reaches the require.resolve call. | architecture-overview.md -- JS shim | No action required. Ensure platform package names are never derived from user input or env vars. |
| S-08 | INFO | GitLab auth token expiry causes silent `EUNAUTHORIZED` from `npm view`. The background updater would fail silently with no user feedback. | architecture-overview.md -- Background updater | Catch auth errors explicitly; write `{ status: "update-failed", reason: "auth" }` to update-state.json; print actionable message on next invocation: "Update check failed (auth). Check your GitLab npm token." |

## New open questions raised

- Q1: Should `flow-updater.cjs` be a completely separate esbuild entry point with no flow runtime (reduces size, limits attack surface), or is it acceptable to share the main bundle? -> Recommend separate entry. See Open Question S-01 in _index.md.
- Q2: Where does semver validation live? Shared `validation.ts` module (reused in rollback and updater) or inlined per use? -> Recommend shared module to avoid divergence.
- Q3: Does the plugin system currently support `manifestOnly: true`? If not, adding it is required before self-check can be safely implemented. -> Check `PluginRegistry.load()` signature before Phase 6.
