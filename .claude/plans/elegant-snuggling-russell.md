# Plan: Auto-link new workspace to active project on creation

**Date:** 2026-02-26
**Feature:** From projects-v2 page, a newly created workspace is automatically associated with the currently active project.

## Context

**Problem:** When a user creates a workspace from `/projects-v2`, the workspace is created independently with no project association. The user must then manually open `ManageProjectWorkspacesDialog` to link it.

**Goal:** Auto-associate the new workspace with the active project immediately after creation.

**Design decision:** Instead of passing `projectId` into `CreateWorkspaceDialog` (which would pollute the dialog), we change the `onSuccess` callback to return the created `Workspace` object, and the association is handled at the `ProjectsV2Page` level. TypeScript allows `() => void` to be assigned to `(workspace: Workspace) => void` (callbacks with fewer params are compatible), so the change to `WorkspacesPage.tsx` requires no edit.

---

## Critical Files

| File                                                                       | Role                                           |
| -------------------------------------------------------------------------- | ---------------------------------------------- |
| `packages/web-frontend/src/app/pages/workspaces/CreateWorkspaceDialog.tsx` | Widen `onSuccess` to forward created workspace |
| `packages/web-frontend/src/app/pages/projects2/ProjectsV2Page.tsx`         | Update handler to call `associateWorkspace`    |
| `packages/web-frontend/src/app/pages/projects2/ProjectsV2Page.test.tsx`    | Add 3 regression tests                         |

**No changes needed:**

- `packages/web-frontend/src/app/pages/workspaces/WorkspacesPage.tsx` — uses `onSuccess={handleCreateWorkspace}` typed `() => void`, which is TypeScript-compatible with the new signature
- Backend / contracts — no API changes required

---

## Change 1 — `CreateWorkspaceDialog.tsx`

**a) Update import** — add `Workspace` type (line ~18):

```typescript
// Before
import type { CreateWorkspaceDto } from '@shared/api/workspaces.contract';
// After
import type { CreateWorkspaceDto, Workspace } from '@shared/api/workspaces.contract';
```

**b) Update props interface** (`onSuccess` type):

```typescript
// Before
onSuccess: () => void;
// After
onSuccess: (workspace: Workspace) => void;
```

**c) Capture and forward the returned workspace** (line ~129):

```typescript
// Before
await workspacesApi.createWorkspace(createWorkspaceData);
showToast('Workspace created successfully', 'success');
onSuccess();
// After
const workspace = await workspacesApi.createWorkspace(createWorkspaceData);
showToast('Workspace created successfully', 'success');
onSuccess(workspace);
```

---

## Change 2 — `ProjectsV2Page.tsx`

**a) Add `Workspace` import** (after line 6):

```typescript
import type { Workspace } from '@shared/api/workspaces.contract';
```

**b) Update `handleWorkspaceCreated`** (line ~248):

```typescript
// Before
const handleWorkspaceCreated = () => {
    // Workspaces will be reloaded automatically via WebSocket event
    setIsCreateWorkspaceDialogOpen(false);
};
// After
const handleWorkspaceCreated = async (workspace: Workspace) => {
    if (activeProject) {
        await associateWorkspace(workspace.id, activeProject.id);
    }
    // Workspaces will be reloaded automatically via WebSocket event
    setIsCreateWorkspaceDialogOpen(false);
};
```

**Context:** `activeProject` (line 97) and `associateWorkspace` (line 91) are already in scope.

**Error handling:** `associateWorkspace` catches its own errors internally (`useProjectWorkspaces.ts` lines 111-113) and does not re-throw. `setIsCreateWorkspaceDialogOpen(false)` will always execute.

---

## Change 3 — Regression Tests in `ProjectsV2Page.test.tsx`

Add at the end of the file a new `describe('Workspace auto-association')` block.

**Mock strategy:** Add a module-level mock for `CreateWorkspaceDialog` that renders a button — clicking it triggers `onSuccess(mockWorkspace)`. This avoids driving the full dialog form in page-level tests.

```typescript
// Add after existing vi.mock calls
const mockCreatedWorkspace: Workspace = {
    id: 'new-workspace-id',
    path: '/new-workspace',
    // ... minimal valid fields
};

vi.mock('../workspaces/CreateWorkspaceDialog', () => ({
    CreateWorkspaceDialog: ({
        open,
        onSuccess,
    }: { open: boolean; onSuccess: (w: Workspace) => void }) => {
        if (!open) return null;
        return (
            <button
                data-testid="mock-create-workspace-submit"
                onClick={() => onSuccess(mockCreatedWorkspace)}
            >
                Submit Mock
            </button>
        );
    },
}));
```

**Test 1:** `associateWorkspace` called with correct IDs when project is active

- Render with `initialUrl='/?projectId=project-123'`
- Click "Create Workspace" button → mock dialog appears
- Click "Submit Mock" → triggers `onSuccess(mockCreatedWorkspace)`
- Assert `associateWorkspace` called with `('new-workspace-id', 'project-123')`

**Test 2:** `associateWorkspace` NOT called when no project is active

- Render with `initialUrl='/'` (no projectId)
- `WorkspaceTabs` / "Create Workspace" button not rendered (guarded by `activeProject &&`)
- Assert `associateWorkspace` never called

**Test 3:** Dialog closes even if `associateWorkspace` rejects

- Mock `associateWorkspace` to reject
- Since `associateWorkspace` catches internally, promise resolves cleanly
- Assert dialog closes (mock dialog button disappears)

---

## Verification

1. **Type check:** `skill check` — verify no TS errors
2. **Unit tests:** `skill run-test` — all 3 new tests + existing tests pass
3. **Browser test (agent-browser):**
    - Navigate to `http://localhost:5030/projects-v2`
    - Select a project
    - Click "Create Workspace"
    - Fill in path, submit
    - Assert workspace appears in project workspace tabs immediately (no manual association needed)
4. **Negative test (agent-browser):** Verify same flow on `WorkspacesPage` (`/workspaces`) still works (creates workspace without auto-linking to any project)
