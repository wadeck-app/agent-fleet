# Workspace Provider -- Plugin System for flow/task CLI

**Version:** v0.1
**Last updated:** 2026-08-16
**Status:** Draft

## Overview

The `workspace` extension point provides an isolated working directory for task execution.
The provider allocates a workspace on demand and releases it when the task completes.
The CLI never sees the underlying mechanism (cwd, worktree, container) -- only the path.

## Decisions

| #   | Decision                                       | Rationale                                                                      | Date       |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------ | ---------- |
| 4   | Lifecycle model: allocate / release (Option A) | none implements trivially; worktree needs cleanup; extensible to docker/remote | 2026-08-16 |

## Interface (workspace/v1.ts)

```typescript
// packages/extension-points/src/workspace/v1.ts

export interface WorkspaceProvider {
	allocate(request: WorkspaceRequest): Promise<WorkspaceHandle>;
	release(handle: WorkspaceHandle): Promise<void>;
}

export interface WorkspaceRequest {
	taskId: string;
	hint?: string; // suggested name prefix
}

export interface WorkspaceHandle {
	path: string; // absolute path to the allocated working directory
	id: string; // opaque identifier used by release()
}
```

**CLI contract:** the CLI must call `release()` in a `finally` block after `allocate()` succeeds.
Failure to release = leaked workspace (worktrees accumulate, containers left running, etc.).

**`release()` failure contract:** If `release()` rejects:

- If no prior flow error exists: propagate the release error as the run error.
- If a prior flow error exists: log the release error as a warning and propagate the original flow error.
  A leaked workspace (release failed) must always be logged as a warning regardless.

---

## Sample: `none` implementation (packages/plugin-none)

Returns the current working directory. No setup, no teardown.
Used when: no isolation is needed, the task runs directly in the project folder.

```typescript
// SAMPLE -- packages/plugin-none/src/NoneWorkspaceProvider.ts
export const noneWorkspaceProvider: WorkspaceProvider = {
	async allocate(request) {
		return { path: process.cwd(), id: `none:${request.taskId}` };
	},
	async release(_handle) {
		// no-op
	},
};
```

Global config example:

```yaml
plugins:
    instances:
        no-isolation:
            type: plugins.none.default
```

---

## Sample: `worktree` implementation (packages/plugin-worktree)

Creates a `git worktree` for each task. The worktree is a separate checkout of the repo.
On release, the worktree is removed.

Options:

- `baseDir` -- where worktrees are created (e.g. `~/workspaces` or `./.worktrees`)
- `prefix` -- name prefix for the worktree folder
- `branchStrategy` -- `"new-branch"` only in v1 (task gets its own branch); `"detached"` and other strategies are v2+

```typescript
// SAMPLE -- packages/plugin-worktree/src/WorktreeWorkspaceProvider.ts
export function createWorktreeProvider(options: WorktreeOptions): WorkspaceProvider {
	return {
		async allocate(request) {
			const name = `${options.prefix ?? ''}${request.taskId}`;
			const worktreePath = path.join(resolveBaseDir(options.baseDir), name);
			// validateBaseDir(options.baseDir)                     -- required by PLUGIN-010
			// validateWorkspacePath(request.taskId, resolvedBase)  -- required by PLUGIN-009
			// validateTaskIdForBranchName(request.taskId)          -- required by PLUGIN-009 (branch strategy)
			// validateBranchNamePrefix(options.prefix)             -- required by PLUGIN-009 (prefix validation)
			// git worktree add -b <branchName> <worktreePath>      -- array-argument API, no shell interpolation
			return { path: worktreePath, id: `worktree:${worktreePath}` };
		},
		async release(handle) {
			// git worktree remove <path> --force
		},
	};
}
```

Global config example:

```yaml
plugins:
    instances:
        my-worktree:
            type: plugins.worktree.default
            options:
                baseDir: ~/workspaces
                prefix: myproject-
                branchStrategy: new-branch # default and only supported strategy in v1
```

---

## Branch strategy

v1 supports `new-branch` only: each `allocate` creates a new git branch named `<prefix><taskId>`.
Other strategies (`detached`, `existing-branch`) are future options -- out of scope for v1.

## Impact on existing flow YAML

The existing `workspace.mode`, `workspace.gitStrategy`, and `workspace.reusePolicy` fields are
**superseded** by the plugin system and removed from the flow YAML schema.

Their replacement:

```yaml
# flow YAML -- normal case: inherits workspace provider from global config
# (no workspace: section needed)

# flow YAML -- explicit override (rare), using the instance name from global config
workspace:
    use: my-worktree
    options:
        prefix: myflow-
```

Behaviors like "reuse workspace when possible" or "only run on feature branches" are v2+ plugin
wrapper concerns -- no TODO, not designed yet.

### Config precedence for workspace

Resolution order (highest to lowest):

1. Flow YAML `workspace:` section (per-flow override, rare)
2. Project config `plugins.workspace:` (project default)

If neither is present, the CLI fails at startup with an explicit error (P-4) -- workspace is the only required feature in v1 with no implicit fallback.

If both are present, the flow YAML wins and replaces the project config section entirely for that flow. No implicit merge between the two levels.

## Security considerations

- T-03 (Tampering): `WorkspaceHandle.path` is the only thing the CLI receives -- it cannot reach the repo root or other worktrees from it.
- T-03 note for `none` provider: `none` allocates `process.cwd()` which IS the live project root -- it provides no filesystem isolation. This is an accepted risk for v1 when `none` is chosen: the developer explicitly opts into running without isolation. T-03 is closed as "accepted risk" for the `none` implementation specifically.
- `release()` uses `--force` to handle cases where the task left uncommitted changes. This is intentional: the workspace is ephemeral.
- `baseDir` must be validated to not point inside an existing worktree (would create a nested worktree, which git rejects -- but worth an explicit error message).
- WorktreeProvider must sanitize `taskId` before using it in path construction: reject any value containing `/`, `\`, or `..` segments, and assert the final resolved path starts with the resolved `baseDir`. Failure to do so enables path traversal that bypasses the T-03 mitigation.
- `taskId` AND `prefix` used in git branch name construction must both pass the git ref-name allowlist (`^[a-zA-Z0-9._-]+$`) via `validateTaskIdForBranchName(taskId)` and `validateBranchNamePrefix(prefix)` before any git invocation. Git commands must use array-argument APIs (e.g., `execa(['git', 'worktree', 'add', '-b', branchName, path])`), never shell string interpolation, to prevent argument injection.
- `baseDir` must be validated at `allocate` time: it must not be `/`, a well-known system directory, or an ancestor of the current project root. A misconfigured `baseDir: /` would satisfy the nested-worktree check while placing worktrees in the filesystem root.
