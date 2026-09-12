# Existing Machinery -- Worker Availability CLI

**Version:** v0.1
**Last updated:** 2026-09-11
**Status:** Reference (facts, not decisions)

Inventory of what already exists in the repo, so the design reuses rather than duplicates. All claims below are code-verified with file references.

## Two independent worker systems exist

| | flow-cli daemon worker | legacy orchestrator worker |
|---|---|---|
| Creation | daemon `fork`s it | worker dials the orchestrator |
| Identity | PID only | `preferredId`, `projectId`, `workspacePath`, `gitBranch` |
| Capability declaration | none | `availableFlows` |
| Registry | `WorkerPool` -- `Map<WebSocket, 'idle' \| 'busy'>` | `WebSocketConnectionManager` assigns/dedups IDs |
| Ready message | `{ type: 'ready', pid }` | `W2OWorkerReadyMessage` |

Key references:
- `packages/flow-cli/src/worker/Worker.ts:10-14,34,68`
- `packages/flow-cli/src/daemon/WorkerPool.ts:64-88,98,125-127`
- `packages/flow-cli/src/ipc/Protocol.ts:47-53,69-74`
- `packages/worker/src/flow/FlowWorker.ts:276-293`
- `packages/orchestrator/src/websocket/WebSocketConnectionManager.ts:77-91`
- `packages/shared-orch-worker/src/worker-messages.ts:44-51`

**Status of the orchestrator path: dead code.** Per the user (2026-09-11), `packages/orchestrator` and `packages/worker` are an early draft that is no longer used.

**Do not confuse with `orch-cli`.** `orch-cli` is a **separate repository** at `C:\Workspace_Tooling\orchestrator`, unrelated to `packages/orchestrator` in this monorepo. See the dedicated section below.

Verified 2026-09-11: `packages/flow-cli` has **zero** reference to `orchestrator`, `worker`, or `shared-orch-worker` -- no imports, no `package.json` dependency. The two systems are fully disjoint; the only `worker` match in flow-cli is its own `src/worker/`.

**Implication: the orchestrator path has no bearing on this design.** There is only one live worker system, so there is no reconciliation problem and nothing to build on.

**Correction (an earlier draft of this file was wrong).** It described the orchestrator path as a "reference implementation to learn from" and cited two items as prior art. Both claims are withdrawn:

- *Server-side worker ID assignment* -- a trivial design point that needs no precedent.
- *`availableFlows` as a capability declaration* -- a list of runnable flows, which is not a routing label. Reading it as "evidence that per-worker attributes were already felt necessary" infers intent from abandoned code.

An abandoned design was abandoned for reasons. Copying it risks importing whatever made it fail. The only genuinely useful thing it could tell us is **why** it was abandoned, which is currently unknown -- ask before treating any part of it as a model.

Whether the dead packages should be deleted is a separate cleanup question, outside this spec's scope.

## Plugin machinery can host a new extension point

Adding a `worker-pool` extension point requires three edits:

1. An entry in `packages/extension-points/extension-points.json`
2. A new `packages/extension-points/src/worker-pool/v1.ts` interface
3. A config section -- `ProjectPluginsConfig` already has a `[key: string]` passthrough (`packages/flow-cli/src/config/PluginConfig.ts:29`)

Loader: `packages/flow-cli/src/config/PluginLoader.ts` is the entire discovery mechanism.
- Config typeRef format: `plugins.<pluginId>.<implName>` (`:48-55`)
- Resolution: explicit `pluginsDir` -> constructor override -> `require.resolve('plugin-<pluginId>/plugin.config')` (`:186-211`)
- Manifest: `plugin.config.js` preferred, else `plugin.manifest.json` (`:151-184`)
- Instantiation: `impl.provider(options)` factory, or `entrypoint` + `export` dynamic import with a path-traversal guard (`:113-144`)
- Version validated against the JSON registry (`:104-110,213-234`)

Plugin shape is a three-line manifest, identical across `plugin-worktree`, `plugin-none`, `plugin-cli-approval` (each at `plugin.config.ts:5-16`).

Existing extension points: `workspace` (stable v1), `approval` (stable v1). Declared but with no interface yet: `tasks`, `secrets`, `agent`, `model`, `script`, `context` -- there is precedent for declaring a point before implementing it.

## Labels are greenfield

No label, selector, tag, or capability vocabulary exists for workers or steps. The only `tags`/`FlowCapabilities` hits are flow-authoring heuristics unrelated to scheduling (`packages/flow-engine/src/analysis/FlowAnalyzer.ts:85,114,425-462`).

## orch-cli (separate repo) -- not a host for this feature

`@wadeck-app/orchestrator-cli` at `C:\Workspace_Tooling\orchestrator`. A cross-platform local job orchestrator (cron / startup / one-shot jobs) with binary `orch`. Actively developed.

**It offers no worker-pool substrate, by design.** Its own docs exclude this space: "Orchestrator is not a flow engine"; DAGs / fan-out / parallelism are delegated to a real flow engine (`docs/guiding-principles.md:10`, `docs/out-of-scope.md:4`). No dependency on agent-fleet, flow-cli, or flow-engine. No WebSocket. Its scheduler is a `node-cron` timer wheel that spawns one child process per job with no queue, slots, or concurrency limit (`packages/orchestrator-cli/src/scheduler.ts`).

**Trap to avoid:** `label` in orch-cli (`types.ts:15`, `exec-manager.ts:13`) is a human display name, not a routing label. Do not cite it as prior art for label matching.

**Consequence for Open Question #12:** orch-cli is not a pre-existing daemon that could host pool management. A broker service would be a genuinely new process to install and operate.

**The one reusable piece -- and it answers T-01.** orch-cli authenticates inbound CLI-to-daemon connections with a bearer token read from a file in its config dir (`<configDir>/health_token`), alongside an ephemeral port written to `<configDir>/config.port`, over loopback-only HTTP RPC. This sits on `@wadeck-app/singleton-daemon-kit`, **which the flow daemon already uses**.

Applied to inbound workers: the worker reads a token from `~/.config/flow/` and presents it on registration. Reading it requires filesystem access as the same user, so a rogue process under a different account cannot obtain it. This replaces provenance-based auth (PID matching) with credential-based auth, using a pattern already proven in the same ecosystem at near-zero cost.

## Project root: three inconsistent notions

The notion of "project" does exist in flow-cli, contrary to an earlier draft of this file that said otherwise -- but it is implemented three different ways that disagree.

| Mechanism | Marker | Walks up the tree? |
|---|---|---|
| `findProjectRoot(startDir)` -- `RunCommand.ts:119-127` | `.agent-fleet/` | **Yes**, up to FS root; returns `null` if absent |
| `ConfigLoader` -- `ConfigLoader.ts:80` | `.flow/config.yml` | **No** -- literal `process.cwd()` |
| Hooks config -- `Daemon.ts:48` | `.flows/config.yml` | **No** -- literal `cwd` |

`findProjectRoot` is used only to resolve a flow ID against `<projectRoot>/.agent-fleet/flows.yml` (`RunCommand.ts:139-147`).

### Pre-existing bug: per-project plugin config silently ignored from a subdirectory

Running `flow run` from a subdirectory of a project: `findProjectRoot` correctly locates the root via `.agent-fleet/`, but `ConfigLoader` looks for `.flow/config.yml` in the *subdirectory*, misses it, and `loadProjectConfig()` returns `{}` (`ConfigLoader.ts:117-119`). The user's per-project plugin configuration is dropped with no warning.

The inconsistency is visible within the same file: a missing `FLOW_CONFIG` target throws loudly (`:95-97`), while a missing project config is silent. Violates the project's own no-silent-fallback rule.

**Implication for this spec:** project identity must come from a single shared resolver, extracted out of `RunCommand.ts` (a CLI command file is the wrong home for it) and used by `ConfigLoader` too. Fixing the resolver fixes the bug as a side effect.

## Interactive steps: currently impossible under the daemon, and explicitly blocked

Code-verified. This matters because D#32 (interactive steps surface in the worker) is not a display tweak -- it lifts a deliberate restriction.

| Fact | Reference |
|---|---|
| Any flow containing a `user_intervention` step is rejected: `UNSUPPORTED_STEP_TYPE ... not supported in v1` | `CommandHandler.ts:155-162` |
| Intervention steps are not even assignable: `AssignableStep = Extract<FlowStep, {type:'model'\|'script'}>` | `ipc/Protocol.ts:4` |
| `approvalProvider` is resolved daemon-side then never read -- dead field with the comment "stored for future worker injection (requires IPC protocol changes)" | `CommandHandler.ts:61-62`, `Daemon.ts:87,150` |
| The worker hardcodes `interactive: false` | `worker/Worker.ts:24,30` |
| `launchInteractive()` relies on `stdio: 'inherit'`, which in a forked worker inherits `['ignore','ignore','pipe']` -- no stdin | `ClaudeLauncher.ts:266`, `WorkerPool.ts:89` |
| No IPC message type exists for prompt/answer relay: `DaemonToWorker = assign \| idle \| done`, `WorkerToDaemon = ready \| log \| step_completed \| step_failed \| inject_steps` | `ipc/Protocol.ts:48-53,68-73` |
| No capability notion anywhere (`hasTty`, `canInteract`, `isTTY`) -- only a commented-out `process.stdout.isTTY` | `FlowIndex.ts:141` |

### The daemon cannot host the approval provider -- this is forced, not a choice

`plugin-cli-approval` reads `process.stdin` of whatever process instantiates it (`CliApprovalProvider.ts:14`). The daemon is spawned detached with `stdio: 'ignore'` (`RunCommand.ts:243-255`), so a daemon-side provider can never reach a human. Relaying prompts to the daemon is therefore a dead end: **the approval provider must be instantiated in the worker.**

This contradicts the plan implied by the dead `approvalProvider` field, which assumed daemon-side resolution plus injection into the worker. A provider object cannot cross a process boundary; only its construction can be relocated.

### Scope this adds

- Lift the `UNSUPPORTED_STEP_TYPE` block for `user_intervention`
- Widen `AssignableStep` so intervention steps can be dispatched
- Give the worker **its own plugin resolution** -- `PluginResolver` currently runs only in the daemon (`Daemon.ts:87`, `PluginResolver.ts:80-85`). This is a new architectural capability, not a tweak.

### Why this feature is the enabler

No worker has stdin today. A `flow worker` running in a terminal does. The inbound worker is precisely the missing piece that makes interactive steps reachable under the daemon -- the codebase anticipated the need without being able to satisfy it.

## Current worker authentication

The daemon authenticates a worker by matching its reported PID against `spawnedPids` (`WorkerPool.ts:98,125-127`). Worker env is deliberately minimal-allowlisted at spawn (`:64-88`).

This mechanism cannot apply to a worker the daemon did not fork -- it is provenance-based, not credential-based. Confirms T-01 in `threat-model.md`.
