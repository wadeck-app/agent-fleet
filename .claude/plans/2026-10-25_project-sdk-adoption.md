# flow: adopt @wadeck-app/project-sdk

Status: proposal, no code written. flow is the last CLI with its own project logic; task and queue already use the SDK.

## Scope and principles

- The registry (`~/.config/project`, `project add <folder>`) is the only definition of "a project". flow stops walking the disk for markers.
- Fail loudly: no `.git` / `.flow/config.yml` / `.flows` / `.agent-fleet` fallback. No transition shim (see D7).
- `projectRoot` stays on stored data (old records must read); `projectId` is added next to it.
- Reference implementations to copy: `C:\Workspace_Tooling\task\packages\task-service\src\resolveProject.ts` (flag > env > cwd, `withNativeFolder`, `describeResolution`) and `C:\Workspace_Tooling\queue\packages\queue-cli\src\cli\pushProject.ts` (`-p/--project`, `QUEUE_PROJECT`, error = message + `err.hint`).

## Current flow logic (facts)

| Where | What it does today |
|---|---|
| `flow-cli/src/config/DefaultProjectResolver.ts`, `ProjectResolverFactory.ts` | Walks up: `.flow/config.yml`, else `.git`; legacy files -> `LegacyProjectLayoutError`; else `ProjectRootNotFoundError`. `tryResolve` returns null when no project. |
| Callers of the factory | `daemon/RunRequestHandler.resolveProject` (per run cwd), `daemon/createDaemonCommands` (legacy refusal), `daemon/loadFlowHooks`, `daemon/tryResolvePlugins` (daemon launch cwd), `config/ConfigLoader.resolveProjectConfigPath` (process cwd), `cli/commands/FlowReference` (registered flows: `<root>/.flow/flows.yml`), `VersionsCommand`, `WorkerCommand` (process cwd) |
| `daemon/ProjectResolutionRefusal.ts` | Typed `PROJECT_RESOLUTION_FAILED` response; run outside any project is currently legal (`projectRoot` undefined, forked workers serve it). |
| `ExecutionRegistry.setProject`, `ExecutionStore.create`, `flow-core ExecutionState.projectRoot`, `ExecutionView.projectRoot` | Stored per execution, optional. |
| `StepDispatcher` -> `StepRouter` | `step.projectRoot` must be in `worker.attachedProjects` (paths) for a non-ephemeral worker. |
| `WorkerCommand`/`WorkerLaunch.buildRegistration` | Own project = `resolve(process.cwd())`; `--project <path>` (repeatable) and `FLOW_WORKER_PROJECTS` add paths. |
| `events/FlowEventMapper`, `FlowEventPublisher`, `QueueFlowEventPublisher`, `flow-engine FlowEventCatalog` | `projectRoot` in payload; push uses it as the queue `cwd`. |
| `extension-points/src/project-resolution/v1.ts` | Public extension point, returns `{projectRoot, via}`; no selection mechanism exists (D#15). |
| Web | `shared-frontend-backend flow-daemon.contract.ts` (`projectRoot` zod), `FlowExecutionHeader.tsx`. `app-module-flow`/`flow-core` module routes do not read `projectRoot` today (only `FlowRegistry(projectRoot)` in `web-backend DataStoreFactory`, monorepo root). |

## Decisions

- D1 Resolution order everywhere: `-p/--project <ref>` > `FLOW_PROJECT` > cwd via `resolveScope` (name, alias or id; deepest registered path wins). A blank env is unset. An unresolved reference or unregistered cwd is an error: message + `NoProjectInScopeError.hint` (queue adapter pattern), with `--project "x":` / `FLOW_PROJECT="x":` prefix for explicit refs.
- D2 New `ProjectScopeResolver` (flow-cli/src/config, replaces `DefaultProjectResolver`+factory): `resolve({cwd, projectRef, env}) -> {id, name, path?, source, via}`. `path` = `requirePath(scope)`; virtual project with no path -> clear error where a path is required (flow needs `.flow/flows.yml`), allowed for read-only views.
- D3 Run outside any project: refused (`NO_PROJECT_IN_SCOPE`). Running a flow by file path from an unregistered folder is also refused (no unattributed runs). Removes the "forked workers serve it" special case; verify DefaultWorkerAcceptance (phase 1).
- D4 Daemon (singleton, many projects): the client resolves nothing. The `run` IPC command carries `{cwd, projectRef?, env: FLOW_PROJECT}` read in the client process; the daemon calls the resolver per request with the client's values and the registry dir from its own env (`XDG_CONFIG_HOME` of the daemon; mismatch with the client env is reported, see risks). `loadRegistry` has no lock and is cheap: reload on every request, no cache, so `project add` is seen immediately.
- D5 Data model (additive): `ExecutionState.projectId?: string` next to `projectRoot?`. New runs write both (`projectRoot` = `Scope.path`). Old records read unchanged; no migration of files. Event payload and `ExecutionView`/contract get `projectId` additive-optional; catalog gets a `projectId` property in the same optional lists as `projectRoot`.
- D6 Display: `flow history` / `show` / web header show `name (id)` resolved from the registry when `projectId` exists and is live or soft-deleted (`loadDeleted`); `<id> (removed)` when gone; old records show `projectRoot` as today with a `-` for id. No lookup failure may break a listing.
- D7 No logged transition. A project not yet registered fails with the SDK hint plus a flow line: `Run: project add "<folder>"`. Justified: the user has few projects and `project add` is one command; a fallback would keep the two definitions of "project" alive. If the owner overrides (Q1), the only acceptable shim is: legacy walk-up used only to print "register it with project add <root>" inside the error, never to run.
- D8 Worker routing: `attachedProjects` becomes project ids; registration sends `{attachedProjectIds, attachedProjects(paths, kept for old daemons)}`. `StepRouter` matches on `step.projectId`. `flow worker --project <ref>` (repeatable) now takes a name/alias/id (a path is an error naming `project add`); own project = flag/env/cwd scope. `FLOW_WORKER_PROJECTS` holds refs. Worker working dir = the project's path.
- D9 Config/data placement (phase 2): `projectToolDir(dir,id,'flow','config')` holds `config.yml` (hooks, plugins, project keys) and `projectToolDir(...,'data')` holds `executions/` namespaced by project: `data/executions/<executionId>.json`. `.flow/flows.yml`, `flows-custom.yml` and `.flow/workspaces/` STAY in the repo (versioned, shared with the team, referenced by relative `includes:`). Global stays in `~/.config/flow`: daemon port/pid, logs, worker.port, global `config.yml` (plugin instances), worker sources, secrets, `executions/` of the daemon (see Q2).
- D10 Config validation (phase 2): `FLOW_CONFIG_SCHEMA` with `plugins` (inherit/deep? see Q4), `hooks` (local), `wsPort` etc. (global). Layers from `getConfigLayers`, each `validateLayer(..., 'project')` for project files and `'global'` for the global file, then `mergeLayers`. A misplaced or unknown key is a `ConfigSchemaError` naming the file; this turns the current silent-ignore of unknown keys into an error (called out in release notes).
- D11 `project-resolution` extension point: kept as a type, marked deprecated and no longer consulted; `ProjectResolution` gains nothing. Removal needs the owner (Q5).
- D12 Queue events: payload gets `projectId` and keeps `projectRoot`; push keeps `cwd = projectRoot`, so existing `.queue` lookups work. Preferred: also pass the project id so queue skips cwd re-derivation (needs `QueueClient.publish` option, SDK-adjacent gap G5).

## Changes in dependency order

1. `flow-cli/package.json`: add `@wadeck-app/project-sdk` (and bundle config if the CLI is single-file). Check `npm run check` dependency rules.
2. New `flow-cli/src/config/ProjectScopeResolver.ts` (+ test). Wraps `loadRegistry/resolveScope/requirePath/describeResolution`, `withNativeFolder`, error formatting with `hint`. Registry dir via `defaultRegistryDir(env)`.
3. CLI flag/env plumbing: global `-p, --project <ref>` on `run`, `show`, `history`, `versions`, `validate`, `logs`; `FLOW_PROJECT`. Files: `cli/commands/{RunCommand,RunArgumentParser,ShowCommand,HistoryCommand,VersionsCommand,ValidateCommand,FlowReference}.ts`. `FlowReference.resolveFlowReference` takes the resolved scope instead of `ProjectResolverFactory`.
4. IPC: `ipc/Protocol.ts` `run` command gets `projectRef?`, `envProject?`; `RunDaemonSender` fills them.
5. Daemon: `RunRequestHandler.resolveProject` -> resolver (refuse on any error with `ProjectResolutionRefusal`, code kept `PROJECT_RESOLUTION_FAILED` plus `NO_PROJECT_IN_SCOPE` detail); `createDaemonCommands` drops the `LegacyProjectLayoutError` branch; `loadFlowHooks`, `pruneProjectWorkspaces` take the resolved path; `tryResolvePlugins` stops reading the daemon launch cwd (global config only until phase 2 per-run plugin config; see risks).
6. Data model: `flow-core ExecutionState` (+`projectId?`), `ExecutionView`, `ExecutionStore.create({projectId})`, `ExecutionRegistry.setProject(id, {projectId, projectRoot})`, `projectOf` returns both.
7. Events: `FlowEventMapper`, `FlowEventPublisher` types, `flow-engine FlowEventCatalog` (+ its generated docs test), `QueueFlowEventPublisher`.
8. Workers: `StepRouter`, `StepDispatcher` (step carries `projectId`), `WorkerLaunch.buildRegistration`, `WorkerCommand` (`--project <ref>`, own scope), `WorkerStartupBanner`, `SelfDeclarationManager`, worker registry summary (`flow worker list`), `packages/worker FlowWorker` untouched (its `--project-root=<path>` is a separate legacy worker).
9. Web: `shared-frontend-backend/src/api/flow-daemon.contract.ts` (+`projectId`), `FlowExecutionHeader.tsx` (name + id), via `frontend-dev` agent. `app-module-flow`/`flow-core` module routes: no change in phase 1 (verified: no `projectRoot` read); recheck when adding per-project filtering.
10. Remove `DefaultProjectResolver`, `ProjectResolverFactory`, their tests; mark `extension-points/project-resolution/v1.ts` deprecated.
11. Docs: `CLI_USAGE.md`, `.claude/skills/flow/SKILL.md`, `.claude/docs/flows/*` (replace "`.flow/config.yml` marks the project" with `project add`), `flow docs` output, lessons-learned.
12. Phase 2 (after 1-11 ship): `ProjectFlowPaths` (config/data dirs), `FLOW_CONFIG_SCHEMA`, `ConfigLoader` layers, `ExecutionStore` path, hooks/plugins read from the config dir.

## TDD test list (write first)

- Resolver: flag wins over env and cwd; env wins over cwd; blank env unset; alias and id resolve; unknown ref -> `ProjectNotFoundError` with suggestions; cwd in subfolder of a registered path; cwd through a junction; unregistered cwd -> message + hint; empty flag is an error; virtual project without path; corrupt registry -> `RegistryCorruptError` message actionable; `.git`/`.flow/config.yml` present but unregistered -> still refused.
- Daemon: two runs from two projects in one daemon get distinct `projectId`; `project add` between runs is seen; a refused run leaves no workspace, record or secret; client env `FLOW_PROJECT` honoured; run by file path outside a project refused.
- Store/view: record with only `projectRoot` reads; new record has both; `history --json` shows `projectId`; soft-deleted project displays `(removed)`.
- Events: mapper includes `projectId`; catalog test lists it; publisher still pushes `cwd = projectRoot`.
- Router: step with `projectId` matches a worker attached to that id, not to another; ephemeral worker unchanged.
- Worker CLI: `--project name`, `--project <path>` rejected with hint, `FLOW_WORKER_PROJECTS` refs, banner prints name (id).
- Fixtures: every integration/e2e test sets `XDG_CONFIG_HOME` to a temp dir and registers its temp project via the SDK (`addProject`); a shared helper in `flow-cli/src/__tests__/` (e.g. `RegisteredProjectFixture`). Affected: `CommandHandler.project.test.ts`, `StepRouter.test.ts`, `FlowEvents.integration.test.ts`, `RegisteredWorkerDispatch.integration.test.ts`, `SubStepSessionResume.integration.test.ts`, `DaemonShutdownRace.integration.test.ts`, `WorkerCommand*.test.ts`, `HistoryCommand/ShowCommand/RunCommand.action` tests. The test must never touch the real `~/.config/project` (SDK safety-net test pattern: see task `registrySafetyNet.test.ts`).
- Phase 2: misplaced key (hooks in global, wsPort in project) -> `ConfigSchemaError` naming the file; layers merge root-first.

## `_test-flow` and existing projects

- `_test-flow` is registered as `test-flow` (id `64f4ae91`; currently only a `queue/` tool dir). Its flows are owned by another session: no edit. After phase 1 it works unchanged because flow reads `<path>/.flow/flows.yml`; only its path must be registered (already). flow will create `projects/64f4ae91/flow/` only in phase 2.
- Agent-fleet itself (`.flow/flows.yml` here) needs `project add C:\Workspace_Tooling\agent-fleet` once, before the first run after upgrade.
- Migration of a user project: `project add <folder>` by hand. Error seen on an unregistered cwd: SDK `NoProjectInScopeError` message (cwd + registered projects) + hint, then flow's line `Register it with: project add "<folder>"`. No auto-registration.
- Legacy layouts (`.agent-fleet/flows.yml`, `.flows/config.yml`): `LegacyProjectLayoutError` disappears with the resolver; the move-files guidance must remain in docs only if the owner still supports those layouts (Q6).

## Risks

- Hard break for every unregistered project on upgrade; mitigated by the actionable error and release note, not by a shim.
- Daemon registry dir comes from the daemon's env, the client's from its own: if they differ (`XDG_CONFIG_HOME` set in one shell), resolution disagrees. Mitigation: client sends its resolved `registryDir`; daemon refuses with both paths when different.
- Daemon plugins/hooks today load from the daemon launch cwd (`tryResolvePlugins`): phase 1 keeps global-only for plugins, per-run project hooks keep working via `loadFlowHooks`. A project-level plugin config silently stopping is not acceptable: until phase 2, a project `config.yml` with `plugins:` read at daemon start is replaced by an explicit error at run time naming the file.
- Router: workers registered by an older flow-cli send paths only; the daemon must reject them with an "update the worker" message, not match silently.
- Project renamed/moved (`movePath`): old executions keep `projectRoot` (stale) but `projectId` stays valid; display prefers the id lookup.
- Flow workspaces are git worktrees under `.flow/workspaces` inside the project path, so cwd inside them resolves to the same project; worktrees created outside a registered path would not (verify).
- `app-module-flow` runs in the web server: needs the registry dir from its env; `resolveReference` + `mainPath` is the SDK-documented path (no cwd).

## Open questions (recommended default)

- Q1 Keep any legacy walk-up fallback? Default: no (D7).
- Q2 Executions dir: global `~/.config/flow/executions` (default, daemon reconciles all of them at start, simplest) vs per project data dir. Default: stay global in phase 2; add `projectId` filter only. Revisit if per-project retention is wanted.
- Q3 Run outside a project (flow by file path anywhere): default refuse (D3). Alternative: allow with `projectId` absent.
- Q4 `plugins` section scope: default `local` (a parent project must not change a child's approval/workspace plugin); `hooks` `local`; no `inherit` until a use case exists.
- Q5 Delete the `project-resolution` extension point: default deprecate now, delete one release later (no implementation can be selected today).
- Q6 Support the legacy `.agent-fleet`/`.flows` layouts: default drop the detector; docs mention the move once.
- Q7 `flow worker --project`: default switch to refs (D8); alternative accept path-or-ref (rejected: two meanings).
- Q8 Short flag `-p` on `run` conflicts? Default: grep existing `-p` usage before adding (none found in `cli/commands`).

## SDK gaps (for the SDK owner)

- G1 No registry override beyond `XDG_CONFIG_HOME` (README: "no registry override in v1"); a daemon serving clients with other env needs an explicit per-call `registryDir` contract and a way to compare two registry dirs.
- G2 No shared `--project/-p` + `<TOOL>_PROJECT` parser: task and queue each re-implement (`parseProjectFlag`, `withNativeFolder`); flow would be the third copy.
- G3 No lookup of a project by id that includes soft-deleted ones (`resolveReference` is live-only; `loadDeleted` must be scanned by hand): needed for history display.
- G4 No helper for "does this worker/other path belong to project X" by id; flow routing wants `projectIdOfPath(registry, path)` cached per call.
- G5 `queue` client `publish` carries only `cwd`; passing the project id is not supported (queue-side, not SDK).
- G6 `ConfigSchema` has no notion of a nested key schema (`plugins.<feature>` validation stays flow's job) and no `ConfigSchemaError` carrying file + key as typed data (only in the message).
- G7 `projectToolDir` kinds are `config|data` only: no place for rebuildable cache/logs per project (flow logs stay global in phase 2).
- G8 Worktrees outside the registered path are not recognised as the same project (git `--git-common-dir` link); verify and decide if the SDK should offer it.
- G9 `loadRegistry` has no mtime-based cache helper; a daemon reloading per request pays a parse each time (acceptable now).

## Phases

- Phase 1 (minimum slice, steps 1-11): dependency, `ProjectScopeResolver`, `-p/--project`, `FLOW_PROJECT`, per-request daemon resolution, `projectId` on executions/events/contract/UI, router by id, worker `--project <ref>`, legacy resolver removed, docs/tests. Ships alone and is complete: config and data stay where they are.
- Phase 2 (step 12): `projectToolDir` for `config.yml` (hooks, plugins) and optional data, `FLOW_CONFIG_SCHEMA` with `validateLayer`/`mergeLayers`; each moved file gets a hard error naming the old and new location if found at the old place (explicit, no silent read).
- Phase 3 (optional, owner decision): per-project execution dirs, parent-chain inheritance of `plugins`, extension point deletion.

Not partial-by-accident: phase 1 leaves `.flow/config.yml` read from `<project path>/.flow/`; that is intentional and stated in the release note.
