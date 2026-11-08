# Workspace provider redesign

Status: plan (no code changed). Paths are relative to `packages/`.

## Principles

- One extension point: `workspace`. The flow's `workspace:` block is replaced by a provider name plus options validated by that provider.
- Three built-in strategies: `in-place` (A), `pool` (B), `readonly` (C).
- A provider failure (allocate, clone, checkout) fails the run loudly. No empty-directory fallback. (Being fixed separately: not designed here.)
- "Healthy base" (`git pull`/reset) is a flow script step, never provider logic.
- `readonly` is advisory: it conveys intent, it enforces nothing.

### Decisions

| # | Decision | Status (2026-11-08) |
| --- | --- | --- |
| 1 | A flow with no `workspace:` block is an ERROR, always (no project default, no implicit in-place). Refused at validation; the message names the providers and gives an example. | User, final |
| 2 | Legacy block: only `mode: manual` -> `in-place` is mapped, with a deprecation warning for one release. Every other legacy combination fails validation with a rewrite hint. | Default taken |
| 3 | Native clone strategies (`main-only`, `any`, `feature-branch`) are dropped. `worktree` is kept. | User, final |
| 4 | `readonly` + a model step declaring `write`/`edit`/`bash` tools: fail at start, naming the step and the fix. | User, final |
| 5 | Pool with no free slot: the run WAITS for the next free slot, no timeout. `onBusy` / `waitTimeoutSec` do not exist. See 2.3. | User, final |
| 6 | Dirty slot at claim: allowed with a note; option `requireClean`. | Default taken |
| 7 | Pool creation: documented script first, command later. | Default taken |
| 8 | Keep `worktree`; alias `none` -> `in-place`. | Default taken |
| 9 | metaDir per execution: `<projectDir>/.flow/runs/<executionId>.meta`. | Default taken |
| 10 | A flow with no available folder is a WAITING EXECUTION: the daemon keeps its state, as if the flow did not exist, and it continues when a slot frees. No failure, no timeout; re-queued after a daemon restart. Rules in 2.3. | User, final |

## 1. Current state (from code)

### Contract and resolution

| Fact | Where |
| --- | --- |
| Contract `allocate({taskId, hint?}) -> {path, id}`, `release(handle)`. No flow, no options, no cwd, no metaDir. | `extension-points/src/workspace/v1.ts:1-14` |
| Daemon passes only the executionId as `taskId`. | `flow-cli/src/daemon/ExecutionWorkspaces.ts:77` |
| `metaDir` is always `handle.path + '.meta'` (sibling dir), created by the daemon, owned via a marker file. | `ExecutionWorkspaces.ts:89-92`, `flow-cli/src/storage/PluginMetaOwnership.ts` |
| `outputsDir = workspaceMetaDir + '/outputs'`; `workspaceDir` and `outputsDir` travel in `ExecutionContext`. | `flow-cli/src/daemon/RunRequestHandler.ts:146-203` |
| `none` returns `process.cwd()` of the DAEMON (a per-user singleton), not the project of the run. | `plugin-none/src/NoneWorkspaceProvider.ts:6` |
| `worktree` runs `git worktree add -b <prefix><taskId>` via execa with no `cwd` (daemon cwd); `validateBaseDir` also reads `process.cwd()`. | `plugin-worktree/src/WorktreeWorkspaceProvider.ts:29-61`, `extension-points/src/pathValidation.ts:71-104` |
| One global provider is built once at daemon start from global config + launch-dir project config. Nothing declared -> `{}` -> native path. | `flow-cli/src/daemon/Daemon.ts:111`, `flow-cli/src/daemon/tryResolvePlugins.ts:57-92`, `flow-cli/src/config/PluginResolver.ts:102-133` |
| Flow-level override `plugins.workspace` (`use` / `instance` / `options`) builds a provider per run. | `flow-engine/src/types.ts:1066-1076`, `PluginResolver.ts:45-58`, `ExecutionWorkspaces.ts:52-66` |
| Built-in manifests are statically imported: `none`, `worktree`, `cli-approval`, `file-approval`. Used by `PluginLoader.loadManifest` when no `pluginsDir`. | `flow-cli/src/config/BuiltinPlugins.ts:21-26`, `PluginLoader.ts:161` |
| `BuiltinPluginRegistry` (`registerBuiltinPlugin`) is a different system (FlowPlugin shape), not used for workspaces. | `flow-cli/src/config/BuiltinPluginRegistry.ts` |
| `release` is called through `releaseWorkspace` (dual-error contract) or `releaseWithRetry` (1 retry after 2 s, Windows file-held case). | `extension-points/src/releaseWorkspace.ts`, `ExecutionWorkspaces.ts:155-236` |
| Original spec said `mode/gitStrategy/reusePolicy` are "removed from the flow YAML schema"; the code never did it. | `.claude/specs/2026-08-16_09-48_plugin-system/workspace-provider.md:131-135` |

### Native path (the `workspace:` block)

| Field | Read by | Effect |
| --- | --- | --- |
| `mode` (`isolated`/`shared`/`manual`; default `isolated`) | `WorkspaceManager.allocate` `flow-engine/src/workspace/WorkspaceManager.ts:52-74`; defaults in `FlowRegistry.ts:668-675`; validated `SchemaValidator.ts:135+` | `manual` = use `cwd` as is (`:189-213`). `isolated`/`shared` = new dir `<project>/.flow/workspaces/<mode>-<uuid>` (`:215-252`). |
| `gitStrategy` (`main-only` default, `feature-branch`, `any`, `worktree`, `none`) | `WorkspaceGitStrategy.setupGit` `WorkspaceGitStrategy.ts:55-135` | `worktree`: branch `fleet/task-xxxx-slug` + `git worktree add`. Others: `git clone <project>` (+checkout/branch). |
| `reusePolicy` (`never` default, `if-available`, `always`) | `findReusable` `WorkspaceManager.ts:168-187` | Dead through the daemon: `allocateNative` builds a NEW `WorkspaceManager` per execution (`ExecutionWorkspaces.ts:117`), so its in-memory map is always empty. |
| `concurrencyKey` | `findReusable`, `allocateManual` | Same: no effect through the daemon. |

- Git failure is swallowed: `setupGit` catch logs and returns `undefined` ("continuing without git", `WorkspaceGitStrategy.ts:68-71`) -> run in an empty directory. This is the loud-failure bug fixed separately.
- Release: `isolated` is cleaned (worktree remove or rm -rf), `shared` and `manual` only deregistered (`WorkspaceManager.ts:77-114`); `shared` dirs accumulate until `pruneProjectWorkspaces` (`flow-cli/src/daemon/pruneProjectWorkspaces.ts`).
- Usage in this repo's `.flow/*.yml` and fixtures: `mode: manual` 22, `isolated` 10, `shared` 8; `reusePolicy` set in 38 places. (Counts from a grep of `*.yml`, includes fixtures.)
- Other users of the block: `FlowGenerator.generateWorkspaceConfig` (`flow-engine/src/generation/FlowGenerator.ts:218`), `SubFlowStep.workspaceStrategy`, docs `.claude/docs/flows/schema-reference.md`, skill `.claude/skills/flow/SKILL.md:81`.

### Consumers of the paths

| Consumer | Uses | Where |
| --- | --- | --- |
| Script steps | `outputsDir` (writes outputs under it) | `flow-engine/src/executor/ScriptStepExecutor.ts:19-32` |
| Env templates | `workspaceDir` | `flow-cli/src/daemon/RunStepPreparer.ts:124` |
| Worker | `path: workspaceDir`, `metaDir` derived from `outputsDir` | `flow-cli/src/worker/WorkerAdapter.ts:147-176` |
| Sandbox | mounts exactly `workspaceDir` + `workspaceMetaDir`, both writable; warns when workspace is the project dir or a regular `.git` directory; worktree `.git` file -> git unusable in sandbox | `flow-sandbox/src/RunMounts.ts:46-62,148-165` |
| Model steps | per-step `tools` allow-list (`read`,`write`,`edit`,`bash`,`glob`,`grep`,...) mapped to claude `--tools`, opencode per-tool, codex `--sandbox read-only` + `--disable shell_tool` | `flow-engine/src/processing/ToolAccess.ts`, `ClaudeLauncher.ts:244`, `CodexToolPolicy.ts` |

### Windows constraints (from code)

- Release can fail on a file held by an exiting process: retried once after 2 s (`ExecutionWorkspaces.ts:22-23,189-236`).
- Sandbox mounts compare paths with win32 rules (drive, case) and reject symlinks/junctions below the mount roots (`RunMounts.ts`).
- `.meta` is a sibling of the workspace dir: path length matters for deep pool prefixes (MAX_PATH not verified in code; to test).
- `mkdir` without `recursive` is atomic and gives EEXIST (already used as proof of ownership in `PluginMetaOwnership.ts`): usable for claims.

## 2. Target design

### 2.1 Contract (extend v1, do not break it)

| Item | Change |
| --- | --- |
| Request | add `executionId`, `projectDir` (absolute, resolved by the daemon from the run's project), `flow: {id, version}`. Keep `taskId` as alias of `executionId` during deprecation. |
| Handle | add optional `metaDir` (default `path + '.meta'` only for exclusive paths), optional `readOnly: boolean`, optional `notes: string[]` (warnings to show in the execution log). |
| Options | stay construction-time (`provider(options)` in the manifest); validated by the provider's factory, which throws with an actionable message. |
| Release | idempotent; `in-place` and `readonly` no-op; `pool` unclaims. |
| Daemon | `ExecutionWorkspaces` keeps ONE path (provider). `allocateNative` and `WorkspaceManager` are removed at the end. A provider that cannot be resolved or allocated fails the run (`WORKSPACE_ERROR` with the provider message, not the generic text at `ExecutionWorkspaces.ts:83`). |

`projectDir` removes the singleton-daemon `process.cwd()` bug in `none`, `worktree` and `validateBaseDir`.

### 2.2 Providers

| | `in-place` (A) | `pool` (B) | `readonly` (C) |
| --- | --- | --- | --- |
| Path | `projectDir` (or option `dir`) | one free slot of the pool | `projectDir` (or option `dir`) |
| Exclusive | no check (as today's `manual`) | yes, claimed | no, shared by many runs |
| Allocate | validate dir exists; warn if not a git repo or dirty | claim a free slot (2.3) | validate dir exists; return `readOnly: true` |
| Release | no-op | unclaim, never delete | no-op |
| metaDir | per execution (see below) | per execution | per execution |
| Options | `dir?` | `dir`, `prefix` or `slots[]`, `count?`, `requireClean` | `dir?` |
| Replaces | `manual`, `none` | new (shared + reuse intent, done properly) | new |

metaDir: in-place, pool and readonly paths outlive or are shared by executions, so `path + '.meta'` collides (outputs are keyed by step under `outputsDir`, `ScriptStepExecutor.ts:32`; concurrent-collision effect to verify). Proposed: `<projectDir>/.flow/runs/<executionId>.meta`, owned by the daemon through the existing `PluginMetaOwnership` marker.

### 2.3 Pool

- Layout: `<dir>/<prefix><N>` for N = 1..count, or explicit `slots: [abs paths]`. Provider does not care whether a slot is a worktree or a clone.
- Claim: `mkdir <dir>/.flow-pool/<slot>.claim` (atomic, EEXIST = taken), then write `claim.json` `{executionId, pid, daemonId, claimedAt}`. Pick the first free slot in order; retry next on EEXIST.
- Stale recovery:
  - Claim with executionId unknown to the running daemon, or pid not alive, is stale (reuse `isProcessAlive` from flow-sandbox, or move it to a shared package). Pid reuse is covered by the daemonId check.
  - Empty claim dir older than a few seconds (crash between mkdir and write) is stale.
  - Recovery logs a warning naming the slot and the dead executionId.
  - Daemon start reconciles its own claims.
- None free: the execution is a WAITING EXECUTION (decision 10): a queued execution whose state the daemon keeps. No option. Rules:
  - (a) Inert: no failure, no timeout, no error state; simply pending. It consumes no slot, no worker, no concurrency permit and does NOT count against `queue.concurrency` / worker limits while waiting. Other flows are scheduled as if it did not exist.
  - (b) Resume: automatic when a slot is released, in FIFO order (arrival order, one queue per pool held by the daemon). Triggers: event-driven on the release inside the daemon, plus a periodic recheck of the claim directory (stale or foreign-process claims) at a modest interval. Claims written by other daemons/processes are not queued: they compete via the atomic `mkdir`, so strict FIFO holds per daemon only.
  - (c) Record: status `queued`/`waiting`, stored with its inputs and the flow snapshot, so its state survives.
  - (d) Restart or stop: it has done no work, so it is RE-QUEUED at start, never marked interrupted/failed. Mechanism: the persisted record (c) is the source; at startup the daemon rebuilds the queue from the stored snapshot and inputs, in original arrival order. `reconcileInterruptedExecutions` (`DaemonStartupTasks.ts:47`) must skip waiting records.
  - (e) Visibility: log line at start and every 60 s ("waiting for a free slot (n/N claimed by: <executionId, flow, since>...)"); state shown in `flow history` / `flow show` and the UI. Never silent. `flow cancel` ends it (leaves the queue, no slot claimed, final state cancelled).
  - (f) No work before the claim: the flow's steps/workers are untouched, and no source is asked for workers while waiting.
  - Idle/update: a waiting execution counts as active work for idle-stop and update deferral (`SchedulerIdleState.hasActiveExecutions`, `DaemonIdleShutdown.isIdle`), otherwise it would be lost or never run. If this daemon's own executions can never free a slot, the periodic claim recheck frees it once external claims go away.
  - Deadlock: an execution holds at most one slot and never requests a second. A `SubFlowStep` with `workspaceStrategy: inherit` reuses the parent's workspace; `separate` is not implemented (`SubflowStepExecutor.ts:19-24`); injected steps share the run's workspace (stated by the requester, not re-verified in code). No nested allocation exists, so no hold-and-wait cycle. A pool smaller than the number of concurrently allowed executions just queues. Rule for the future: implementing `separate` must not allocate from the same pool while the parent holds a slot.
- Dirty slots: provider reports dirtiness as a note in the log. `requireClean: true` skips dirty slots and fails if none is clean. Default is NOT to block, because the healing script step must be able to fix a dirty slot.
- Who builds the pool: documented script first (see below), then a command `flow workspace pool create --from <repo> --dir <dir> --prefix <p> --count <n>`. Not created implicitly by the provider.
- Healthy base is a normal first step of the flow:

```yaml
workspace: { provider: pool, dir: D:/pool, prefix: repo-ws-, count: 4 }
steps:
    - id: sync
      type: script
      script: git fetch origin && git checkout --detach origin/main && git clean -fdx
```

- Release never deletes: leftovers of the run stay until the next run's sync step.

### 2.4 Readonly: what is conveyed, what is not guaranteed

Conveyed:

| Channel | Content |
| --- | --- |
| Context | `workspaceReadOnly: true` in `ExecutionContext` (new field), visible to executors and the log. |
| Model steps without `tools` | default `tools` = `read`, `glob`, `grep` (claude `--tools Read,Glob,Grep`, opencode per-tool, codex `--sandbox read-only` + shell disabled). `bash` is excluded by default (it can write); option to add it back. |
| Model steps with `write`/`edit`/`bash` in `tools` | fail at start with a message naming the step and the fix (decision 4). |
| Prompt | one-line note appended by the executor ("this workspace is shared and read-only; do not modify files"). |
| Env for git | `GIT_OPTIONAL_LOCKS=0` so `git status` does not take the index lock (to verify per git version). |

Not guaranteed:

- Script steps run with the user's rights and can write the repo.
- A model `bash` tool (if allowed) can write.
- No OS-level read-only mount: sandbox mounts remain writable (`RunMounts.ts:62`); a read-only mount is out of scope until `sbx` support is verified.
- Another flow (in-place or pool on the same dir) may write while readers read: readers can see a half-updated tree.
- The model CLI's own permission mode is a safeguard of that CLI, not a boundary of this product.

Guidance: point `readonly` at a repo no flow writes to (typically `main`), and keep writers on `pool` slots.

## 3. Flow syntax

| Syntax | Example | Pros | Cons |
| --- | --- | --- | --- |
| S1 name only | `workspace: readonly` | minimal; options from project config instance | cannot give per-flow options |
| S2 name + inline options | `workspace: { provider: pool, dir: D:/pool, count: 4 }` | one place, options validated by the provider | credentials-like options must still use `${ENV}` (existing rule) |
| S3 keep `plugins.workspace` (`use`/`instance`) | `plugins: { workspace: { use: my-pool } }` | already implemented | two places to look; verbose |

Recommendation: S1 and S2 under `workspace:` (string or object), resolved against built-ins first, then named instances of the project config. `plugins.workspace` becomes a deprecated alias.

Default when `workspace:` is absent: error (decision 1). The validation message names the providers (`in-place`, `pool`, `readonly`, `worktree`) and shows an example, e.g. `workspace: in-place`.

### Migration of existing flows

| Old | New | Notes |
| --- | --- | --- |
| `workspace:` absent (was `isolated` + `main-only` by default, `FlowRegistry.ts:668-675`) | ERROR | validation message with providers and example; every such flow must be edited |
| `mode: manual` | `in-place` | exact; the only automatic mapping, deprecation warning for one release |
| `plugins.workspace` none provider | `in-place` | `none` kept as alias, warns |
| `isolated` + `worktree` | `worktree` provider (existing plugin, branch `<prefix><executionId>`) | branch naming differs from `fleet/task-xxxx-slug` |
| `isolated` + `main-only`/`any`/`feature-branch` (clone) | removed: use `worktree` or `pool` | validation error with hint |
| `gitStrategy: none` | removed | was an empty dir; validation error with hint |
| `gitStrategy: main-only` / `any` / `feature-branch` | removed: use `worktree` or `pool` | same as the clone row |
| `shared` + `reusePolicy` | `pool` | old behaviour was already dead through the daemon; no automatic mapping (needs `dir`/`count`) |

- Chosen path: no silent automatic mapping. A flow with a legacy block fails validation with the rewrite hint, e.g. `workspace.mode: manual is removed: use "workspace: in-place"`. Exception: `manual` -> `in-place` rewritten with a deprecation warning for one release (decision 2).
- Versions: the definition hash covers the flow definition, so editing `workspace:` creates a new hash and requires a version bump per the existing snapshot rules (`flow-core/src/definitions/DefinitionHash.ts`; whether hashing is on text or parsed object to verify).
- Docs and skill: update `.claude/docs/flows/schema-reference.md` (+ README, quick-start, best-practices, troubleshooting, pattern-catalog), `.claude/skills/flow/SKILL.md:81`, `FlowGenerator`, `ShowCommand` summary, `SchemaValidator.validateWorkspaceConfig`, spec `workspace-provider.md`, plugin READMEs.

## 4. Security and trust

- Providers are plugins (T-02): built-ins are statically imported; third parties load from disk as today. No new trust boundary; pool/readonly add none.
- Pool/in-place/readonly `dir` and `slots`: absolute, not a drive root, not a system dir, no symlink/junction. Reuse `validateBaseDir` / `isSystemDir` from `extension-points/src/pathValidation.ts` after making them take `projectDir` instead of `process.cwd()`. Its "must not be an ancestor of the project root" and "not inside a worktree" rules need review: a pool may legitimately sit next to the project.
- `.git/hooks` and `.git/config` hazard: worktrees of one repo share `.git/hooks` and `config`; an agent in one slot can plant a hook that runs on the host in every other slot and in the main repo. In-place and readonly on a regular checkout have the same exposure. `RunMounts` already warns for a regular `.git` directory. Pool slots as independent clones avoid sharing. Mitigation to offer: `core.hooksPath` pointing to an empty dir in the pool-creation command.
- Readonly is advisory (see 2.4); never present it as isolation in docs or logs.
- Readonly with a writer on the same dir: inconsistent reads; the log should say so when `dir` equals an in-place workspace of another running execution (daemon knows both).
- Claim records contain executionId/pid only; no secrets.
- Provider errors are logged in full in the execution log; the run response carries the provider message (actionable), not a generic string.

## 5. Open questions

All points are decided (table at the top). 1, 3, 4, 5, 10 by the user; 2, 6, 7, 8, 9 are the plan's recommendation, open to objection.

### Still to verify in code

- Code path of `ExecutionRegistry.activeExecutionCount` / `hasActiveExecutions`: is a waiting execution counted as active (decision 10, idle/update rule)? If not, make it count.
- Definition hash: computed on the definition text or the parsed object (`DefinitionHash.ts`).
- Concurrent outputs collision under a shared `outputsDir` (`ScriptStepExecutor.ts:32`).
- `GIT_OPTIONAL_LOCKS=0` behaviour per git version.
- MAX_PATH with a deep pool prefix on Windows (`.meta` sibling).
- Read-only sandbox mount support (`RunMounts.ts`).
- Injected steps share the run's workspace (stated by the requester, not seen in code).

## 6. Implementation plan (small TDD steps)

| # | Step | Ships alone | Depends |
| --- | --- | --- | --- |
| 1 | Fail-loud git failures: DONE, shipped in commit 092e5578 (code `WORKSPACE_GIT_FAILED`). The native path is removed at step 7, so the fix's value is for the transition only | yes | - |
| 2 | Contract extension (`executionId`, `projectDir`, `flow`, `metaDir`, `readOnly`, `notes`) + `ExecutionWorkspaces` passes them, uses `handle.metaDir`; `none`/`worktree` use `projectDir`. Tests: contract, `PluginMetaOwnership` with custom metaDir | yes | - |
| 3 | `in-place` provider (+ `none` alias with warning); built-in manifest in `BuiltinPlugins.ts`; tests next to the class | yes | 2 |
| 4 | `readonly` provider + `workspaceReadOnly` context + default read tools + prompt note + `GIT_OPTIONAL_LOCKS`; tests with mock CLIs (`CLAUDE_MOCK_PATH`/`OPENCODE_MOCK_PATH`) per project rule | yes | 2 |
| 5 | `pool` provider: claim, stale recovery, `requireClean`; tests incl. two concurrent claimers, crash-between-mkdir-and-write, dead pid; pool-creation script documented | yes | 2 |
| 5b | Pool wait (no timeout): per-pool FIFO queue, `waiting for workspace` state in `flow history/show` + UI, log at start and every 60 s with claim holders, `flow cancel` of a waiting execution, waiting counted as active for idle-exit/update, waiting records re-queued at start (reconcile skips them), no concurrency permit held while waiting. Needs a new execution state (store, CLI, UI: frontend-dev agent). Tests: FIFO order, cancel while waiting, idle check, restart | yes | 5 |
| 6 | Flow syntax `workspace: <name>` / `{provider, ...}` in `FlowRegistry`/`SchemaValidator`; absent block = error with providers + example (remove the default at `FlowRegistry.ts:668-675`); legacy block error with hint (clone strategies, `gitStrategy: none`, `shared`/`isolated` combos); `manual` -> `in-place` with warning; `plugins.workspace` deprecation; docs + skill + generator; rewrite the 10 `isolated` flows of the repo | no (changes definitions) | 3-5b |
| 7 | Remove `allocateNative`, `WorkspaceManager`, `WorkspaceGitStrategy`, `WorkspacePruner` native use, `WorkspaceConfig` types, `pruneProjectWorkspaces` | no | 6 |

Each step: unit tests, `check` skill, coverage >= 70%.

## 7. Risks

- Contract change touches a published extension point: additive fields only, `taskId` alias kept.
- Existing flows break at step 6 (22 manual / 18 isolated+shared in this repo, plus every flow without a `workspace:` block): the 10 `isolated` flows must be rewritten by hand (`worktree` or `pool`), and the absent-block error forces an edit of flows that relied on the default. Migration list and error hint are the mitigation.
- Waiting without timeout: a pool whose slots are held by stuck or very long runs keeps later runs of that flow pending indefinitely (other flows are unaffected). Mitigation is visibility only (state, 60 s log naming the holders) and `flow cancel`; stale-claim recovery (2.3) must work or the wait never ends.
- The waiting state touches the execution store, CLI and UI, and the startup reconcile; it must count as active for idle/update checks and be re-queued, not interrupted, at start.
- `.meta` relocation changes where outputs and sessions are found (history, pruner `PluginMetaCleaner`): needs a check of every reader of `workspaceMetaDir`.
- Claim correctness on Windows (antivirus holding the claim dir, pid reuse): covered by tests with injected clock/pid checker.
- Readonly default tools may surprise users who relied on `bash` for `git log`: the option and the start-time message must make it obvious.
- Sandbox plus worktree/pool: worktree `.git` file makes git unusable in the sandbox (`RunMounts.ts:160`), so sandboxed pool slots should be clones.
