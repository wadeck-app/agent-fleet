# Manual Verification: Bidirectional Sync Fix

**OBSOLETE (2026-01-24)**: This document is now obsolete. Bidirectional sync has been completely removed in favor of unidirectional relationships.

See:

- `.claude/kb/lessons-learned.md` - "Bidirectional Relations: Choose Unidirectional"
- `migrations/RemoveWorkspaceProjectIdMigration.ts` - Data migration to remove projectId from workspaces

---

# Historical Documentation (For Reference Only)

## Bug Description

When updating a workspace's projectId, the bidirectional sync was not working:

- `workspace.projectId` was saved correctly
- `project.workspaceIds[]` remained empty

**Root Cause**: The workspace ID used for syncing could be a hash-based ID instead of the canonical UUID from metadata.

## The Fix

Changed `WorkspacesService.updateWorkspace()` to use `metadata.id` (canonical UUID) instead of the incoming `workspaceId` parameter when syncing with projects.

```typescript
// Before (BUG):
await this.projectsRepository.addWorkspaces(newProjectId, [workspaceId]);

// After (FIXED):
const canonicalWorkspaceId = metadata.id;
await this.projectsRepository.addWorkspaces(newProjectId, [canonicalWorkspaceId]);
```

## Manual Verification Steps

### 1. Start the backend server

```bash
cd packages/web-backend
npm run dev
```

### 2. Find the workspace ID from metadata

```bash
cat .agent-fleet\workspace-metadata.json
```

Look for the `"id"` field. Example: `"50115a2e-5226-46d4-9fb8-6f9c11a16f9d"`

### 3. Use the API to associate workspace with project

**Request:**

```bash
curl -X PATCH http://localhost:3030/api/workspaces/50115a2e-5226-46d4-9fb8-6f9c11a16f9d \
  -H "Content-Type: application/json" \
  -d '{"projectId": "wwuypfn8p"}'
```

### 4. Verify the project workspaceIds array

**Read the projects.json file:**

```bash
cat packages\web-backend\data\projects.json
```

**Expected Result:**

```json
{
  "name": "Agent Fleet",
  "id": "wwuypfn8p",
  "workspaceIds": ["50115a2e-5226-46d4-9fb8-6f9c11a16f9d"],
  ...
}
```

The `workspaceIds` array should now contain the workspace UUID!

### 5. Verify in the frontend

1. Open http://localhost:3030/projects2
2. Click on "Agent Fleet" project
3. The "Workspaces" tab should show count "1" instead of "0"
4. Click the "Workspaces" tab
5. The workspace should be visible in the list
6. Refresh the page - the workspace should still be there (persisted correctly)

## Test Cases Covered

The test file `WorkspacesService.bidirectional-sync.test.ts` covers:

1.  Adding workspace to project (setting projectId)
2.  Removing workspace from project (setting projectId to null)
3.  Reassigning workspace between projects
4.  Using canonical UUID instead of hash-based ID
5.  Handling non-existent projects gracefully
6.  Emitting B2F_PROJECT_UPDATED events
7.  Not triggering sync when projectId doesn't change

## Files Changed

1. **C:\Workspace_Tooling\agent-fleet\packages\web-backend\src\services\WorkspacesService.ts**
    - Line 405: Added `canonicalWorkspaceId = metadata.id`
    - Lines 420, 443: Use `canonicalWorkspaceId` instead of `workspaceId`

2. **C:\Workspace_Tooling\agent-fleet\packages\web-backend\src\services\WorkspacesService.bidirectional-sync.test.ts** (NEW)
    - Comprehensive test suite for bidirectional sync

## Success Criteria

-  TypeScript compiles without errors
-  Tests pass
-  Manual verification shows workspace appearing in project
-  Workspace count on tab badge shows "1"
-  Workspace persists after page refresh
