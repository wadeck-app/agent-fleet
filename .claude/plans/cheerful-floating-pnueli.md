# Plan: Deeplink All Dialogs via URL Search Params

## Context

Dialogs using `useState` for open/close lose their state on frontend refresh (e.g., an agent hot-reloading). The user loses in-progress forms (CreateWorkspaceDialog is the main pain point). The fix: every dialog's open/close state must be in the URL so a refresh re-opens the dialog.

The codebase already has `useUrlState` (`framework/hooks/useUrlState.ts`) which syncs state with URL search params, and `useRoutedDialog` for path-based CRUD dialogs. We'll create a thin `useDialogParam` hook on top of `useUrlState` for the dialog open/close pattern.

---

## Step 1: Create `useDialogParam` hook

**File:** `packages/web-frontend/src/framework/hooks/useDialogParam.ts`

Thin wrapper around `useUrlState` for dialog state:

```typescript
export function useDialogParam(dialogName: string): {
	isOpen: boolean;
	open: () => void;
	close: () => void;
	onOpenChange: (open: boolean) => void;
};
```

- Uses `useUrlState({ key: 'dialog', defaultValue: null })`
- `isOpen` = `value === dialogName`
- `open()` sets value to `dialogName`
- `close()` sets value to `null` (removed from URL)
- `onOpenChange(open)` = open ? open() : close()

URL result: `?dialog=create-workspace` → CreateWorkspaceDialog opens. On refresh, param persists → dialog re-opens.

Only one dialog can be open at a time (which is correct for modals).

---

## Step 2: Migrate dialogs (11 instances across 5 pages)

For each dialog, replace `useState<boolean>` with `useDialogParam('dialog-name')`.

### WorkspacesPage (`pages/workspaces/WorkspacesPage.tsx`)

| Dialog                | useState var       | Dialog name        |
| --------------------- | ------------------ | ------------------ |
| CreateWorkspaceDialog | `createDialogOpen` | `create-workspace` |

### ProjectsPage (`pages/projects/ProjectsPage.tsx`)

| Dialog              | useState var       | Dialog name                                   |
| ------------------- | ------------------ | --------------------------------------------- |
| CreateProjectDialog | `createDialogOpen` | `create-project`                              |
| EditProjectDialog   | `editDialogState`  | `edit-project` (+ keep entity in local state) |

### ProjectsV2Page (`pages/projects2/ProjectsV2Page.tsx`)

| Dialog                        | useState var                   | Dialog name         |
| ----------------------------- | ------------------------------ | ------------------- |
| ManagePinnedProjectsDialog    | `isManageDialogOpen`           | `manage-pinned`     |
| ManageProjectWorkspacesDialog | `isManageWorkspacesDialogOpen` | `manage-workspaces` |
| CreateWorkspaceDialog         | `isCreateWorkspaceDialogOpen`  | `create-workspace`  |
| EditProjectDialog             | `editDialogState`              | `edit-project`      |

### WorkspacePanel (`pages/projects2/WorkspacePanel.tsx`)

| Dialog              | useState var             | Dialog name      |
| ------------------- | ------------------------ | ---------------- |
| EditWorkspaceDialog | `isEditDialogOpen`       | `edit-workspace` |
| CreateTaskDialog    | `isCreateTaskDialogOpen` | `create-task`    |

### FlowEditorPage (`pages/flows/flow-editor/FlowEditorPage.tsx`)

| Dialog             | useState var         | Dialog name     |
| ------------------ | -------------------- | --------------- |
| FlowSettingsDialog | `settingsDialogOpen` | `flow-settings` |

**Note for edit dialogs:** The entity being edited stays in `useState` (it's runtime data, not URL-serializable). The URL only controls open/close. On refresh, the dialog opens but the entity may need to be re-fetched — which is acceptable and better than losing the dialog entirely.

---

## Step 3: Write test for `useDialogParam`

**File:** `packages/web-frontend/src/framework/hooks/useDialogParam.test.ts`

Test: open/close toggles, URL param sync, onOpenChange callback.

---

## Files Modified

| File                                         | Action                                          |
| -------------------------------------------- | ----------------------------------------------- |
| `framework/hooks/useDialogParam.ts`          | **New** — hook                                  |
| `framework/hooks/useDialogParam.test.ts`     | **New** — tests                                 |
| `pages/workspaces/WorkspacesPage.tsx`        | Migrate CreateWorkspaceDialog                   |
| `pages/projects/ProjectsPage.tsx`            | Migrate CreateProjectDialog + EditProjectDialog |
| `pages/projects2/ProjectsV2Page.tsx`         | Migrate 4 dialogs                               |
| `pages/projects2/WorkspacePanel.tsx`         | Migrate EditWorkspaceDialog + CreateTaskDialog  |
| `pages/flows/flow-editor/FlowEditorPage.tsx` | Migrate FlowSettingsDialog                      |

---

## Verification

1. `npm run check` — TypeScript passes
2. `npm run test:agent:frontend` — frontend tests pass
3. Manual: Open CreateWorkspaceDialog → refresh → dialog stays open
4. Manual: Open dialog → press browser back → dialog closes
5. Manual: Copy URL with `?dialog=create-workspace` → paste in new tab → dialog opens
