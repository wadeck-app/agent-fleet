# Threat Model -- CLI Status and Next Steps

**Version:** 1.0
**Date:** 2026-08-22
**Methodology:** STRIDE

## Scope

Distribution pipeline for CLI tools (@wadeck/flow-cli, @wadeck/task-cli, @wadeck/violations-cli, future @wadeck/wdrive) via GitLab npm registry. Auto-update mechanism. Config directory layout on user machines. shared-cli package as a shared dependency.

## Assets

What we are protecting:

| Asset                                   | Sensitivity                                                | Owner           |
| --------------------------------------- | ---------------------------------------------------------- | --------------- |
| GitLab npm WRITE token                  | Critical -- can publish malicious packages                 | CI secrets only |
| Published npm packages                  | High -- installed globally on user machines                | GitLab registry |
| User config dirs (~/.config/flow, etc.) | Medium -- contain update state, auth tokens in future      | User machine    |
| Auto-update pipeline                    | High -- can silently replace running CLI binaries          | CI + npm        |
| `~/.npmrc` READ token                   | Medium -- allows read access to private `@wadeck` packages | User machine    |

## Threat actors

| Actor                 | Motivation                                   | Capability                               |
| --------------------- | -------------------------------------------- | ---------------------------------------- |
| External attacker     | Compromise machines via malicious CLI update | Low-medium (needs registry write access) |
| Supply chain attacker | Inject malicious code via shared-cli or SDK  | Medium (targets npm dependencies)        |
| Rogue CI job          | Publish unauthorized version                 | Low (token scoped to project)            |

## STRIDE analysis

### Spoofing

Auto-update fetches latest version tag from npm registry. If the registry is compromised or the token is leaked, a malicious version could be published and auto-installed.
Mitigation T-01: Write token is CI-only (never in .npmrc committed to repo). Read token is separate from write token.

> **Note (FP-4 / SEC-R3-04):** Local binary replacement (overwriting installed npm binaries): requires write access to the global npm prefix, implying full system compromise. Out of scope for this spec.

Post-install binary integrity check is not implemented. Trust model: GitLab npm registry HTTPS transport + CI-only WRITE token is the trust boundary. Same design as flow-cli/task-cli.

### Tampering

A `migrateIfNeeded()` call moves files from legacy paths to `~/.config/<appName>`. If a malicious process has written to `%APPDATA%\flow` before migration, those files would be moved to the new config dir.
Mitigation T-02: Migration only runs once (exits early if `~/.config/<appName>` already exists). Config files are YAML/JSON, not executable.

`launcher.config.json` (future T8 field `UpdateCmd`) is writable by any same-user process. If an attacker writes a malicious `UpdateCmd`, it executes on the next update trigger.
Mitigation T-07: `UpdateCmd` must be validated against a whitelist or restricted to npm commands only before T8 is implemented. Scope: wdrive T8 only.

VbsLauncher.write() constructs a VBScript file from config values. If user-controlled arguments are not sanitized, an attacker who can write config values could inject arbitrary VBScript.
Mitigation T-08: VbsLauncher.write() must sanitize all user-controlled arguments before interpolation into VBScript. String values must be escaped or rejected if they contain VBScript metacharacters (double quotes, line breaks). Restrict nodePath and scriptPath to absolute filesystem paths only; args array must not contain newlines.

### Repudiation

No audit log of which version was auto-installed or when. `update-state.json` provides partial evidence but is writable by the user.
Status: Accepted risk -- CLI tools, not security-critical infrastructure.

### Information Disclosure

Config dir `~/.config/flow` may contain cached registry responses, update logs, and future auth tokens.
Mitigation T-03: No secrets currently stored in config dir. Update logs are append-only plaintext. If auth tokens are added in future, encryption at rest must be evaluated.

### Denial of Service

A broken auto-update could leave the CLI in an unusable state. The updater implements rollback (reinstall previous version) if self-check fails.
Mitigation T-04: `flow-updater.cjs` rolls back to `currentVersion` on self-check failure. Lock file prevents concurrent updater runs.

### Elevation of Privilege

`npm install -g` requires write access to the global npm prefix. On Linux this may require sudo. The auto-updater spawns `npm install -g` as a detached child -- if the CLI runs with elevated privileges, the updater inherits them.
Mitigation T-05: CLIs must not be run as root/admin. Self-check verifies the binary runs without elevated permissions.

## Mitigations

| ID   | Threat category        | Threat description                                                              | Mitigation                                                                                                                                                                           | Status    | Decision # |
| ---- | ---------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ---------- |
| T-01 | Spoofing               | Malicious version published via leaked WRITE token                              | WRITE token in CI secrets only; token validation (PyPI probe) in CI -- validates WRITE scope without creating artifacts (see ci/docs/gitlab-token-validation.md)                     | Mitigated | D-3        |
| T-02 | Tampering              | Malicious files in legacy APPDATA path moved to new config dir during migration | migrateIfNeeded exits early if target dir exists; config files are not executable                                                                                                    | Mitigated | D-4        |
| T-03 | Information Disclosure | Auth tokens stored in plaintext config dir                                      | No secrets currently stored; future feature must evaluate encryption. No action until auth tokens are introduced                                                                     | Open      | -          |
| T-04 | Denial of Service      | Broken update leaves CLI unusable                                               | Rollback to previous version if self-check fails after update                                                                                                                        | Mitigated | D-4        |
| T-05 | Elevation of Privilege | Auto-updater inherits elevated privileges from parent process                   | CLIs must not run as root; self-check verifies non-elevated execution                                                                                                                | Open      | Q-10       |
| T-06 | Tampering              | shared-cli published as malicious version to GitLab registry                    | Same token controls as other packages; consumers use caret range (^) -- CalVer makes publish timestamp visible; WRITE token (T-01) is primary defense. See D-19 for pinning strategy | Mitigated | D-19       |
| T-07 | Tampering              | `launcher.config.json` UpdateCmd injection (T8 scope only)                      | Scope: wdrive T8 only; validate/restrict UpdateCmd before implementation                                                                                                             | Open      | -          |
| T-08 | Tampering              | VbsLauncher VBScript injection via user-controlled config                       | Sanitize arguments; restrict to absolute paths; reject newlines/quotes                                                                                                               | Open      | D-6, D-15  |

## Open security questions

Q: Should shared-cli pin to specific CalVer in consumer package.json, or use a range? -> pinning strategy resolved by D-19; caret range accepted
Q: T-05 -- should self-check verify non-root/admin execution? -> see Open Questions Q-10 in _index.md
