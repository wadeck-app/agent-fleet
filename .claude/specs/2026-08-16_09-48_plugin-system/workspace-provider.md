# Workspace Provider -- Plugin System for flow/task CLI

**Version:** v0.1
**Last updated:** 2026-08-16
**Status:** Draft

## Overview

The `workspace` extension point provides an isolated working directory for task execution.
The provider allocates a workspace on demand and releases it when the task completes.
The CLI never sees the underlying mechanism (cwd, worktree, container) -- only the path.

## Decisions

| # | Decision | Rationale | Date |
|---|---|---|---|
| 4 | Lifecycle model: allocate / release (Option A) | none implements trivially; worktree needs cleanup; extensible to docker/remote | 2026-08-16 |

## Interface (workspace/v1.ts)

```typescript
// packages/extension-points/src/workspace/v1.ts

export interface WorkspaceProvider {
  allocate(request: WorkspaceRequest): Promise<WorkspaceHandle>;
  release(handle: WorkspaceHandle): Promise<void>;
}

export interface WorkspaceRequest {
  taskId: string;
  hint?: string;   // suggested name prefix
}

export interface WorkspaceHandle {
  path: string;    // absolute path to the allocated working directory
  id: string;      // opaque identifier used by release()
}
```

**CLI contract:** the CLI must call `release()` in a `finally` block after `allocate()` succeeds.
Failure to release = leaked workspace (worktrees accumulate, containers left running, etc.).

---

## Implementation: `none` (plugin-none / built-in)

Returns the current working directory. No setup, no teardown.
Used when: no isolation is needed, the task runs directly in the project folder.

```typescript
// packages/plugin-none/src/NoneWorkspaceProvider.ts
import type { WorkspaceProvider, WorkspaceRequest, WorkspaceHandle } from "@flow/extension-points/workspace/v1";

export const noneWorkspaceProvider: WorkspaceProvider = {
  async allocate(request: WorkspaceRequest): Promise<WorkspaceHandle> {
    return {
      path: process.cwd(),
      id: `none:${request.taskId}`,
    };
  },

  async release(_handle: WorkspaceHandle): Promise<void> {
    // no-op: nothing to clean up
  },
};
```

Config example:
```yaml
plugins:
  instances:
    no-isolation:
      type: plugins.none.workspace
```

---

## Implementation: `worktree` (plugin-worktree)

Creates a git worktree for each task allocation. The worktree is a separate checkout of the
repo at a dedicated path, so the task runs in isolation from the main working tree.
On release, the worktree is removed.

```typescript
// packages/plugin-worktree/src/WorktreeWorkspaceProvider.ts
import type { WorkspaceProvider, WorkspaceRequest, WorkspaceHandle } from "@flow/extension-points/workspace/v1";
import { execSync } from "child_process";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

export interface WorktreeOptions {
  baseDir: string;    // where worktrees are created, e.g. ~/workspaces or ./.worktrees
  prefix?: string;    // name prefix for the worktree folder, e.g. "myproject-"
  branchStrategy: "new-branch" | "detached";
                      // see open question below
}

export function createWorktreeProvider(options: WorktreeOptions): WorkspaceProvider {
  const baseDir = options.baseDir.replace("~", os.homedir());

  return {
    async allocate(request: WorkspaceRequest): Promise<WorkspaceHandle> {
      const name = `${options.prefix ?? ""}${request.taskId}`;
      const worktreePath = path.join(baseDir, name);

      if (fs.existsSync(worktreePath)) {
        throw new Error(`Workspace already exists at ${worktreePath} -- is a previous task still running?`);
      }

      if (options.branchStrategy === "new-branch") {
        execSync(`git worktree add -b ${name} "${worktreePath}"`, { stdio: "inherit" });
      } else {
        execSync(`git worktree add --detach "${worktreePath}"`, { stdio: "inherit" });
      }

      return { path: worktreePath, id: `worktree:${worktreePath}` };
    },

    async release(handle: WorkspaceHandle): Promise<void> {
      if (!handle.id.startsWith("worktree:")) {
        throw new Error(`WorktreeProvider cannot release handle with id "${handle.id}"`);
      }
      execSync(`git worktree remove "${handle.path}" --force`, { stdio: "inherit" });
    },
  };
}
```

Config example:
```yaml
plugins:
  instances:
    my-worktree:
      type: plugins.worktree.default
      options:
        baseDir: ~/workspaces
        prefix: myproject-
        branchStrategy: new-branch
```

---

## Open question: worktree branch strategy

When `allocate` creates a worktree, should it:

| Strategy | Command | When to use |
|---|---|---|
| `new-branch` | `git worktree add -b <name> <path>` | Task needs its own branch (commits isolated, PR per task) |
| `detached` | `git worktree add --detach <path>` | Task only reads code or doesn't commit (no branch pollution) |

Both are exposed as a config option (`branchStrategy`). The default is TBD -- see Open Questions #6.

## Security considerations

- T-02 (Tampering): `WorkspaceHandle.path` is the only thing the CLI receives -- it cannot reach the repo root or other worktrees from it.
- `release()` uses `--force` to handle cases where the task left uncommitted changes. This is intentional: the workspace is ephemeral.
- `baseDir` must be validated to not point inside an existing worktree (would create a nested worktree, which git rejects -- but worth an explicit error message).
