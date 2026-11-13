# Native WorkspaceManager removal (first version)

User decision: remove the native WorkspaceManager (item 7 of the workspace redesign, `2026-11-07_workspace-provider-redesign.md`); keep it simple, adjust later if needed.

## Decisions

| Area | Decision | Why |
|---|---|---|
| `flow-engine/src/workspace/` | Deleted `WorkspaceManager.ts`, `WorkspaceGitStrategy.ts`, `WorkspaceGitMessages.ts`, `WorkspaceTypes.ts` and their tests (`WorkspaceManager.test.ts`, `WorkspaceManager.gitFailure.test.ts`, `WorkspaceGitStrategy.hardening.test.ts`) | Only the manager, the legacy worker and the orchestrator used them; `flow run` uses the workspace providers |
| `flow-engine/src/types.ts` | Removed `WorkspaceConfig`, `GitStrategy`, `ReusePolicy` | No other user (validator has its own definitions) |
| Legacy worker (`packages/worker` `FlowWorker`) | Every flow is refused at workspace acquisition (`acquireWorkspace`), whatever it declares | It has no workspace provider; a silent fallback to the project dir would run steps in the wrong place |
| Orchestrator | Removed its `WorkspaceManager`, `getWorkspaceManager()`, and the REST routes `GET /workspaces` and `GET /workspaces/:id` (now 404) | The orchestrator never allocated workspaces (the worker did), so the registry it listed was empty |
| web-backend | Removed `OrchestratorRepository.getWorkspaces/getWorkspace` | They had no caller; the workspace pages use `WorkspacesService` |
| Test factories | Worker `createMockFlow` declares `workspace: 'in-place'`; unused type imports dropped | Types removed |
| Web editor re-exports | Dropped `GitStrategy`, `ReusePolicy`, `WorkspaceConfig` from `flow-engine.types.ts` | Re-exports of removed types; nothing consumed them |

## Legacy worker behaviour

Task fails (task result `failed`, `sendTaskFailed` with the failure status) with:

`Flow "<id>" needs a workspace (<mode "isolated" | declared workspace "in-place" | declared workspace {...}>), but this legacy worker no longer has a workspace manager: the native one (isolated, shared and manual modes) was removed. Run the flow with "flow run", which supports the in-place, readonly, worktree and pool workspaces.`

`task.workspacePath` and `process.cwd()` are no longer used as workspace.

## Kept

- `WorkspacePruner` (startup pruning), `RedactGitText` (daemon), `ReadOnlyWorkspaceRules`, `WorkspaceDeclarationParser`, `WorktreeOptionRules`.
- `WorkspaceMode` and the `Workspace` record type: still describe the `Workspace` object handed to the executor.
- `HardenedGit` (extension-points): shared with the providers; its own tests stay.
- The execution code of `FlowWorker.executeFlow` after `acquireWorkspace`: reachable by type only, dead at runtime. Kept so the removal stays a small diff and the worker tests of the execution path still run with `acquireWorkspace` stubbed.

## Not done

- No workspace provider wired into the legacy worker (the worker can run no flow until it is, or until it is retired).
- Dead execution path of the legacy worker not deleted (next step: delete the worker, or wire providers).
- Loss of coverage: `getGitState` against a repository written by a run (was in `WorkspaceGitStrategy.hardening.test.ts`) is not re-tested here; the providers in flow-cli carry their own tests.
- Historical docs (`.claude/specs`, older plans, lessons-learned) still mention `WorkspaceManager`; left as history.
