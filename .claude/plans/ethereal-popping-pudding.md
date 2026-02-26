# Plan: Interim Fix — Show Created Workspaces Until DB Migration Lands

## Context

After workspace creation, the user sees a success toast but the workspace never appears in the list. Root cause: `getWorkspacesData()` only queries connected workers, and a new workspace has no worker.

**Important**: A full DB-backed workspace registry is being implemented (see `frolicking-wandering-scroll.md`). That migration will permanently solve this by persisting workspaces in a database. This plan provides a **minimal interim fix** that aligns with and will be superseded by the DB migration.

---

## Changes

### 1. Backend — `WorkspacesService.ts`: Track recently created workspaces in memory

Add a `Map<string, Workspace>` field to cache workspaces returned by `createWorkspace()`. In `getWorkspacesData()` and `getWorkspacesList()`, merge these into the result if not already present via connected workers. Clean up entries once a worker reports the same path.

This is ~30 lines of code, intentionally minimal, and will be deleted when the DB migration lands.

**File**: `packages/web-backend/src/services/WorkspacesService.ts`

```typescript
// New field
private readonly recentlyCreatedWorkspaces: Map<string, Workspace> = new Map();

// In createWorkspace(), after success:
this.recentlyCreatedWorkspaces.set(data.path, workspace);

// New private method
private mergeRecentlyCreated(workerPaths: Set<string>, workspaces: Workspace[]): Workspace[] {
    // Clean up entries that workers now track
    for (const path of this.recentlyCreatedWorkspaces.keys()) {
        if (workerPaths.has(path)) {
            this.recentlyCreatedWorkspaces.delete(path);
        }
    }
    // Add remaining recently created workspaces
    for (const workspace of this.recentlyCreatedWorkspaces.values()) {
        if (!workerPaths.has(workspace.path)) {
            workspaces.push(workspace);
        }
    }
    return workspaces;
}

// Call mergeRecentlyCreated() at the end of getWorkspacesData() and getWorkspacesList()
```

### 2. Frontend — `ProjectsV2Page.tsx`: Direct refetch on creation success

Change `handleWorkspaceCreated` to call `loadWorkspaces()` directly instead of relying on events. The creating page should update itself, events are for other consumers.

**File**: `packages/web-frontend/src/app/pages/projects2/ProjectsV2Page.tsx`

```typescript
const handleWorkspaceCreated = () => {
	setIsCreateWorkspaceDialogOpen(false);
	loadWorkspaces();
};
```

---

## File Changes

| File                                                               | Change                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------- |
| `packages/web-backend/src/services/WorkspacesService.ts`           | Add `recentlyCreatedWorkspaces` map + merge logic (~30 lines) |
| `packages/web-frontend/src/app/pages/projects2/ProjectsV2Page.tsx` | Add `loadWorkspaces()` call in `handleWorkspaceCreated`       |

---

## Verification

1. `npm run check` — no TypeScript errors
2. `npm run test:agent` — all tests pass
3. **Manual**: Create workspace from project page → appears immediately in list
4. **Manual**: Refresh page → workspace still appears (in-memory, until server restart)
