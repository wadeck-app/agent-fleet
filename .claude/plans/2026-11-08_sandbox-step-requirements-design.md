# Step requirements instead of `workerType` (design note for flow-owner)

Status (2026-11-14 addition): the implicit `agent` requirement is PER PROJECT (core cb097f7f, decision record `2026-11-13_implicit-confinement-per-project.md`): a source covers a run only if its entry has no `projects` option or lists the run's project id; `--option projects=a,b` is how the sandbox source is scoped, and `projects` is the only option name the core reads. A model step of an unserved project routes as before with a per-step warning naming the sources that serve other projects. Status (2026-11-13 addition): the implicit `agent` requirement applies to every model step whatever its tool; codex and opencode steps run in the sandbox as plain prompts (no injected MCP server, no hooks; README "Codex and OpenCode steps"), claude as before. Status (2026-11-09): implemented, including phase B (implicit `agent` for model steps: core f6c53f8d, plugin e2e and README). `workerType` is a validation error (`WORKER_TYPE_REMOVED`) in the core (24d770f2); `exclusive` is gone from the plugin: a source declaring non-empty `guarantees` is requirement-only and its workers do not count against `queue.concurrency` (D-concurrency row below). Plugin side: guarantees, workspaces, `RequiresGuard`, host scripts (D4), e2e and live checks moved to `requires: [sandbox]`. Earlier text: proposal, revised after flow-owner's review. Core step 1 is implemented by flow-owner; this note does not ask for core code from sbx. Plugin work waits for his contract. Source: plan `2026-10-25_docker-sandbox-worker.md` section 10 and the user's constraints of 2026-11-07/08. Each choice gives pros, cons and a recommendation. Claims about today's code were checked against it (table at the end).

## Constraints (fixed by the user)

1. Model steps always run in the sandbox.
2. Code the agent wrote (tests, build) runs in the sandbox.
3. The sandbox worker runs scripts itself, never through another worker.
4. A flow states requirements (keywords or `key=value`), never a worker type. `workerType` and `exclusive` are removed.
5. Host tools for a model step belong to the separate tool-provision MCP plan: out of scope.

## Vocabulary

| Term | Meaning |
| --- | --- |
| Requirement | A keyword or `key=value` a step needs from the worker that runs it. Own field next to `labels`, never part of it. |
| Guarantee | A requirement a worker's SOURCE INSTANCE vouches for. Never self-declared by the worker. |
| Profile | A named set of requirements, built-in or from configuration. |

Guarantees: `fs=confined`, `env=clean`, `net=filtered`, `ports=private`, `fs=readonly-enforced`, `clean=run|step`. `shell=` is not a guarantee: it stays derived from the worker's `shellCapabilities`.

## Choices

### D1. Where guarantees come from (B1) and where they are checked (B2)

| | |
| --- | --- |
| Pros | A guarantee is only as good as its source of truth. Workers declare labels themselves (`--labels`, `updateWorker`; labels are "routing, never authorization", T-07), so a host worker started with `--labels fs=confined` would attract confined steps and run them unsandboxed. The authenticated source instance is the same trust anchor `exclusive` uses today. |
| Cons | Needs a new field on the worker-type instance and a static twin. |
| Recommendation | The core reads `guarantees` from the built `WorkerTypeInstance`, like `exclusive`, and fails closed: no built instance means no guarantees. The plugin also declares them statically in its manifest, so demand coverage knows which source to ask before an instance exists and validation can say "no declared source can ever provide X". An instance may not claim more than its manifest (the build fails). Worker labels never contribute. The check is a hard filter in `StepRouter.servableBy`, before S4: `DefaultWorkerAcceptance` is replaceable, a plugin could return true. |

How the sandbox plugin declares them (contract of core step 1): `guarantees: string[]` under `implementations['worker-type'].<impl>` in `plugin.config.js` (static) and the same list on the instance (authoritative, must be a subset). Values, each backed by a test or a measurement (plugin README, "Requiring guarantees"): `sandbox`, `fs=confined`, `env=clean`, `ports=private`, `clean=run`. NOT declared: `net=filtered` (raw TCP to public destinations unverified; an allow-all machine policy would make it false) and `fs=readonly-enforced` (no `:ro` mount in the exec variant yet). The source stays `exclusive: true`.

### D2. Profiles and their contents (B3, H3)

| Profile | Requirements | Use |
| --- | --- | --- |
| `agent` | `fs=confined`, `env=clean`, `net=filtered` | model steps |
| `inspect` | `agent` plus `fs=readonly-enforced` | review steps that must not write |
| `untrusted-code` | `agent` plus `ports=private` | tests, build, anything the agent wrote |
| `hermetic-test` | `untrusted-code` plus `clean=run` | tests that must not see earlier runs |

`inspect` and `fs=readonly-enforced` avoid the clash with the workspace provider `readonly`, which is advisory (a flag and tool rules, no mount). A provider advertises `fs=readonly-enforced` only if a `:ro` mount enforces it.

`config.yml` may add profiles and may only TIGHTEN a built-in: an override must contain every requirement of the built-in (a superset), else the configuration is refused naming the missing ones. Pros: an admin cannot weaken `agent` by accident or by a planted config. Con: loosening needs a new profile name.

Unknown profile or requirement key fails validation with "did you mean". Values of known keys are checked (`fs=confind` fails naming the key).

### D3. Injected steps inherit the run's confinement (B3)

A model step can inject steps (`provideSteps`); today an injected step carries no labels and no binding of its own (the binding is read per execution). Without inheritance a prompt-injected model injects an unmarked script that runs on the host.

| | |
| --- | --- |
| Pros | One rule closes the injection path; no flow author action. |
| Cons | Injected steps cannot ask for less than their parent. |
| Recommendation | An injected step gets the resolved requirements of its parent plus the run's. The daemon ALWAYS sends the resolved requirement set in the assign message; the wrapper REFUSES an assign without the field (fail closed, no default), so an old daemon or a bug cannot downgrade a step. |

Status (2026-11-14 addition): an injected step (`provideSteps`) of ANY type, script included, inherits the run's effective requirements, the implicit `agent` set included (core cf068dba, 01b52cdd, 59ce5512; `StepPlacementBuilder` / `RunRequirements` no longer test `type === 'model'` for injected steps; `InjectedStepGuard`, 3fa132ab, limits type to script|model and `skipPermissions` / `host` to false). The run records `requirements.implicit` whenever a source covers the set and the flow has a model step (`steps` may be `[]`); `implicit.steps` lists the declared model steps that received it, injected steps are not listed. Unit-tested in the core only, not run end to end. Not pinned by an e2e of ours: the engine's Claude mock cannot call `provideSteps` and a test client cannot stand in for the sandbox worker holding the model step; flow-owner's requested e2e (an injected `type: script` in an implicit-only run lands in the sandbox, never on a host worker) is documented, not written.

Implicit `agent` for model steps is NOT part of the first steps (H5): on a machine without a sandbox source every existing model flow would become unplaceable. It arrives with the step that removes `workerType`, together with a clear failure message.

### D4. Where a script runs on a sandbox-bound run (revised)

Decision (safe default, reversible): on a sandbox-bound run EVERY script runs in the VM, as today. A script runs on the worker's host only with an EXPLICIT per-step marker added by a later core step. A flow that has model steps and uses the marker on any script must place every script explicitly (the marker or a profile): otherwise validation ERROR naming the unmarked scripts. No silent default in a mixed flow, and no warning.

The earlier proposal (unmarked scripts run on the worker host, plus an ordering lint) is withdrawn. Why, all accepted:

| # | Attack or gap | Evidence |
| --- | --- | --- |
| a | The model plants files, `.git/config`, hooks, fsmonitor, filter drivers, `core.sshCommand`, package scripts; a following host script runs them with the user's rights | Measured in `PoolSlotLiveCheck` (T-16): the sandbox can write them, mutating git calls run them on the host |
| b | Cross-run poisoning: run N plants in the slot, run N+1 starts with the documented `sync` step as an unmarked host script, before any model step | `schema-reference.md`, pool: "Make the first step bring the slot to a known state" is a script. The ordering lint cannot see it |
| c | Step outputs templated into script text (`${{ steps.x.outputs.* }}`) inject onto the host | The template renderer does this; `SCRIPT_BODY_INTERPOLATION` already warns because the risk is known |
| d | The ordering lint misses parallel siblings | By construction: no `depends` edge |
| e | The owner-only ACL (`PrivateAcl`) protects against OTHER OS users only, not a script of the same user | It is not a remedy here and is no longer cited as one |
| f | Nothing filters the environment of a host script | `VmEnvironmentFilter` exists only on the VM path; the engine runs scripts with `isolateEnv: false` unless the executor says otherwise (README, "ScriptStepExecutor"): the wrapper's whole environment would be passed |

| | |
| --- | --- |
| Pros | Today's behaviour is kept (a flow that works now keeps working); the weak boundary needs an explicit, reviewable marker; host steps (`git push`, deploy) stay possible. |
| Cons | A VM script cannot reach host tools or credentials; the first host marker forces explicit placement of all scripts in model flows. |
| Recommendation | Ship the safe default now. Design the marker (name, flow-level or step-level) with the tool-provision plan, which is where host tools belong. |

**Status: implemented (plugin side), 2026-11-09.** The marker is the step field `host: true` (script steps only, core validates); the assign carries it top-level only when true. The wrapper serves such a step itself, outside the sandbox lifecycle, with `requires` still enforced. Row f is closed by `HostScriptEnvironment` (allow-list, not the whole wrapper environment). Rows a to d are not closed by the plugin: they are the user's explicit choice, warned by core (`HOST_SCRIPT_WITH_MODEL_STEPS`). Deviation from the text above: core warns instead of erroring on a mixed flow. See README, "Host scripts".

### D5. Run affinity

| | |
| --- | --- |
| Pros | Steps of one run share a warm sandbox (about 8 s saved per sandbox; files stay). |
| Cons | A hard rule blocks the run when its worker is busy. |
| Recommendation | Best-effort preference (S3 ordering): the worker that served the run first. A strategy plugin may come later. The earlier line "a worker without the requirement serves a step only for a run it already serves" is dropped: no such rule exists in the code. |

### D6. Read-only

The workspace mode is a ceiling; a step guarantee can only narrow it; a step asking for write on a read-only workspace is a validation error.

| | |
| --- | --- |
| Pros | One rule; the enforced guarantee is separate from the advisory workspace flag. |
| Cons | A read-only step inside a read-write run needs a second sandbox with the workspace as a `:ro` secondary mount (about +8 s), because mounts are fixed at creation. |
| Recommendation | As stated. Open point O1: the primary mount must be read/write, so a whole-run `:ro` workspace needs another primary (the run's `.meta`). |

**Status: implemented for the whole run (2026-11-09).** `RunMounts.readOnlyWorkspace` builds `.meta` first (read/write primary) and the workspace `:ro`; the wrapper derives it from the assign's `requires`, refuses a run whose steps disagree and a mount set that does not match, and refuses `host: true` with the requirement. `fs=readonly-enforced` is declared in the manifest and on the instance after the live proof (`PluginLiveCheck` with `profile: inspect`, `ReadOnlyLiveCheck`; one machine, host-side virtiofs). Not implemented: a read-only step inside a read/write run (second sandbox).

Evidence that `:ro` is enforced by the host side (virtiofs): as root in the VM, remounts, a new mount namespace, a second virtiofs mount of the share and `mount(2)` all failed with `Read-only file system` and the host file was unchanged (sbx 0.51.0, one machine; plugin README, "Mounts: links and read-only"). Not tested: protocol-level or kernel attacks.

### D7. Time and place of failure (H1, H2, B5)

| Question | Answer |
| --- | --- |
| Can `flow validate` say "no worker provides X"? | No. The offline validator has no worker knowledge (`FlowFileValidator` builds the engine validator without worker types). It checks shape, profiles and values; the missing-guarantee check happens at run start in the daemon. Say so in the docs. |
| Which workspaces does the sandbox accept? | The plugin declares its accepted workspace providers (today: `pool`) statically; the core validates the flow against that. Today `SandboxableWorkspace` refuses at the first step, late. |
| A step needs a guarantee nobody provides yet | Bounded wait like `workerType` today (`worker.boundStepWaitSeconds`, default 120 s), and immediate failure when no declared source can ever provide it (static manifest). The failure names the missing requirement. |
| Concurrency | `exclusive` also exempts sandbox workers from `queue.concurrency` (`WorkerProvisioner`): removing it must replace the exemption by "workers whose source declares guarantees do not count", or the old stall returns (one sandbox worker blocking every unbound run). |

### D9. Accepted workspace providers (H2): implemented (core 1e3e5428, plugin side done)

| Aspect | Final contract |
| --- | --- |
| Manifest | `workspaces?: string[]` under `implementations['worker-type'].<impl>`: static upper bound. The sandbox plugin declares `['pool']` |
| Instance | `WorkerTypeInstance.workspaces?: string[]` may only narrow the manifest list; a kind outside it fails the build. The plugin declares `['pool']` too; a test keeps manifest, instance and `SANDBOX_WORKSPACE_KINDS` equal |
| Entries | Built-in kinds only: `in-place`, `pool`, `readonly`, `worktree`. An unknown kind, a non-list or an empty list fails when the manifest loads, listing the known kinds. Absent: no restriction |
| Run start | Refusal code `WORKSPACE_KIND_NOT_ACCEPTED`, before any allocation. The check uses the manifest; an instance that narrows further is enforced at placement only |
| Routing | `StepRouter` filters on the workspace kind after the requirements filter |
| Offline | `flow validate` has no source knowledge (D7): the check runs at run start |
| Plugin | `SandboxableWorkspace` stays as defence in depth: the kind is coarse, the layout is what protects (a pool slot containing the project is still refused) |

Caveats: a configured NAMED provider instance (`plugins.instances.<name>`) cannot be listed in a manifest, so a restricted source never accepts a flow that names one. This does not affect the documented pool setup (the inline form `workspace: { provider: pool, ... }` is the kind `pool`). Observed while testing it (2026-11-08, one machine): a global `config.yml` with only `plugins.instances` makes the daemon refuse to start ("No workspace provider configured", `resolveAll` requires one), and `plugins.workspace` is not declared in the global config schema, so a named instance could not be configured at all in the isolated test: reported to flow-owner, not blocking.

### D8. Where resolved requirements live (B4)

| | |
| --- | --- |
| Pros | A resume uses the stored set and never re-resolves, so a configuration change cannot change a running or resumed run. |
| Cons | A new field in the execution record. |
| Recommendation | Store the resolved set in the EXECUTION RECORD at accept (not in `definitionSnapshot`, whose contract is the exact file text and its hash, `RunDefinitionLoader`). Today the binding of a run to a worker type lives in an in-memory map of `ExecutionRegistry`; requirements should not repeat that. |

## Core versus plugin

| Core (flow) | Sandbox plugin |
| --- | --- |
| Static `workspaces` check at run start (D9): done | Declares `workspaces: ['pool']`: done |
| Requirement syntax, known keys and values, "did you mean" | The list of guarantees it can enforce: manifest (static) and instance (authoritative) |
| Profiles: built-ins, tightening-only overrides, unknown name fails | Accepted workspace providers, declared statically |
| Hard filter in `StepRouter.servableBy` before S4; refusal naming the missing requirement | `fs=confined`, `env=clean`, `net=filtered`, `ports=private`, `clean=run|step`: enforcement in the VM |
| Resolved set in the execution record; injected steps inherit; assign always carries the set | Wrapper refuses an assign without the set; every script in the VM (as today); `SandboxableWorkspace` stays as defence in depth |
| Bounded wait, immediate failure when no declared source can provide it; concurrency rule for guarantee-declaring sources | `fs=readonly-enforced`: done, advertised after the live proof |
| Host-script marker and the mixed-flow ERROR (later) | Leftover command and ACL on its secret files, unchanged |
| Remove `workerType` and `exclusive` with implicit `agent` for model steps (last) | Drop the worker-type declaration and the exclusivity paragraphs of its README |

## Migration

1. Core, additive, flow-owner: requirements field, matcher, guarantees on the instance and in the manifest, hard filter, record. No implicit `agent`, no profiles yet. `workerType` keeps working and resolves to requirements internally.
2. Plugin, after his contract: declare guarantees and accepted workspaces; nothing else changes (scripts already run in the VM).
3. Core: profiles with tightening-only overrides; injected-step inheritance; the assign field; the wrapper refusal and its test.
4. Core and plugin: bounded wait, immediate failure, concurrency rule for guarantee-declaring sources.
5. Later: the host-script marker and the mixed-flow ERROR (with the tool-provision plan).
6. Last: implicit `agent` for model steps, remove `workerType` and `exclusive`, migrate flows and e2e, pin "an unbound flow with a model step still lands in a sandbox" in `SandboxPluginE2e`.

## Open points

| # | Question | Default if undecided |
| --- | --- | --- |
| O1 | Whole-run read-only needs another read/write primary mount | Resolved: the run's `.meta`, verified live (2026-11-09): reading, failing writes, `.meta` outputs and the model's session store all work |
| O2 | `clean=step` costs about +8 s per step | Accept; say it on the profile |
| O3 | Name and level of the host-script marker | Decided with the tool-provision plan |
| O4 | Name of the requirements field next to `labels` | Core decides |

## Verified against the code

| Claim | Where |
| --- | --- |
| Worker labels are self-declared and "never authorization" | `LabelMatcher.ts` header; `Protocol.ts` (worker `labels`, T-07) |
| `exclusive` is read from the built instance, fail-closed otherwise | `WorkerTypeInstances.isExclusive`; `extension-points/src/worker-type/v1.ts` |
| Binding is kept in memory per execution; injected steps carry no labels | `ExecutionRegistry.bindWorkerType`; `StepInjection.ts`; `StepDispatcher.placementFor` |
| Acceptance is a replaceable plugin; the type filter runs before it | `StepRouter.select`, `servableBy`; `WorkerAcceptanceProvider` |
| No rule "a worker without the requirement serves only a run it already serves" | grep of `StepRouter`, `StepDispatcher`, `ExecutionRegistry`, `WorkerRegistry`: none (the line came from the brainstorm) |
| Offline validation has no worker knowledge | `validation/FlowFileValidator.ts` builds `EngineFlowValidator(undefined)`; `RunDefinitionLoader` passes `knownWorkerTypes` |
| The snapshot is exact text and hash | `RunDefinitionLoader` comment above `new FlowValidator` |
| `exclusive` exempts workers from the concurrency limit | `WorkerProvisioner.countedLive` |
| Bound wait default is 120 s | `DEFAULT_BOUND_STEP_WAIT_MS`; `worker.boundStepWaitSeconds` |
| Every step process runs in the VM today; VM env filter only there; `isolateEnv: false` | Plugin README (`PluginLiveCheck`, ScriptStepExecutor note); `VmEnvironmentFilter` used only by `src/exec`; `ScriptStepExecutor` `isolateEnv` |
| The documented `sync` step is a script | `schema-reference.md`, pool section |
