# Implementation Plan -- Worker Availability CLI

**Spec:** `.claude/specs/2026-09-11_worker-availability-cli/` (v0.4, 64 decisions)
**Date:** 2026-09-12
**Core deliverable (D#48):** `flow worker` launched from a terminal inside a project, auto-attached to that project, with direct interaction with Claude Code / OpenCode / Codex in that terminal.

Each phase declares the extension-point interfaces for the strategies it first needs. Interfaces are never retrofitted after hardcoding a default -- that would recreate the second hardcoded branch P-1 exists to prevent.

**No open questions remain.** Every phase is executable in order.

---

## Phase 0 -- `.flow/` consolidation and project resolution (blocks everything)

### Target layout

```
<projectRoot>/.flow/
  config.yml          plugins: + hooks:   (merge of .flow/config.yml and .flows/config.yml)
  flows.yml           flow registry
  flows-custom.yml    custom flows
  workspaces/         runtime artifacts

~/.config/flow/
  config.yml          global config, moved from ~/.flow/config.yml
  config.port, health_token, config.lock, logs/, executions/, update-state.json   (unchanged)
```

Neither `.flow/` nor `.flows/` exists in this repo today -- only `.agent-fleet/`. The `git mv` therefore needs a `mkdir`, and the `.flows/config.yml` merge is a no-op locally.

Deliberately **not** moved: `.agent-fleet/workspace-metadata.json` (D#57).

### 0a -- Resolver, shipped as the S5 extension point

| Task | Target |
|---|---|
| Declare the `project-resolution` extension point and its v1 interface | `extension-points/extension-points.json`, `extension-points/src/project-resolution/v1.ts`, **plus the public barrel `extension-points/src/index.ts`** (single export surface, ~27 import sites) |
| Built-in default keyed on the **presence of `.flow/config.yml`**, never directory existence (D#50). Walk up; `.git` root as second precedence; loud failure if neither (D#40) | new file in `packages/flow-cli/src/config/` |
| Handle `.git` as a **file** as well as a directory -- git worktrees, common here via `plugin-worktree` | same |
| Legacy-layout detector keyed on legacy **config files** (`.agent-fleet/flows.yml`, `.flows/config.yml`), never directory presence -- otherwise stray `.agent-fleet/workspaces/` artifacts trigger it, the exact bug D#50 prevents | same |
| Delete `findProjectRoot` (`RunCommand.ts:119-127`), redirect its caller (`:139`) | `RunCommand.ts` |
| `ConfigLoader` uses the resolver instead of literal `process.cwd()` (`:80`), and stops returning `{}` silently (`:117-119`) -- fixes Q#23 | `ConfigLoader.ts` |

### 0b -- Path rewrites: 11 executable sites

| Group | Executable sites | Change |
|---|---|---|
| Flow registry | `RunCommand.ts:123,143`, `FlowRegistry.ts:158`, `FlowsService.ts:48,57` | `.agent-fleet/flows.yml` -> `.flow/`. `flows-custom.yml` derives from `configPath` (`FlowRegistry.ts:958`), so no extra site |
| Workspaces | `WorkspaceManager.ts:37`, `Daemon.ts:123` | `.agent-fleet/workspaces` -> `.flow/workspaces` |
| Hooks | `Daemon.ts:48` | `.flows/config.yml` -> `.flow/config.yml`. Reader extracts only `raw['hooks']` (`:55`), so no format change (D#56) |
| Global config | `ConfigLoader.ts:79`, `Daemon.ts:70` | `~/.flow/config.yml` -> `~/.config/flow/config.yml` (D#58) |
| Project config | `ConfigLoader.ts:80` | via the resolver (0a) |

**Text-only, update for consistency:** `Daemon.ts:57` (user-facing error string naming `.flows/config.yml`), `RunCommand.ts:138,141` (comment + error message), `FlowRegistry.ts:952` (comment), `debug-workspace-sync.ts:3` (comment).

**No change:** `WorkspaceMetadataFile.ts:26`, `WorkspacesService.ts:84`, `RemoveWorkspaceProjectIdMigration.ts:53` (D#57); `FlowWorker.ts:590` (D#59).

**Two cwd leaks, both fixed here (Q#22)** -- same class of bug, both on lines already being touched: `Daemon.ts:123` (workspace pruning) and `Daemon.ts:71` (project config path). Both use the starting process's cwd in a daemon shared across projects.

### 0c -- Tests

23 references across 8 files. One is load-bearing: `UserInterventionValidation.test.ts:22` reads `../../../../.agent-fleet/flows.yml` and must be updated **in the same commit** as the `git mv`.

### 0d -- Data migration, after 0a-0c land

1. `mkdir .flow` then `git mv .agent-fleet/{flows.yml,flows-custom.yml} .flow/`.
2. Move `~/.flow/config.yml` to `~/.config/flow/config.yml` if present.
3. Independent projects, contents not yet inspected: `image-tooling`, `test-agent-browser`, `_test-tasks` (the last holds the only `.flows/` in existence).

**Exit criteria**
- `flow run <registryId>` works from a project subdirectory, per-project plugin config honoured.
- A legacy-layout project fails with a message naming the files to move.
- A directory containing only `.flow/workspaces/` and no `config.yml` is **not** a project root.
- Two flows run concurrently from two different project directories without either seeing the other's workspaces.
- Full `npm test` green, including `UserInterventionValidation.test.ts`.

---

## Phase 1 -- Wire protocol, core model, registry

### 1a -- IPC protocol (first; everything below depends on it)

Today registration is `{ type: 'ready', pid }` (`ipc/Protocol.ts:69`, union at `:68-73`).

| Task | Target |
|---|---|
| Extend registration: auth token, source id, labels, attached projects, `hasUserInterface` | `flow-cli/src/ipc/Protocol.ts` |
| Widen `AssignableStep` (`:4`, today `model \| script`) -- needed in Phase 3, designed once here | same |
| Bind step results to the issued assignment so a worker cannot inject `step_completed` for work it was not given (**T-05**; PID provenance disappears with inbound registration) | same |

### 1b -- Core model

| Task | Notes |
|---|---|
| Split `WorkerPool` into `WorkerRegistry` (live), `WorkerSourceRegistry` (persisted), and an S1 implementation for local forking | Justified by Single Responsibility, **not** size -- the file is 179 lines (D#46) |
| **Name collision:** `flow-cli/src/worker/Worker.ts` already exists as the worker entry *script* (no exported class; the class is `WorkerAdapter` at `worker/WorkerAdapter.ts:36`). Pick a distinct name for the live-worker model type | Do not add a second meaning to that path |
| Declare the `worker-source` (S1) extension point: **one method to obtain a live worker**; contact-or-create is the plugin's business (D#52, D#53) | `extension-points/src/worker-source/v1.ts` + barrel |
| Built-in S1 implementations: `inbound` (contact method), `command` (create on demand), and **local fork as S2** -- today's `spawnWorker()` becomes an S1 implementation, not a core component, so `fork` is not hardcoded in the engine (P-1) | D#12 limits v1 to these |
| Capacity counted from registry + live connections, never from the child-process `exit` handler (D#14) | `activeCount` appears at `WorkerPool.ts:20,23,58,62,93,113-118,142` -- all of it goes |
| PID-provenance guard is removed (`WorkerPool.ts:98` add, `:128` check) | Replaced by token auth in 2a |

### 1c -- Registry persistence and declaration

| Task | Notes |
|---|---|
| Persist the source registry in `~/.config/flow/` -- **discovery and intent only**, never authoritative for availability (D#4, D#55) | Dispatch targets only live connections, so a stale entry cannot cause a phantom dispatch (**T-10** closed by design) |
| Bind registry entries to the registration token rather than allowing free appends (**T-09**) | File-permission hardening is **dropped**: a same-user process already reads the config, execution store and provider credentials in the same directory, so it moves no boundary (T-09 downgraded to accepted risk) |
| `flow worker source` CLI + config schema to declare an entry (D#63) -- without it the `command` S1 implementation is unreachable | `ProjectPluginsConfig`'s passthrough is typed `[key: string]: ProjectFeatureSection \| undefined` (`PluginConfig.ts:29`), so the section must fit `{plugin, options}` or the type widens |
| **Each run registers itself so active projects can be listed (D#10)** | Was missing entirely; `ExecutionState` carries no project today |
| Record source id and worker id per step (**T-06**) | `ExecutionStore` |
| Document that labels are **routing, not authorization** (**T-07**) | Reference docs |

### 1d -- Label matching

Step-side `labels: [...]` matched as AND; declared on the source and inherited (D#7, D#30). A string where a list is expected fails loudly naming the unsupported form.

**Exit criteria** -- a source entry can be declared, persisted and listed; the daemon reads it at startup; `flow history` can name the projects with active runs; a forged `step_completed` for an unassigned step is rejected; existing flows behave identically because no dispatch decision consults the registry yet.

---

## Phase 2a -- `flow worker`: registration, auth, lifecycle

| Task | Notes |
|---|---|
| **Change `broadcastDone()` so it does not kill registered workers** (`Daemon.ts:252`, reachable from `checkShutdown()` at `:250-257` and from `handleWorkerClose` at `:245-248`) | **Without this the core deliverable stays broken**: the daemon still tells every connected worker to exit on idle. `hasActiveWorkers()` counts only `busy` (`WorkerPool.ts:162-164`). This is the implementation half of D#51-D#55 |
| New `flow worker` command: resolve project (Phase 0), authenticate, register, wait | No `worker` command exists today, so the registration point is clean |
| Declare the `authentication` (S7) extension point **here**, with the existing `health_token` (`FlowIndex.ts:107`) as its built-in default (D#21) | Declaring S7 only in Phase 4 would hardcode auth first and retrofit the interface -- the pattern this plan forbids |
| **Mitigates T-01 across users only.** A same-user process reads the token identically -- do not claim T-01 is closed | See the residual-risk section of the threat model |
| Per-source worker caps (D#64) so one registrant cannot absorb every dispatched step (**T-03**) | |
| Mechanism to attach a worker to **additional** projects beyond its launch directory (D#9) | Default stays the launch project; extra projects are explicit opt-in |
| Daemon startup asks each registered source's S1 plugin to produce a live worker. Nothing pins the daemon (D#51); the worker never polls (D#54) | |
| `flow worker list` / status output (Q#9) | |
| Document that an inbound worker runs with the launching user's shell environment, granting a step broader privileges than a forked worker (**T-08**) -- intentional, but stated | |

**Exit criteria** -- open a terminal in a project, run `flow worker`, see it listed; let the daemon idle out and confirm the worker is **still alive**; run a flow and confirm the worker is re-contacted; attach a second project explicitly and see steps from both.

---

## Phase 2b -- Dispatch — **gated on Q#37**

| Task | Notes |
|---|---|
| Declare `worker-acceptance` (S4); built-in default **permissive**: a worker takes any step for its attached projects, labels only gating steps that demand them (D#22) | Labels are greenfield, so an exclusive default would leave a fresh worker inert |
| Declare `step-distribution` (S3); built-in default gives registered workers **priority** over forked ones (D#23) | Priority **orders acquisition, never caps it** (D#24) |
| Declare `provisioning` (S8); built-in default: bounded wait, then fork to cover remaining demand, warning by name (D#25). Timeout is a **plugin option**, not core config (D#26) | |
| Worker reports whether a step **had started executing** before the disconnect (D#65) | The classification lives with the only party that knows it |
| *Assigned but not started*: `FlowScheduler.unacknowledge(stepId)` (`:375`, clears `inFlightSteps` with no outcome), then requeue via `CommandHandler`'s `readyQueue.unshift(step)` (`:516`) (D#62). No `retry` attempt consumed | **No `flow-engine` change.** `unacknowledge` has no re-enqueue side effect -- its doc (`:373-374`) says the consumer requeues, and its stated contract is exactly "the step was never sent" |
| *Already executing*: report it as a step failure via `complete(stepId, outcome)` (`:182`), so the author's declared `retry` / `onFailure` applies and the counter at `:228-236` governs | Prevents a half-run script silently restarting |
| Bound the re-dispatch count for the not-started path (D#62) | Otherwise a step nobody ever starts loops forever |
| Terminal display: structured step lifecycle by default, raw model output behind a verbosity level (D#31) | A worker handles one step at a time, so raw output never interleaves |

**Exit criteria** -- steps land on a registered worker in preference to forked ones; a parallel flow keeps its parallelism (priority does not serialize it); the S8 warning names an absent registered worker; closing a terminal mid-step re-dispatches without consuming a `retry` attempt; a worker that never returns exhausts the re-dispatch bound and fails with a clear message.

---

## Phase 3 -- Interactivity

No worker has stdin today, which is why interactive steps are blocked. Depends on Phase 2a.

| Task | Notes |
|---|---|
| Give the worker its own plugin resolution (D#35). **Hard prerequisite, not parallel work**: the approval provider is a factory (`createCliApprovalProvider`, `plugin-cli-approval/src/CliApprovalProvider.ts:24`) inside a plugin **package**, so the worker must load plugins | `PluginResolver` is used only in `Daemon.ts:78,88`. No isolation work: plugins are in-process, developer-written in v1 |
| Instantiate the approval provider **in the worker** (D#34) | Forced: it reads its own `process.stdin` (`:14`); the daemon's non-Windows spawn uses `stdio:'ignore'` (`RunCommand.ts:252-257`) so it has no stdin either way |
| Worker declares whether it has a user interface; **the worker alone decides** (D#33, D#36) | This is what `StepRunnerConfig.interactive` (`StepRunner.ts:50`) already expresses -- set it from the worker's TTY instead of the hardcoded `false` at `worker/Worker.ts:24` |
| Derive the requirement from the **step type only** -- `user_intervention` (D#60) | **There is no step-level `interactive` field**: zero hits in `flow-engine/src/types.ts`. An earlier draft claimed two derivable signals; only one exists |
| Lift the `user_intervention` block (`CommandHandler.ts:155-162`); leave `subflow` blocked (`:164-171`) (D#37) | Same error code for both -- a v1 scope line, not architecture. Both gates sit *after* validation, so the schema already accepts the step |
| Declare `interactivity-policy` (S9); built-in default: loud failure when no worker has a user interface, **for `user_intervention` only** (D#39, scoped by D#61) | A model step on a non-interactive worker simply runs headless -- there is nothing to fail |

**Exit criteria** -- a `user_intervention` step prompts in the worker's terminal and the answer advances the flow; the same flow fails loudly with no interactive worker available; a model step still runs headless on a non-interactive worker.

---

## Phase 4 -- Remote host providers

Deliberately last; everything above works without it. Split because the transport and the host protocol are independent.

### 4a -- Transport and authentication

| Task | Notes |
|---|---|
| Bind beyond loopback | Forced by D#17 |
| **P-5: nothing crossing the LAN in cleartext** -- credentials, payloads, labels, logs, metadata. Refuse an unencrypted non-loopback connection: **fail closed, never warn** | Requirement gate, not an extension point (D#29). Covers the display stream too -- no "just logs" channel (**T-12**) |
| S7 default extended for remote peers: shared token, `${ENV_VAR}` interpolated or file-referenced -- **never a literal in config** (D#44) | Project rule: literal secrets are a hard load-time error. S7 itself was declared in Phase 2a |
| Alternative S7 implementation: public/private keypair, giving per-machine revocation (D#28) | |

**Exit criteria** -- a remote worker registers over an encrypted channel; an unencrypted off-loopback attempt is refused; a payload is not readable on the wire; revoking a keypair blocks that machine.

### 4b -- Host-active protocol

| Task | Notes |
|---|---|
| Daemon-side S1 implementation for a host provider: it contacts the host and obtains workers through the single S1 method (D#52, D#53) | Resolves the tension with D#20 -- the *creation mechanism* lives on the host, but the daemon still needs an S1 implementation to reach it |
| The daemon obtains a worker by **calling the single S1 method and waiting** -- no demand channel, no snapshot/delta, no commitment negotiation (D#66). It does not fork while waiting; on timeout, D#25 applies | The wait is bounded by the S8 plugin's timeout (D#26) |
| The host never receives anything executable and is never started by the daemon (D#19). The creation mechanism itself lives **on the host** (D#20) | Contains T-13 by design |
| Authenticate **source** registration separately from worker registration (**T-04**, **T-11**) | A fake source manufactures capacity wholesale, far worse than a fake worker |

**Exit criteria** -- a second machine registers as a source, declares a capacity, and supplies workers on demand; a source credential cannot be used to register as a worker or vice versa; a compromised daemon cannot make a host run an arbitrary command.

---

## Cross-cutting requirements

- Tests co-located, min 70% coverage (90% for business logic). TDD: red phase verified before implementing.
- Run `npm run build` on `flow-engine` before type-checking dependent packages.
- Use the `check` skill after each task; full `npm test` before declaring any phase complete.
- No new barrel files; `extension-points/src/index.ts` is the pre-existing exception and must be extended for each new point.
- Multi-line `if`/`return` with braces; PascalCase filenames matching the exported class.
- `flow-engine` stays pure -- no process lifecycle, no I/O. All connection awareness lives in `flow-cli`.
- `flow worker` is published via CI like the other CLIs; source edits alone do not change the installed binary.

## Threat coverage map

| Threat | Phase | Note |
|---|---|---|
| T-01 spoofing | 2a | Mitigated **cross-user only**; same-user residual documented |
| T-02 payload disclosure to an impostor | 2a + 4a | Bounded by T-01 locally, closed on the wire only by P-5 in 4a |
| T-03 DoS via fake idle workers | 2a | Per-source caps (D#64) |
| T-04 fake source asked to provision | 4b | Separate source-registration auth |
| T-05 falsified step results | 1a | Results bound to the issued assignment |
| T-06 repudiation | 1c | Source id + worker id per step |
| T-07 labels mistaken for authorization | 1c | Documentation |
| T-08 inbound worker privilege breadth | 2a | Documented and accepted |
| T-09 registry tampering | 1c | Token-bound entries; file hardening dropped as boundary-neutral (accepted risk) |
| T-10 stale registry | -- | Closed by design (D#4): dispatch requires a live connection |
| T-11 fake host provider | 4b | Same task as T-04 |
| T-12 cleartext on the wire | 4a | P-5, fail closed |
| T-13 daemon-driven remote execution | -- | Contained by design (D#19) |
