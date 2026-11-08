# Plan: Docker sandbox worker (sbx plugins)

**Spec:** .claude/specs/2026-10-25_docker-sandbox-worker/
**Status:** DESIGNED and reviewed once by a goldfish subprocess (findings applied, see section 8). Not reviewed by the flow/plugin owners. Nothing implemented. Technical facts and PoC results: `research-findings.md`. Items marked NEEDS CONFIRMATION are decisions taken under delegation that the user must confirm before the milestone that depends on them.

## 1. Scope in one paragraph

Deliver (a) a queue-style plugin system for flow replacing the manifest system, (b) a "worker type" extension point through which a plugin provides workers and the daemon can talk to them, (c) the existing worker kinds extracted into plugins, (d) a shared sandbox layer, (e) two sandbox worker plugins (relay and exec variants) compared by a benchmark. Iteration 2 (remote wrapper) is out of this plan except for keeping the bridge core reusable.

## 2. Implementation rules

Repo rules apply: PascalCase file per class, no barrel files, dependency injection, fail fast (no silent fallback), tests next to code (>70%, 90% for business logic), mock CLIs only in automated tests (`SBX_MOCK_PATH`, same fidelity rules as `.claude/docs/mock-fidelity.md`), run the `check` skill after each task. Windows first; paths go through one `PathTranslator`. Live checks against the real tool are scripts in a gated folder, run by hand, never in CI.

## 3. Components

| Component | Responsibility | Notes from the PoCs and the review |
|---|---|---|
| `SandboxRuntime` | create, exec (stdin, env, cwd, streaming), stop, start, remove, list, copy, per-sandbox policy allow, per-sandbox secret | One `sbx` implementation, one fake; no other class builds `sbx` command lines |
| `SbxCliRuntime` | `shell:false`, argument arrays, Windows paths for `--env-file` and mounts, `--json` parsing, pinned version | `set-custom --host` takes no port; the placeholder must be passed with `-e`; `exec -d` is unsupported |
| `SbxPrerequisiteCheck` | tool present, pinned version, signed in, network policy initialized, daemon reachable; REPORTS the active network mode (warn when not deny-all) and the SSH agent forwarding setting (must be off or explicitly accepted, decision 30); never changes machine settings | Each failure carries an actionable message (decision 23) |
| `SandboxLifecycle` | One sandbox at a time per worker, created at the first assignment of a run, named from the wrapper id and execution id (owner marker); removed only on end-of-run or cancel; a wrapper that exits or restarts stops its sandboxes and never removes them | Relay variant: the wrapper owns an idle timer (default 5 min, re-armed at step end) because the open inner-worker session keeps the VM up; on idle it stops the VM, and on the next assignment it restarts it and relaunches the inner worker, which re-registers through the bridge. Exec variant: sbx stops an idle VM by itself after ~30 s, so no timer is needed. Background processes die on every stop |
| Step timeout | A step that times out is failed and its sandbox is stopped (host-side abort does not kill the process in the VM); the next step restarts it | A worker runs one step at a time (worker loop), so a stop never kills a sibling step |
| `RunMounts` | Mounts exactly the run's workspace and `.meta`; rejects a `cwd` outside them; logs a warning when the workspace is the user's project directory (manual mode) | Sibling runs invisible (verified); git inside a worktree workspace is unsupported (out of scope) |
| `PathTranslator` | `C:\x` <-> `/c/x` for `workspaceDir`, `outputsDir`, `cwd`, `workspaceMetaDir`; every translated or returned path must stay inside the two mounts (canonical path, no symlink following); Windows-looking paths in step env or script text are NOT translated and trigger a validation warning | Test with env and script content |
| `ToolStoreRedirect` | Per tool, env placing the store under `<meta>/sessions/<tool>`: `CLAUDE_CONFIG_DIR`; `CODEX_HOME` (directory created first, settings passed with `-c`); `XDG_DATA_HOME` for OpenCode | Resume across sandboxes verified for all three. Codex writes ~10 000 files at first start (plugins clone) |
| Provider secrets | API-key providers (OpenAI, Anthropic, ...) through `sbx secret set` scoped to the sandbox; Codex OAuth unsupported (needs a host browser) | Only Bedrock is validated; M2 must cover one API-key provider |
| `HostCredentialEndpoint` | Node HTTP server, loopback only, inside the wrapper; one random bearer secret per sandbox given to sbx with `set-custom --command` (never on a command line, secret file private and removed with the sandbox); the secret maps to the set of host profile aliases that sandbox may use; serves `aws configure export-credentials --format process`; actionable error when SSO expired (`aws sso login --profile P`), no automatic login; logs issuance (alias, time) | Residual: the agent can request and use credentials during the run. The injected secret reaches every request to host `localhost` (the flag takes no port), so only wrapper-owned services may listen on allowed ports |
| `SandboxNetworkRules` | Per-sandbox allow rules (always with `--sandbox`; a test asserts no global rule is ever added): endpoint port, bridge port, model hosts per region and tool; removed with the sandbox | Cannot tighten egress below the machine policy (deny wins). Codex also needs github.com and the Bedrock mantle host |
| `LeftoverSandboxes` | Lists the plugin's sandboxes with owner marker, wrapper id, execution id, age; reports at start-up; removal is an explicit command that refuses a sandbox whose run or wrapper is alive and requires its name | Never automatic |
| Limits and options | `cpus` (default 2), `memory` (default 2g), `maxConcurrentSandboxes` (default 4), `idleStopMinutes` (5), `profiles` (alias -> host AWS profile), `extraAllowedHosts`, `image` | Defaults are starting points, tune with the benchmark |
| Sandbox image | One template with node, git, bash, the flow worker bundle (relay) and claude/codex/opencode | Stock agent images contain only their own CLI; spike M0. NEEDS CONFIRMATION (decision 20): pinned `sbx` version, image build and storage |
| `BridgeCore` | Accepts the inner worker, authenticates it with a per-sandbox token, applies the allow-list below, rewrites and checks paths, forwards end-of-run and cancel inward, writes the inner stderr to the daemon log, logs every dropped message; reusable for nesting | Token on the WebSocket upgrade through the proxy placeholder is UNVERIFIED: gate G1 |
| Relay plugin | Launches the flow worker in the sandbox (`FLOW_DAEMON_WS_URL` -> bridge on `host.docker.internal`) | WebSocket VM to host verified |
| Exec plugin | Engine on the host; model CLIs and scripts through `sbx exec`; needs C4 | MCP bridge: one allow rule per step (random loopback port), callback host override, `mcp-server.cjs` in the image; 8 step-process spawns + CompactHook + ~9 binary lookups |

### Closed message set (decision 21, NEEDS CONFIRMATION)

From the inside to the daemon: `ready` (registration, rewritten by the bridge), `log`, `step_started`, `step_progress`, `step_completed`, `step_failed`. `inject_steps` only for a step that is already allowed to inject today and with the same validation the daemon applies to any worker (to be checked against the code in M6). Everything else is dropped and logged. From the daemon to the inside: `assign` (paths rewritten), the end-of-run and cancel events; `idle` and `done` are not forwarded. The exec variant has no such channel; its equivalent invariant ("the sandbox cannot add steps") is tested through the MCP tools.

## 4. Core work in flow (owners must review first)

| Id | Work | Depends on |
|---|---|---|
| C0 | Decide the worker-type contract with the user and the owners: extend `worker-source` v2 or a new extension point; the message set and authentication of provider-to-worker messages go into the threat model | owner review |
| C1 | Queue-style plugin system (registry, aliases, conflict detection, load errors listing built-ins, absolute-path fallback), options per implementation kept; migrate worktree, cli-approval, file-approval, none in the same change; tests prove `sensitiveFields` behavior is preserved or consciously replaced; flow COPIES queue's design, never imports it (`queue-relay-client` is private and relay-specific; queue-owner, 2026-10-26). Mirror `plugin-api.ts`: module-level registry, same name/alias with a different object throws and the identical object is a no-op, shape validated at registration, `loadPlugin` tries registry then `import()` (default, named `plugin` or module), one error naming module, cause, sorted built-ins and the fix, test-only reset. Queue has no lifecycle: flow defines its own (async factory returning `{run, dispose}`). The absolute-path fallback is a bare `import(path)`: test a Windows drive-letter path, it may need `pathToFileURL`. Keep the plugin contract in flow's own package | C0 |
| C2 | Worker-type extension point: provider loaded from a plugin; provider-to-worker channel; end-of-run and cancel events to all workers from `cleanupExecution`; lifecycle callbacks; a worker can declare it takes whole runs and the router prefers it for steps it can run (decision 27) | C1 |
| C3 | Extract fork, terminal/inbound, command and relay worker kinds into plugins | C2 |
| C4 | `ProcessLauncher` seam in `flow-engine` (exec variant only), default = current `spawn`, behavior-preserving | none |
| P1 | Prune `<meta>/sessions` with the run's `.meta`, and fix the existing gap that the `.meta` of plugin-provided workspaces is never pruned (coordinate with `flow-owner`) | none |

## 5. Milestones and acceptance

| M | Deliverable | Acceptance |
|---|---|---|
| M0 | Image spike | `sbx create` from the template; `claude`, `codex`, `opencode`, `node` run; build steps documented; size and create time recorded |
| M1 | `SandboxRuntime`, fake, `SbxCliRuntime`, `SbxPrerequisiteCheck`, `PathTranslator`, options | Unit tests green; every failure message of the prerequisite check is tested; live check script (gated) reproduces the PoC commands |
| M2 | `HostCredentialEndpoint`, `SandboxNetworkRules`, `ToolStoreRedirect`, provider secrets | Real Bedrock call from a sandbox for each tool and resume from a new sandbox (as in PoCs 2b and 6); one API-key provider call; no AWS key in the VM; a unit test shows the secret is per sandbox and an alias outside its set gets 403 |
| M3 | `SandboxLifecycle`, `RunMounts`, `LeftoverSandboxes`, limits | Tested against the fake runtime with a fake clock and simulated end/cancel events: created at first assignment, stopped after idle, removed only on end/cancel, nothing removed when a wrapper restarts, leftover removal refused for live runs; one live check of idle stop and restart |
| G1 | Gate: verify that the per-sandbox bridge token survives the WebSocket upgrade through the proxy placeholder | A live check passes, or the token design is changed before M6 |
| M4 | Dev harness: a standalone wrapper started by `built-in:command` (relay variant) while C0-C3 are reviewed. Run end is not signaled yet: the harness leaves sandboxes stopped and the user removes them with the M3 command. It is a development vehicle, not a deliverable | A flow with a script step and a model step completes in a sandbox; logs and `.meta` outputs are on the host |
| M5 | C0, C1, C2, C3, P1 landed | Existing plugin and worker tests green; worker kinds behave as before; end/cancel events delivered |
| M6 | Relay plugin on C2 with `BridgeCore` | Same flow as M4 as a plugin; end-of-run removes the sandbox; forged, unexpected or out-of-mount messages are dropped and logged (tested) |
| M7 | C4 and exec plugin | Same flow through `sbx exec`; the "cannot add steps" invariant is tested through the MCP tools |
| M8 | Benchmark relay vs exec | Report with start and per-step latency, CPU/RAM at N concurrent sandboxes, metadata fidelity (session id, tokens/cost, tool calls), cancel and leak behavior. The user decides which variant becomes default; no automatic threshold |

Manual acceptance runs (M1, M2, M4) happen on this machine; the evidence (command log and result) is saved under `.claude/temp/` and referenced in the milestone.

## 6. Risks and validations still open

- The sandbox tool is 0.x and proprietary: pin the version, keep every call in `SbxCliRuntime`, fail on mismatch.
- Windows 10 works locally but is outside Docker's documented list; Linux and macOS unvalidated.
- Egress equals the machine-wide policy (`balanced`: github.com and registries reachable); a per-sandbox deny-all is impossible (deny wins). NEEDS CONFIRMATION (threat T-05).
- Codex first start writes ~10 000 files into its store and needs github.com; find a setting to avoid it or accept and document.
- Behavior at N concurrent sandboxes (CPU/RAM, SQLite in WAL mode on the shared mount) is unmeasured.
- Step secrets are visible to the agent during the step (accepted residual, T-02).
- Daemon-API scripts and `cmd`/`pwsh` shells must run on a non-sandbox worker by label (decision 27); they are not detected automatically.
- The dev environment's guardrails block `.aws` paths and inline interpreters in scripts: live checks use script files and `AWS_CONFIG_FILE`.

## 7. Cross-team

`flow-owner` was told script steps have no timeout; the sandbox worker enforces its own through `sbx stop`. `flow-owner` and `plugin-owner` must review C0-C3 and P1 before they start.

## 9. flow-owner review (2026-10-26, read-only at HEAD d0db5d4c, file:line not yet spot-checked by us)

Supersedes sections 4 and 5 wherever they conflict. Verify each reference before relying on it.

| Id | Finding | Consequence for the plan |
|---|---|---|
| H1 | No send-to-everyone exists on purpose (`WorkerRegistry.ts:244-247`, pinned by `WorkerRegistry.test.ts:173`); broadcasting `done` broke `flow worker` | C2 events go only to workers that declare a new feature (e.g. `WORKER_FEATURE_RUN_EVENTS`) AND served a step of that run. Old workers log "Unknown daemon message" |
| H2 | `worker-source` v1 returns no handle on purpose (D#4) | C0 = a NEW `worker-type` extension point composing with worker-source; v1 is not stretched |
| H3 | Many consumers of `PluginManifest`: flow-core plugins, `PluginRoutes.ts`, `FlowDaemonController`, `FlowDaemonService`, `PluginsCommand.ts`, `.violations/rules/plugin-rules.ts`. Plugin points live in project registry config (`ProjectFlowConfig.ts` closed `PLUGIN_POINTS`); the daemon loads plugins from its LAUNCH project (`tryResolvePlugins.ts:67`) | C1 lands ADDITIVE (loader also reads old manifests); builtins and consumers migrate in later changes. A worker-type plugin ref goes in the worker SOURCE entry (global registry), not project config |
| H4 | Routing by preference is not isolation: distribution is order-only (`StepRouter.ts:79`), acceptance is not a security boundary (`:29`), injected steps escape flow labels (`RunStepPreparer.ts:83-101`) | C2 needs a daemon-side ACCEPTANCE rule: once a run is bound, only that worker type accepts its steps incl. injected ones; after 3 re-dispatches or sandbox down the step FAILS, never falls back to the host. Until then no isolation claim. Labels (`--labels sandbox` + flow `labels: [sandbox]`) already give opt-in routing with no core change: use them for the M4 harness and first benchmark |
| M | The bridge must rewrite `ready` with `attachedProjectIds` (host registry ids) and features `project-id`, `secrets`, `sub-step-session-resume`, else the worker is refused (`WorkerProvisioner.ts:152`); `contactDeclaredSources` passes `projects: []`; unknown plugin source providers throw at contact time (`WorkerSourceContact.ts:160`); source `options` get no literal-credential check; published bundle inlines everything: third-party plugins load only from an absolute plugins dir as plain JS (`PluginLoader.ts:352-370`); fork stays a statically bundled built-in | Add to M4/M6 acceptance and C2 |
| R | `cleanupExecution` releases the workspace fire-and-forget (`StepOutcomes.ts:280-284`, `ExecutionWorkspaces.ts:130-149`): a worktree can vanish under a live sandbox; "end of run" is not "run quiet" (siblings continue after terminal failure; no step cancel path); no end event on daemon stop or unanswered interventions; send to a dead socket returns false silently (`WorkerRegistry.ts:232-236`) | C2 needs an ack before release, an event on daemon stop, and a check of the send result |
| I | Invariants pinned by tests: `assign` carries `assignmentId` and unbound reports are dropped; `idle` never sent, `done` only to forked workers; `ready` after a step = free signal; re-dispatch max 3 only before `step_started`; after `step_started` a disconnect is terminal `worker_lost`; `step_progress` semantics; secrets only to workers declaring `secrets`; 1 MiB frame limit; windowsHide must NOT be used for forked workers | Do not change; add characterization tests first |
| C4 | The seam must carry timeout, process-tree kill and exit-time kill, not just spawn. Sites: ScriptExecutor 2, ClaudeLauncher 2, Codex 2, OpenCode 2, CompactHook `:95,137`. Script steps DO have `timeout:` seconds now (commit 77ab3431): section 3 and 7 were wrong. The opencode-managed-serve-lifecycle plan touches the same OpenCode spawns | Coordinate with that plan |
| P1 done | Landed in `5ed84140` and `128bc1ac` (reviewed by flow-owner): the `.meta` path is recorded in the execution record (`pluginMetaDir`) and pruned with it, by age only. Takeover of a shared `.meta` with a valid marker is kept. `activeMetaDirs` is not wired because pruning only runs at daemon start (`Daemon.ts:304`): if pruning ever runs live, pass `() => workspaces.activeMetaDirs()` to `pruneOldExecutions`. Pre-feature `.meta` directories and records lost leak (safe direction) | none |
| P1 (original finding) | Gap confirmed: `pruneProjectWorkspaces` only prunes `<project>/.flow/workspaces`; plugin `.meta` = `handle.path + '.meta'` (`ExecutionWorkspaces.ts:75`); no `sessions` dir exists yet | As planned |

Agreed order: P1 and C4 first -> characterization tests (no send-to-all, injected-step routing, plugin config loaded from the bundle) -> C0 as a short decision note (flow-owner's explicit OK required before core code) -> C2 minimal behind a feature flag + ack before release, then the acceptance rule as its own change -> C1 additive -> C3 one kind per change (relay first, fork last).

## 10. State and open points (2026-11-08)

History of the earlier progress notes is in git; this section is the current state only. DONE and tested (checked by flow-owner against integration 1e3e5428): C1-2 shadow logging, C1-3 registry-first, the C3 INBOUND ruling, C3-2 and C3-3, C2b `run_end`.

### Done

| Area | State |
| --- | --- |
| Package `packages/flow-sandbox` | M0 to M8 done: mounts, lifecycle, credentials, relay harness (parked), exec variant, plugin `sandbox.exec`; on integration |
| Core C0 to C4 | Applied by flow-owner |
| Plugin end to end | Real sbx 0.51.0 and real Bedrock: `PluginLiveCheck` 7/7 (script and model step in the VM, `sbx rm` about 0.5 s, pool claim released after the removal) |
| sbx 0.51.0 | Pinned, fixtures re-captured, banner and start notice absorbed, `exec` on a missing sandbox exits 125, image id check for the containerd store, image `flow-sandbox:m6` |
| Isolation of tests | `DaemonIsolationGuard`, `HostEnvironment` (real home only for the wrapper's sbx/aws children), `FLOW_DAEMON_PORT=0`, snapshots around daemon runs |
| Workspaces | A sandboxed worker accepts only `workspace: pool` (`SandboxableWorkspace`); meta derived from `outputsDir` |
| Slot hardening | Daemon reads: fsmonitor, hooks, filter drivers closed (flow-owner). Measured table in the plugin README and T-16 |
| Leftovers | `wrapper.cjs leftover list` and `remove` shipped in the artifact (decision 26) |
| Secrets on Windows | Owner-only ACL on the plugin's secret and env files (`PrivateAcl`); protects against other OS users only |
| D9 accepted workspace kinds | Core 1e3e5428 and plugin (`workspaces: ['pool']`): refused at run start with `WORKSPACE_KIND_NOT_ACCEPTED`, e2e on a real isolated daemon |
| Requirements, step 1 | Core (flow-owner): `requires:`, guarantees from the source instance, hard filter. Plugin: guarantees `sandbox`, `fs=confined`, `env=clean`, `ports=private`, `clean=run`; `RequiresGuard` in the wrapper. Design: `2026-11-08_sandbox-step-requirements-design.md` |

### Pending

| Item | Owner | Note |
| --- | --- | --- |
| Profiles (tightening-only config), injected-step inheritance, the assign field always sent | core | Design note, migration steps 3 and 4 |
| Implicit `agent` for model steps, removal of `workerType` and `exclusive` | core + plugin | Last step; pin "an unbound model flow still lands in a sandbox" in `SandboxPluginE2e` |
| `queue.concurrency` accounting once `exclusive` goes | core | "Workers whose source declares guarantees do not count" |
| Host-script marker and the mixed-flow ERROR | core | With the tool-provision plan |
| `net=filtered` and `fs=readonly-enforced` guarantees | plugin | Need a public-destination measurement and a `:ro` primary design (note, O1) |
| Realpath-resolved mounts (TOCTOU between check and `createMounts`) | plugin + core | Needs a path-translation change |
| Codex and OpenCode steps in the exec variant | plugin | Refused today |
| Relay harness | - | Parked prototype; its guard and requirements are not wired |
| Tool-provision MCP | user | Separate plan to write after the sandbox work: a generic MCP the worker offers a model, tools defined in the step, host credentials kept out of the VM, operator allow-list open point |
| `assertNoDirectProcessApi` should scan `src/**` with an allowlist | flow-owner (optional) | Also document that providers passed in `StepRunnerConfig.providers` keep their own launcher |

### Core open items (flow-owner)

1. Manifest `sensitiveFields?: string[]` (`extension-points/src/manifest.ts`) is dead metadata; only the baseline `SENSITIVE_FIELDS` is enforced (`LiteralCredentials.ts`). Being made a load-time warning "not applied" plus a test that the baseline cannot be weakened.
2. C3 FORK is not really migrated: `host.fork` is unused in production; the daemon builds its fork fallback directly.
3. C1 builtins migration (worktree, cli-approval, file-approval, none) is deferred on purpose.
4. C1-4 T-02 threat note is a GATE for whoever first wires a config-supplied absolute path or bare package into `loadPlugin` / `PluginModuleLoader` (no production consumer yet).
5. C4 `assertNoDirectProcessApi` scans only 6 launcher test files and static `import from`; flow-owner is hardening it (`src/**` with an allowlist, dynamic import, require, export-from).
6. C2c "never host fallback after N re-dispatches" is not traced; the requirements hard filter is its successor.
7. A `workerType` run with workspace in-place or readonly only gets the `WORKSPACE_KIND_NOT_ACCEPTED` check through `requires:`; moot once `workerType` is removed.
8. Deviation from the INBOUND ruling: the credential-in-URL check (userinfo, `token=` query keys) also applies to the `built-in:inbound` provider form (stricter, `WORKERS.md`).
9. C2-5 realpath mounts TOCTOU stays with sbx (pending table).
10. A global `config.yml` with only `plugins.instances` makes the daemon refuse to start ("No workspace provider configured") while `plugins.workspace` is not in the global schema: named provider instances cannot be configured (found in the D9 e2e).

### Not verified (say so in any claim)

- `credential.helper` planted in a slot: not triggered in the one test (inconclusive).
- Nested read/write mount of a subdirectory inside a primary mount: experiment not run.
- Restart of a stopped sandbox on a pool slot: only the mock covers it.
- Raw TCP to public destinations, and a VM-to-VM probe (identical private addressing): not testable as built.
- Everything measured on one Windows 10 machine, sbx 0.51.0, git 2.45.1.windows.1; Linux and macOS never run.

### Cleanup list for the user (nothing here was deleted by the agents)

| What | Where |
| --- | --- |
| `flow-test-iso-*`, `flow-sbx-exec-secrets-*`, `flow-sbx-slot-*`, other `flow-sbx-*` folders | `%TEMP%` |
| `pkg-*` scratch folders (tools, patches, snapshots, drafts such as `requirements-engine-draft.patch`) | `C:/Workspace_Tooling/` |
| Evidence folders | `agent-fleet/.claude/temp` (`poc-m2`, `m4`, `m7`, `m8`, `sbx-0-51`) |
| Loaded sbx templates `poc-m0`, `m0b`, `m2`, `m4`, `m7` (`m6` is the current image) | `sbx template rm` |
| Clone branches: `tmp-m6-5` and the superseded `sbx/*` (all but `sbx/requirements`) | `C:/Workspace_Tooling/agent-fleet-sbx` |
| Empty directory `packages/flow-engine/src/requirements/` | the clone |
| Gitignore `packages/flow-sandbox/image/opt-flow/*.cjs` | repository |

## 8. Review log

Goldfish subprocess review of the spec and this plan (2026-10-26): 1 CRITICAL, 12 HIGH, 11 MEDIUM, 3 INFO. Applied: threat T-03 contradiction fixed; routing conflict (decisions 4 and 15), wrapper cardinality and who starts wrappers decided (27-29, the last needs confirmation); leftover owner marker; milestone order (M3/M4 no longer depend on events before C2); bridge authentication gate G1; network limitation documented and measured; credential endpoint, read-side and DoS threats added (T-10 to T-14); contract decision C0; pruning item P1; API-key path in M2; stale references fixed. Not applied: moving all technical wording out of `_index.md` (decisions were reworded as outcomes; the extension-point file stays as a technical annex).
