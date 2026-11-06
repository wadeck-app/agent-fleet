# M6 design note: the production sandbox worker plugin

**Status:** proposal, no code changed. Inputs: plan `2026-10-25_docker-sandbox-worker.md` (sections 9-10), `comparison.md` (M8), spec decisions 5/6/15/16/27-30, threat model, C0 note, `packages/flow-sandbox`, flow at HEAD of `integration` (a77997ee). Every claim below was read in the file named; `[UNVERIFIED]` = not confirmed.

## 0. Blocker found while checking the facts

`contactDeclaredSources` calls `obtainWorker({ daemonEndpoint, sourceId, projects: [] })` with NO `authToken` (`WorkerSourceContact.ts:135-139`); the launch token is minted only for built-ins (`WorkerTypeHost.issueLaunchToken`, `WorkerTypeInstances.ts:25-33`; `CommandWorkerSource.ts:63-67`). A worker without a credential is refused (`SharedTokenAuthenticator.ts:36-45`). So a disk plugin cannot start a wrapper that the daemon will admit. Only the registration token of the source works (hash-only in the registry, so the user must pass it as `--option token=${ENV}` and restart the daemon: chicken-and-egg, rejected as the default). Needs core question Q-A. Same for `projects`: always `[]` for plugin sources, so the project ids become a plugin option (Q-E).

## 1. Decisions

| # | Decision | Why / alternative rejected |
|---|---|---|
| 1 | **Ship `sandbox.exec` first.** Relay is **parked**: source stays in `src/harness`, compiled, no new work, no shipped entry, no `m4` image upkeep. | M8 s11: same fidelity, same cold start (10.5-11 s), exec has smaller VM trust surface, no bridge token (T-11/G1), only landed C4 seam. Exec costs 0.83 s per script step (INFERRED to matter only for many-short-steps flows). Rejected: keeping relay as `sandbox.relay` now: doubles live checks, image and docs for a path nobody asked for. Revisit triggers (M8 s11.3): many short script steps, Codex/OpenCode in the VM, remote engine. Both would be type `sandbox` (type = plugin id), so a later `sandbox.relay` needs no flow change. |
| 2 | **Disk plugin, two plain-JS files, not a built-in.** `plugin-sandbox/plugin.config.js` (ESM, small: option parsing, preflight, spawn, dispose) + `plugin-sandbox/wrapper.cjs` (esbuild bundle of `ExecMain`, `WorkerAdapter`, `flow-engine`, sandbox layer; also modes `leftover list\|remove\|reap`). The factory spawns `process.execPath wrapper.cjs` (daemon runs as `node flow.cjs`, `DaemonBackgroundSpawner.ts:130`) with `windowsHide:true` (no console to keep), env as `CommandWorkerSource` does (`FLOW_DAEMON_WS_URL`, `FLOW_WORKER_SOURCE_ID`, `FLOW_WORKER_TOKEN` = `request.authToken`), stderr prefixed `[source <id>]`. | Built-in rejected: couples flow-cli to sbx and Docker versions, contradicts decision 6, and the bundle would carry code most users never run. One file rejected: the daemon would load the whole engine (about 650 KB `worker.cjs` class of size) to read a manifest. The wrapper must be its own process anyway (decision 29: one process, one sandbox at a time, fresh sandbox per run; `SandboxLifecycle` already allows the next run after `endRun`). **Idempotent spawn:** the instance keeps the child; it does not launch while one is alive or starting (the daemon re-asks sources repeatedly, harness saw 5 launches for one run). One wrapper per source; more concurrent runs = more sources (wrapper id derived from the source id). No `request.authToken` => `obtainWorker` throws with the fix, no silent path. Artifact built by `npm run bundle --workspace flow-sandbox` modeled on `flow-cli/ci/scripts/bundle.ts:40-67` (inline `extension-points.json`). Must be loaded once through the real `PluginLoader` under plain `node` from a dir without `node_modules` (ESM `.js` without package.json: `[UNVERIFIED]` outside vitest). |
| 2b | **User view.** Install: build the artifact (v1: from the checkout, no publication) and have `sbx` signed in, Git Bash on the host (exec resolves bash on the host), image loaded (`image/build-image.mjs`). Declare: `flow worker source add sandbox --provider sandbox --plugin sandbox.exec --plugins-dir <abs>/dist-plugin --option projects=<ids> --option region=us-east-1 --option profiles=claude=<aws-profile> [--option image=flow-sandbox:<v> cpus=2 memory=2g maxConcurrentSandboxes=4 idleStopMinutes=5 extraAllowedHosts=h:443,... pull=never acceptSshAgentForwarding=true]`. | `--option` yields strings only, split at the first `=` (`WorkerSourceCommand.ts:60-69`): the plugin adapter parses `profiles=a=x,b=y` and lists on commas, coerces numbers, and rejects unknown keys through the existing `SandboxOptionsParser` (typo = error). Errors surface at first contact (no declare-time factory run): throw an error named `PluginConfigurationError` with the fix (fixture `configerror`). `[UNVERIFIED]`: whether `profiles` hits the sensitive-key list. |
| 3 | **Run end.** Exec registration adds `run-events` to its `ready` (exec only; relay's `WORKER_FEATURES` untouched). New `run_end` case in `ExecWrapper.handleDaemonMessage` (today `default:` logs "unknown message"). Serialised on the lifecycle queue: `endRun(executionId, reason)`, THEN `run_end_ack`. `completed\|failed` = remove; `daemon_stopping` = stop and keep (already implemented), ack best effort. | Ack-after-removal because the workspace is released at the ack (`WORKERS.md:208-211`) and a mounted dir blocks Windows removal. Removal fails (not `not-found`): one retry after 2 s, then NO ack, warn with the `leftover remove <name>` command; daemon waits the bound (30 s default, 120 cap), releases, logs worker/source/execution. Duplicate event: idempotent (`SandboxLifecycle.endRun`). Socket dead when `run_end` arrives: the daemon already dropped us from the awaited set; still remove, log that ack was impossible. A step still running (sibling after terminal failure): abort the engine step first, then remove; its late reports are dropped by the daemon (`v1.ts` doc) `[UNVERIFIED: ExecWrapper abort path]`. `sbx rm` duration is NOT measured: add to the live check; if above the bound, document `worker.ackTimeoutSeconds`. **`run.onRunEnded`: wanted as backstop only**: it would spawn `wrapper.cjs reap <executionId>` (keeps sbx out of the daemon) to remove a sandbox whose wrapper died, for `completed\|failed` only. It runs only if a worker that declared `run-events` was handed a step AND is still known; whether a socket closed before `run_end` still counts is `[UNVERIFIED]` (Q-H). Until answered M6 ships without it: a stopped leftover is the safe direction (T-03). |
| 4 | **M8 "before any default" conditions.** (a) provider error hidden by `session_file` refusal: **package.** `ReturnedPaths` treats `''` as absent (the HOST record also has `''`, `comparison.md` s6) and any refusal keeps the provider's own error text in the failure. (b) wrapper start failures: **package** preflight (`SbxPrerequisiteCheck`) in `obtainWorker` throws the actionable text; if the child exits before registering, its stderr tail is re-thrown at the next ask. **Core** to make it reach the step: Q-B. (c) credential causes ("Could not load AWS credentials" with the reason only in the log): **package**: the endpoint already records refusal reasons (`profile-not-found`...); the wrapper appends "credentials were refused during this step: reason + fix" to a failed step's error. Message shape through `InsideMessageGuard` `[UNVERIFIED]`. (d) exec N>=2 with free memory: live bench. | Today (b) and (c) are visible only with `flow logs` (`comparison.md` s8); the bound-wait failure text says "see the daemon log" (`BoundStepWait.ts:156-168`). |
| 5 | **Routing/isolation.** Flow: `workerType: sandbox` (no label needed). Every step, injected ones included, runs only on a worker of that type, never falls back (`WORKERS.md:129-145`). Wrapper keeps registering `bash` only. Reap at wrapper start = `reportAtStart` + `reapOwn` (STOP, never remove, decision 26). User docs say: "outbound HTTP(S) is filtered; raw TCP by IP is not (T-15)", never "network isolated". Env: keep `VmEnvironmentFilter` (engine runs scripts with `isolateEnv:false`), ask for the core fix (Q-F). Codex/OpenCode: **refused in v1 with an actionable step error** (M8: the expected text was never seen, the session_file refusal came first; tested after 4a). | **Conflict with decision 27:** strict binding means a `cmd`/`pwsh` step or a script calling the daemon API cannot run in a bound run, and a step no connected worker accepts STALLS (`WORKERS.md:139-141`, M8 s9: pending >120 s, no error). Host-only work goes in another flow. Needs user OK (U2). The C0 "reap" (item 6) vs decision 26 "never automatic": reap = stop and report; automatic removal is U4. Codex/OpenCode support needs: stager accepting their temp files (`VmFileStager.ts:51-74`), Bedrock settings reaching Codex (relay got 401 from api.openai.com), a spike on 0.164 resume (`list_turns is not supported yet`; version regression vs mount unknown: test the same version with `CODEX_HOME` off the mount), an exec e2e per tool. Not M6. |
| 6 | **Tests/CI.** See section 2. | |
| 7 | **Repository.** See section 3. | |
| 8 | **Milestones.** See section 4. | |

## 2. Tests and CI (decision 6)

**E2E with the sbx mock (runs in `npm test`, no VM):** real isolated daemon (`createIsolatedCliEnv`, as `ExecLiveCheck.mjs`), the BUILT plugin artifact declared with `--plugin sandbox.exec`, `SBX_MOCK_PATH` inherited by the spawned wrapper, flow `workerType: sandbox` with 2 script steps. The mock has no `bash`; add a labelled pseudo-command that returns canned output (it does not execute the script).

| Assertion (honest) | Proves | Cannot prove |
|---|---|---|
| wrapper registers with source token, type `sandbox`, `run-events`; steps run only on it | credential wiring (after Q-A), binding, spawn from a plain-JS artifact | real isolation |
| mock call log: `create` with exactly the two mounts and cpus/memory flags; every `policy allow` carries `--sandbox`; exec args and cwd inside the mount | command lines | sbx accepts them (flags are checked against captured help only) |
| `rm` happens after the last step and the workspace dir STILL EXISTS when the mock records `rm` | ack-before-release ordering | Windows file locks |
| `flow stop` mid-run: sandbox stopped, not removed; wrapper exits | `daemon_stopping` path | best-effort ack timing |
| forced `rm` failure scenario: no ack, bounded wait, error log names the fix | failure path | - |
| `codex` step fails with the refusal text | UX of the refusal | tool behavior |

**Gated live (`SBX_LIVE=1`, never CI, the USER runs it: `sbx login` is theirs):** `PluginLiveCheck` = `ExecLiveCheck` in plugin form. Covers: real Bedrock step, `rm` duration, error visibility of the four M8 injections, cancel/leak table, N=2 under free memory, TCP caveat note. Evidence under `.claude/temp/m6/`.

**CI reality:** the only workflow (`publish-flow-cli.yml`) runs `npm ci`, build and bundle, NO test step (lines 39-57). So "CI" today = `npm test` on dev machines; a test job is U7.

**Volume policy:** `vitest list` = 1,104 entries in 63 files (counted). Target about 600 (to be confirmed by the profile), coverage >=70% per class stays. Rules: profile first (count and time per file); table-driven for parsers, validators, translators (`SandboxOptionsParser`, `SbxOutputParser`, `PathTranslator`, `StepCommandTranslator`, rule builders); drop tests of test doubles (`FakeClock`, `FakeScheduler`; keep the shared runtime contract); relay-only classes frozen with no growth; largest files first (`SandboxLifecycle` 64 `it`, `SbxCliRuntime` 48, `HostCredentialEndpoint` 38). **Kept whatever the count, each with a recorded mutation proof (guard flipped, test turns red):** `InsideMessageGuard`, `ReturnedPaths`/`PathTranslator` containment, `RunMounts` link rejection, `HostCredentialEndpoint` 401/403, `SandboxNetworkRules` (no global rule), `SandboxLifecycle` (remove only at `endRun`), `LeftoverSandboxes` refusal for live runs, `VmEnvironmentFilter`, new `run_end` ordering.

## 3. Repository integration (decision 7)

| Fact (verified) | Decision |
|---|---|
| Package untracked; wiring uncommitted in `tsconfig.json`, `scripts/test-config.js`, `scripts/check-ts.js`, `.prettierignore` (shared tree is already building/checking it) | One commit with pathspecs only: `git add packages/flow-sandbox tsconfig.json scripts/test-config.js scripts/check-ts.js .prettierignore` then `git commit -- <same paths>`; never `-a`, `.claude/` untouched. |
| `package-lock.json` is tracked (despite the `.gitignore` entry); CI does `npm ci` (`publish-flow-cli.yml:39`); `packages/*` is a workspace; no `flow-sandbox` in the lock (grep) | `npm ci` is expected to fail until the lock lists the package: generate it in a CLONE (`npm install --package-lock-only`, needs the GitHub Packages token for `@wadeck-app/project-sdk`), review the diff, hand the lock change to flow-owner for his batch. Do not run `npm install` in the shared tree. |
| `image/opt-flow/*.cjs` (650 KB worker, 132 KB shim) not ignored | Add `packages/flow-sandbox/image/opt-flow/*.cjs` and `dist-plugin/` to `.gitignore`; relay-only files, not needed for exec. `*.tsbuildinfo`, `node_modules` already ignored. |
| Fixtures scrubbed (`<user>` in `ls-table.stdout.txt`; no other personal path found in `fixtures`, `src`, `scripts`) | Commit as is. |
| `private: true`; `npm run build --workspaces` and `check` already include it | Not published. Only the plugin dir is the artifact. CI bundle step for it is not added until U3. Image: built by the user (`build-image.mjs`, needs a builder sandbox, ~3 min), not in CI. |
| Coupling: wrapper bundles `flow-cli` `WorkerAdapter`/engine, so a flow-cli protocol change needs a rebuild | Record the flow-cli commit in the wrapper `version` string (`ready.version`); a stale artifact shows in `flow worker list`. `[UNVERIFIED]` whether the daemon compares versions. |

## 4. Milestones (each reviewable)

| Step | Where | Deliverable / acceptance |
|---|---|---|
| M6.0 | shared tree, pathspec commit | Package committed; fresh clone: `check` + package tests green; lock updated by flow-owner; `npm ci` OK |
| M6.1 | shared tree | Test diet to the agreed number; coverage per class >=70%; mutation proofs listed in the commit message |
| M6.2 | shared tree | `run_end` + `run-events` in `ExecWrapper`; fixes 4a and 4c; fake-daemon tests of every row of decision 3 |
| M6.3 | shared tree | `npm run bundle --workspace flow-sandbox` -> `dist-plugin`; artifact loaded by the real `PluginLoader` under plain `node`, no `node_modules` |
| M6.4 | factory/spawn in shared tree; **clone branch `sbx/m6-authtoken`** for the core change | `obtainWorker` per decision 2 (blocked on Q-A); idempotent spawn, preflight, `dispose` (wait for wrapper exit, then kill) |
| M6.5 | shared tree | Mock e2e of section 2 green in `npm test` |
| M6.6 | user runs | `PluginLiveCheck` passes; M8 conditions 4a-4d shown closed; `sbx rm` time recorded |
| M6.7 | shared tree + docs | README becomes user doc (install, declare, flow example, limits: Claude only, Git Bash, no host-only steps, T-15 wording); threat-model statuses (T-01, T-03, T-11 not applicable to exec); plan status; template cleanup list (plan s10) |

## 5. Open questions

**flow-owner**
- **Q-A (blocker):** give plugin sources a launch credential: `request.authToken` filled by `contactDeclaredSources` for plugin-from-disk sources (the field exists, `worker-source/v1.ts` doc), one-shot, source-scoped, 2 min (`LaunchTokenIssuer.ts`). Alternative: lend `issueLaunchToken` to disk plugins (contradicts `WorkerTypeHost` doc).
- **Q-B:** append the last contact error of the type's sources to the bound-wait failure (`BoundStepWait.ts:156`) so "wrapper start failed: sbx not signed in" reaches the step.
- **Q-E:** pass registered project ids in `projects` for plugin sources, or accept the `projects` option.
- **Q-F:** `isolateEnv:true` or an allow-list for steps run through a custom launcher (optional).
- **Q-H:** is `onRunEnded` called when the serving worker's socket closed before `run_end`?
- **Q-I:** the stall of a step that a connected bound-type worker never accepts: planned fail-fast, and when.
- Lock: accept a lockfile change prepared in a clone.

**User**
- U1 confirm exec first, relay parked (not shipped).
- U2 strict binding supersedes decision 27 (no host-only steps inside a `workerType: sandbox` run; split into two flows).
- U3 distribution of the plugin: build from checkout (proposed) vs a published package; image registry (decision 20 still "for now").
- U4 automatic removal of stopped leftovers: never (proposed, decision 26) vs older than N days.
- U5 T-15: accept the wording "HTTP(S) filtered"; test whether data can leave by raw TCP.
- U6 test target (about 600) and freezing relay-only tests.
- U7 add a CI test job (none exists).

**Not verified:** `profiles` vs sensitive keys, ESM `.js` plugin loading under plain Node, `ExecWrapper` abort path, guard handling of an appended error text, `sbx rm` time, daemon version check, Linux/macOS.
