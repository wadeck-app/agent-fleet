# Threat Model -- CLI Distribution

**Version:** 1.1
**Date:** 2026-08-19
**Methodology:** STRIDE

## Scope

Distribution pipeline for `flow-cli` and `task-cli`: npm package publishing to GitLab registry,
Go launcher binaries in platform packages, JS shim in main packages, background auto-updater,
and `flow cli self-check` health validation. Covers the path from source to a running binary on
the user's machine, including the auto-update cycle.

## Assets

What we are protecting:

| Asset | Sensitivity | Owner |
|---|---|---|
| GitLab npm registry (@wadeck scope) | High -- tampered package = RCE on install | Wadeck |
| GitLab npm auth token (~/.npmrc) | High -- compromise allows publishing malicious packages | Wadeck |
| Go launcher binaries (flow.exe etc.) | High -- executed directly by user | Wadeck (published by CI) |
| flow.cjs / task.cjs (esbuild bundles) | High -- runs with full user privileges | Wadeck (published by CI) |
| update-state.json (~/.config/flow/) | Medium -- tamper can trigger rollback to old version | User machine |
| .update.lock (~/.config/flow/) | Low -- denial-of-update if left stale | User machine |

## Threat actors

| Actor | Motivation | Capability |
|---|---|---|
| Supply-chain attacker | Inject malicious code via compromised registry or CI | Medium (requires GitLab account compromise or CI secret leak) |
| Local process (same user) | Tamper update-state.json to trigger bad rollback | Low (same-user process, no privilege escalation) |
| Network MITM | Serve tampered package download | Low -- HTTPS to GitLab mitigates; private registry limits exposure |

## STRIDE analysis

### Spoofing
- The `@wadeck` npm scope is private and requires auth token to publish. Unauthenticated actors cannot publish packages under this scope.
- The CI `NODE_AUTH_TOKEN` secret is the only publish credential. Compromise of this token would allow spoofed packages.
- **Mitigation:** Token is stored only in GitHub Actions secrets; not committed to repo; scoped to publish steps only.

### Tampering
- T-01: A tampered package in the registry would be executed on `npm install -g` or auto-update.
  **Mitigated:** npm verifies SHA512 integrity of every package on install. Private GitLab registry limits who can publish. No additional application-level signing required for single-user private use.
- T-04: Version string from `npm view` registry query used to construct `npm install -g @pkg@<version>`. A compromised registry could return a malicious version string.
  **Mitigated:** Version string validated against `/^\d+\.\d+\.\d+([-+][\w.-]+)?$/` before use. `execFile` with argv array (never `shell: true`) prevents shell injection.
- T-04b: `previousVersion` from `update-state.json` (user-writable file) used in rollback command.
  **Mitigated:** Same semver validation applied to `previousVersion` before use. Invalid value: log and refuse.

### Repudiation
- CI publish steps log to GitHub Actions run history. Registry stores publish metadata (timestamp, publisher).
- No additional audit logging required for single-user scenario.

### Information Disclosure
- `update-state.json` contains version strings and error messages. No credentials or secrets.
- `update-log.txt` contains npm stderr output. May contain package paths but no credentials.
- GitLab npm auth token in `~/.npmrc` is readable by all processes running as the same user -- this is standard npm behavior and acceptable for single-user machines.

### Denial of Service
- T-03: Two parallel `flow` invocations both spawn detached updaters. Both run `npm install -g` simultaneously, potentially corrupting `node_modules`.
  **Mitigated:** Exclusive file lock at `~/.config/flow/.update.lock` (O_CREAT|O_EXCL). Second updater detects lock exists and exits immediately without touching npm.
- Stale lock file (updater crashed without cleanup): lock is released in a `finally` block. If process is killed before finally, the stale lock prevents future updates. Mitigation: lock file includes PID; on acquire, check if PID is still alive; if not, remove stale lock.

### Elevation of Privilege
- T-02: Install to system paths (e.g. `/usr/local/bin`) requires sudo.
  **Mitigated:** P-4 (guiding-principles.md): default install to user-local PATH (`~/.local/bin` or `%USERPROFILE%\.local\bin`). `npm install -g` with a user-local npm prefix never requires sudo.

## Mitigations

| ID | Threat category | Threat description | Mitigation | Status | Decision # |
|---|---|---|---|---|---|
| T-01 | Tampering | Tampered package in GitLab npm registry executed on install | npm SHA512 integrity check; private registry limits publish access | Mitigated | D-2, P-6 |
| T-02 | Elevation of Privilege | Install requires root/admin | User-local npm prefix by default (P-4) | Mitigated | P-4 |
| T-03 | Denial of Service | Concurrent updaters corrupt node_modules | Exclusive file lock at ~/.config/flow/.update.lock with PID check | Mitigated | A-01 |
| T-04 | Tampering | Version string from registry injected into npm command | Semver regex validation + execFile argv array (no shell) | Mitigated | S-02, S-03 |
| T-05 | Tampering | update-state.json previousVersion tampered for malicious rollback | Semver validation on previousVersion before rollback | Mitigated | S-03 |

## Open security questions

None -- all identified threats are mitigated or accepted.
