# Plan: 2026-03-05_preserve-tab-and-auto-link-workspace

## Context

Two UX improvements requested for the `projects-v2` page:

1. **Tab not preserved on workspace switch**: When navigating between workspaces, the active view tab (Tasks/Scripts/Files) is reset to the default, making it inconvenient to compare file structures across workspaces.

2. **New workspace not linked to project**: After creating a workspace via "Create Workspace" from a project page, the workspace does not appear in the project's workspace tabs. Root cause: `associateWorkspace` in `useProjectWorkspaces.ts` uses `updateProject` with optimistic locking (version check). A WebSocket event triggered by workspace creation can change the project version between the `getProjectById` call and the `updateProject` call, causing a silent 409 Conflict that the catch block swallows.

---

## Feature 1: Preserve active tab on workspace switch

**File**: `packages/web-frontend/src/app/pages/projects2/ProjectsV2Page.tsx`

**Change**: In `handleWorkspaceSelect` (line 230-237), preserve the `view` param from current URL — same pattern as `handleViewChange`.

```typescript
// Current (drops view param):
return { projectId: currentProjectId, workspaceId: newWorkspaceId };

// Fixed (preserves view param):
const currentView = prev.get('view');
const params: Record<string, string> = { projectId: currentProjectId, workspaceId: newWorkspaceId };
if (currentView) params.view = currentView;
return params;
```

---

## Feature 2: Auto-link new workspace to current project

### Root cause

`associateWorkspace` in `packages/web-frontend/src/app/hooks/useProjectWorkspaces.ts` (line 95-116) uses a read-modify-write pattern with `updateProject`:

1. Fetch project → get version
2. Build new `workspaceIds` array
3. Call `updateProject` with version → can fail with 409 if WS event modified the project in between

The catch block silently swallows the error (only sets local error state, no user feedback, no toast).

### Fix

Replace the read-modify-write in `associateWorkspace` with the dedicated atomic endpoint `projectsApi.addWorkspacesToProject(projectId, [workspaceId])`.

**File**: `packages/web-frontend/src/app/hooks/useProjectWorkspaces.ts`

```typescript
const associateWorkspace = useCallback(
	async (workspaceId: string, projectId: string) => {
		try {
			setError(null);
			await projectsApi.addWorkspacesToProject(projectId, [workspaceId]);
			await loadWorkspaces();
		} catch (err) {
			setError(getErrorMessage(err));
		}
	},
	[loadWorkspaces]
);
```

**Reused**: `projectsApi.addWorkspacesToProject` already exists in `packages/web-frontend/src/app/pages/projects/projects.api.ts` (line 72-77).

---

## Tests to update

**File**: `packages/web-frontend/src/app/pages/projects2/ProjectsV2Page.test.tsx`

- Add test: switching workspaces preserves the `view` query param
- Update existing `associateWorkspace` tests if they check the internal call sequence (they mock the hook, so likely no change needed)

**File**: `packages/web-frontend/src/app/hooks/useProjectWorkspaces.test.ts` (if it exists)

- Update `associateWorkspace` test to expect `addWorkspacesToProject` instead of `updateProject` + `getProjectById`

---

## Critical files

| File                                                                    | Change                                                          |
| ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| `packages/web-frontend/src/app/pages/projects2/ProjectsV2Page.tsx`      | Feature 1: preserve `view` in `handleWorkspaceSelect`           |
| `packages/web-frontend/src/app/hooks/useProjectWorkspaces.ts`           | Feature 2: use `addWorkspacesToProject` in `associateWorkspace` |
| `packages/web-frontend/src/app/pages/projects2/ProjectsV2Page.test.tsx` | Add tab-preservation test                                       |

---

## Verification

1. Navigate to `projects-v2?projectId=X&workspaceId=Y&view=files`
2. Click another workspace tab → URL should retain `view=files`
3. Create a new workspace from the project page → new workspace appears in the project's workspace tabs after creation
4. Run `skill:check` and `skill:run-test` to ensure no regressions
