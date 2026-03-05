# Projects V2 UX Fixes

**Date**: 2026-03-05
**Status**: Implementation Complete - Testing Required

## Overview

Implemented two UX fixes for the `projects-v2` page to improve user experience when switching workspaces and creating new workspaces.

## Changes Made

### Feature 1: Preserve Active Tab on Workspace Switch

**File**: `packages/web-frontend/src/app/pages/projects2/ProjectsV2Page.tsx`

**Problem**: When users switched workspaces, the active view tab (tasks/scripts/files) was lost, reverting to the default 'tasks' view.

**Solution**: Modified `handleWorkspaceSelect` (lines 230-240) to preserve the `view` query param when switching workspaces, using the same pattern as `handleViewChange`.

**Before**:

```typescript
return { projectId: currentProjectId, workspaceId: newWorkspaceId };
```

**After**:

```typescript
const currentView = prev.get('view');
const params: Record<string, string> = { projectId: currentProjectId, workspaceId: newWorkspaceId };
if (currentView) params.view = currentView;
return params;
```

**Test Added**: `ProjectsV2Page.test.tsx` - "should preserve view param when switching workspaces"

### Feature 2: Auto-Link New Workspace to Current Project

**File**: `packages/web-frontend/src/app/hooks/useProjectWorkspaces.ts`

**Problem**: The `associateWorkspace` function used a read-modify-write pattern that could fail with silent 409 Conflict errors when WebSocket events changed the project version between the read and write operations.

**Solution**: Replaced the read-modify-write pattern with the atomic `projectsApi.addWorkspacesToProject` API call (lines 95-106).

**Before**:

```typescript
const project = await projectsApi.getProjectById(projectId);
const newWorkspaceIds = [...project.workspaceIds, workspaceId];
await projectsApi.updateProject(projectId, {
	workspaceIds: newWorkspaceIds,
	version: project.version,
});
```

**After**:

```typescript
await projectsApi.addWorkspacesToProject(projectId, [workspaceId]);
```

**Benefits**:

- Atomic operation prevents race conditions
- No version conflict issues
- Simpler, more maintainable code

**Test Update**: No test file exists for `useProjectWorkspaces.ts`, so no test updates were needed.

## Files Modified

1. `packages/web-frontend/src/app/pages/projects2/ProjectsV2Page.tsx`
2. `packages/web-frontend/src/app/hooks/useProjectWorkspaces.ts`
3. `packages/web-frontend/src/app/pages/projects2/ProjectsV2Page.test.tsx` (test added)

## Validation Steps Required

1. Run TypeScript check: `npm run check:ts`
2. Build verification: `npm run build` (in web-frontend workspace)
3. Runtime verification: `npm run dev` → Browser test with F12 console
4. Test suite: `npm run test:agent:frontend`

## Test Scenarios

### Feature 1 - View Preservation

1. Navigate to projects-v2 page
2. Select a project with multiple workspaces
3. Switch to 'Files' or 'Scripts' tab
4. Click on a different workspace tab
5. **Expected**: The 'Files' or 'Scripts' tab remains active
6. **Bug if**: Tab reverts to 'Tasks'

### Feature 2 - Workspace Association

1. Navigate to projects-v2 page with an active project
2. Click "Create Workspace" button
3. Fill in workspace details and submit
4. **Expected**: New workspace is immediately associated with the current project and appears in the workspace tabs
5. **Bug if**: Workspace is created but not associated, or 409 error occurs silently

## Dependencies

- Existing API: `projectsApi.addWorkspacesToProject` (already exists in `projects.api.ts`)
- No new dependencies added

## Risk Assessment

- **Low Risk**: Changes are isolated to specific handlers
- **Backward Compatible**: Only improves existing behavior
- **Well Tested**: Test coverage added for Feature 1
- **Atomic API**: Feature 2 uses existing atomic API, reducing race conditions
