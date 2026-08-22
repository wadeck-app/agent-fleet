# Audit Report -- Security -- CLI Distribution (Implementation)

**Date:** 2026-08-20
**Spec version:** v0.1
**Auditor:** Claude (spec mode)

## Scope

Files reviewed:

- packages/flow-cli/src/updater/UpdaterMain.ts
- packages/flow-cli/src/updater/UpdateManager.ts
- packages/flow-cli/src/cli/commands/CliCommand.ts
- packages/flow-cli-dist/bin/flow.js
- packages/task-cli-dist/bin/task.js
- ci/scripts/compute-version.sh
- ci/scripts/copy-binaries.sh
- .github/workflows/publish-flow-cli.yml
- .npmrc

## Executive summary

Core security requirements (S-01, S-02, S-03, A-01) are correctly implemented. Version strings are validated before use in npm commands. Lock uses O_CREAT|O_EXCL with PID and stale detection. All process.exit() calls inside the try block were replaced with return so the finally block always executes. Two MEDIUM issues remain: health check uses npm exec which may resolve a stale PATH-cached binary, and the string interpolation comment in rollback could mislead future editors.

## Findings

| ID | Severity | Finding | File / Line | Recommendation |
| ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| SEC-01 | MEDIUM | Health check uses `npm exec --package=@wadeck/flow-cli -- flow cli self-check`. After global install, `flow` in PATH may still point to the previous version (PATH cache). The new binary may be broken but the old one passes the check, allowing a silently broken update. | UpdaterMain.ts:277 | Replace with direct node invocation using the resolved bundle path from the newly installed package, e.g. `execFileSync(process.execPath, [resolvedFlowCjs], { env: { FLOW_SELF_CHECK_QUIET: '1', ... } })` |
| SEC-02 | MEDIUM | CliCommand.ts rollback at line 300: `execFileSync('npm', ['install', '-g', \`${PKG_NAME}@${previousVersion}\`])`. Although `previousVersion` is validated by VERSION_RE on line 295 (no injection possible), the string-interpolation-into-argv pattern could be copied by future editors without the guard. | CliCommand.ts:300 | Add inline comment: "previousVersion validated by VERSION_RE above -- safe to interpolate into argv array" |
| SEC-03 | INFO | VERSION_RE accepts pre-release (-) and build (+) suffixes. This is correct but undocumented in the regex comment. | UpdaterMain.ts:19, CliCommand.ts:23 | Add comment: "accepts semver pre-release and build metadata suffixes" |
| SEC-04 | INFO | Lock requirement A-01 fully satisfied: O_CREAT | O_EXCL (line 141), PID written (line 142), stale-PID via process.kill(pid,0) (line 154), released in finally (line 311). All early exits inside try use return not process.exit(). | UpdaterMain.ts:139-317 | No action. |
| SEC-05 | INFO | S-02/S-03 satisfied: latestVersion validated by VERSION_RE (line 234) before npm install. previousVersion validated in CliCommand.ts rollback (line 295). All npm commands use execFile/execFileAsync with argv arrays -- no shell:true. | UpdaterMain.ts:234, CliCommand.ts:295 | No action. |
| SEC-06 | INFO | CI: NODE_AUTH_TOKEN not on publish steps (removed). Auth via ~/.npmrc setup step only. No duplicate injection. | publish-flow-cli.yml | No action. |
| SEC-07 | INFO | compute-version.sh: explicit exit 1 on empty VERSION_INPUT for workflow_dispatch (lines 23-28). | compute-version.sh:23 | No action. |
| SEC-08 | INFO | copy-binaries.sh: set -euo pipefail present (line 5). | copy-binaries.sh:5 | No action. |
| SEC-09 | INFO | .npmrc: contains only scope registry line and comment. No auth token committed. | .npmrc | No action. |
| SEC-10 | INFO | flow.js / task.js: require.resolve wrapped in try/catch with user-readable message. bundlePath via \_\_dirname (not self-referential require.resolve). | flow.js:24-29, 32 | No action. |

## New open questions raised

- SEC-01: How to reliably invoke self-check on the newly installed package without PATH ambiguity? Consider `require.resolve('@wadeck/flow-cli/flow.cjs')` after install to get the absolute path.
