# Implementation Plan: Add Delete and Bulk Delete to Tasks v2

**Created:** 2026-01-03_15-57
**User Request:** Add delete button and bulk delete (like Ingredients v2) with confirmation dialogs to Tasks v2 page

## Overview

Add single delete and bulk delete functionality to the Tasks v2 page, following the exact pattern from Ingredients v2. This includes confirmation dialogs, visual feedback (strike-through, blur effects), batch processing, and real-time updates.

## Reference Implementation

**Ingredients v2** (`packages/web-frontend/src/app/pages/ingredients2/Ingredients2Page.tsx`) demonstrates the complete pattern:

- Single delete with `AlertDialogWrapper` confirmation
- Bulk delete with `BulkDeleteWorkflow` component
- Multi-select with `useMultiSelect2` hook
- Visual feedback states (`deletingIds`, `isBulkDeleting`, `isRefreshingAfterMutation`)
- CRUD operations via `useIngredientsCrud` hook

## Current State Analysis

### ✅ Already Exists

- Backend: `DELETE /api/tasks/:id` endpoint (TasksController.ts)
- Backend: `TasksService.deleteTask()` method
- Backend: Emits `B2F_TASK_DELETED` event after deletion
- Frontend: `tasksApi.deleteTask(id)` method
- Frontend: TasksPage2 subscribes to real-time events

### ❌ Missing Components

- Backend: Bulk delete endpoint (`DELETE /api/tasks/`)
- Backend: Bulk delete schemas in contract
- Backend: `TasksService.bulkDeleteTasks()` method
- Frontend: `useTasksCrud` hook
- Frontend: Delete button in TasksTable2
- Frontend: Bulk action bar and selection UI
- Frontend: Confirmation dialogs
- Frontend: Visual feedback states

## Implementation Steps

### Step 1: Backend - Bulk Delete Support

#### 1.1 Update Contract

**File:** `packages/shared-frontend-backend/src/api/tasks.contract.ts`

Add after line ~173 (after PaginatedLogsResponse):

```typescript
// Bulk delete schemas
const BulkDeleteRequestSchema = z.object({
	ids: z.array(z.string()).min(1).max(10), // Max 10 per batch
});

const FailedDeletionSchema = z.object({
	id: z.string(),
	reason: z.string(),
	code: z.string(),
});

const BulkDeleteResponseSchema = z.object({
	success: z.literal(true),
	deleted: z.array(z.string()),
	failed: z.array(FailedDeletionSchema),
	totalRequested: z.number(),
	totalDeleted: z.number(),
	totalFailed: z.number(),
});
```

Add to TASKS_API_ROUTES (after line ~206):

```typescript
'/api/tasks/': {
  DELETE: {
    body: BulkDeleteRequestSchema,
    response: BulkDeleteResponseSchema,
  },
}
```

Export types:

```typescript
export type BulkDeleteRequest = z.infer<typeof BulkDeleteRequestSchema>;
export type BulkDeleteResponse = z.infer<typeof BulkDeleteResponseSchema>;
export type FailedDeletion = z.infer<typeof FailedDeletionSchema>;
```

#### 1.2 Update TasksService

**File:** `packages/web-backend/src/services/TasksService.ts`

Add method after `deleteTask()` (around line ~340):

```typescript
/**
 * Bulk delete tasks (best-effort approach)
 */
async bulkDeleteTasks(ids: string[]): Promise<BulkDeleteResponse> {
  const deleted: string[] = [];
  const failed: FailedDeletion[] = [];

  for (const id of ids) {
    try {
      await this.orchestratorRepository.deleteTask(id);
      deleted.push(id);
    } catch (error) {
      failed.push({
        id,
        reason: error instanceof Error ? error.message : 'Unknown error',
        code: 'DELETE_FAILED',
      });
    }
  }

  // Emit aggregate event for dashboard updates
  if (deleted.length > 0) {
    this.eventBroadcaster.broadcast(B2F_TASKS_UPDATED, {} as any);
  }

  return {
    success: true,
    deleted,
    failed,
    totalRequested: ids.length,
    totalDeleted: deleted.length,
    totalFailed: failed.length,
  };
}
```

Add imports:

```typescript
import type { BulkDeleteResponse, FailedDeletion } from '@app/shared/api/tasks.contract';
```

#### 1.3 Update TasksController

**File:** `packages/web-backend/src/controllers/TasksController.ts`

Add route after POST route (around line ~56):

```typescript
/**
 * DELETE /api/tasks/
 * Bulk delete tasks (up to 10 per batch)
 */
add('DELETE', '/api/tasks/', async ({ body }) => {
	return this.service.bulkDeleteTasks(body.ids);
});
```

### Step 2: Frontend - CRUD Hook

#### 2.1 Update Tasks API

**File:** `packages/web-frontend/src/app/pages/tasks/tasks.api.ts`

Add import (line ~3):

```typescript
import type { BulkDeleteResponse } from '@shared/api/tasks.contract';
```

Add method after `deleteTask()` (around line ~59):

```typescript
bulkDeleteTasks: (ids: string[]): Promise<BulkDeleteResponse> => {
  return typedFetch('DELETE', '/api/tasks/', {
    body: { ids }
  }) as Promise<BulkDeleteResponse>;
},
```

#### 2.2 Create useTasksCrud Hook

**File:** `packages/web-frontend/src/app/pages/tasks/useTasksCrud.ts` (NEW)

Create new file following `useIngredientsCrud.ts` pattern with:

- `deleteTask(id: string)` method
- `bulkDeleteTasks(ids: string[])` method
- `operationError` state
- `clearOperationError()` method

### Step 3: Frontend - Update Table

#### 3.1 Update TasksTable2

**File:** `packages/web-frontend/src/app/pages/tasks2/TasksTable2.tsx`

Add props to interface (line ~115):

```typescript
export interface TasksTable2Props extends Partial<Table2Props<Task>> {
	onDelete?: (id: string) => void;
	refreshing?: boolean;
	deleting?: boolean;
	deletingIds?: Set<string>;
	onSelectionToggle?: (id: string) => void;
	onSelectAll?: (ids: string[]) => void;
}
```

Add delete button rendering:

```typescript
const renderActions = onDelete
  ? (task: Task) => (
      <div className="flex items-center justify-center gap-2">
        <Button
          size="sm"
          variant="destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task.id);
          }}
          aria-label={`Delete ${task.description}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    )
  : undefined;
```

Pass new props to Table2:

```typescript
<Table2
  columns={TASKS_TABLE2_COLUMNS}
  renderActions={renderActions}
  refreshing={refreshing}
  deleting={deleting}
  deletingIds={deletingIds}
  onSelectionToggle={onSelectionToggle}
  onSelectAll={onSelectAll}
  {...props}
/>
```

Add imports:

```typescript
import { Button } from '@framework/components/primitives/Button';
import { Trash2 } from 'lucide-react';
```

### Step 4: Frontend - Update Page

#### 4.1 Update TasksPage2

**File:** `packages/web-frontend/src/app/pages/tasks2/TasksPage2.tsx`

Add imports (after line ~22):

```typescript
import { BulkActionBar } from '@framework/components/advanced/BulkActionBar';
import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';
import { useMultiSelect2 } from '@framework/hooks2/useMultiSelect2';
import { useCrudSuccessToast } from '@framework/hooks/useCrudSuccessToast';
import { useErrorToast } from '@framework/hooks/useErrorToast';
import { Trash2 } from 'lucide-react';

import { BulkDeleteWorkflow } from '@app/components/domain';

import { useTasksCrud } from '../tasks/useTasksCrud';
```

Add after `cache` initialization (line ~70):

```typescript
// Multi-selection
const selection = useMultiSelect2();

// CRUD operations
const { deleteTask, bulkDeleteTasks, operationError, clearOperationError } = useTasksCrud();

// Error toast
useErrorToast({ error: operationError, clearError: clearOperationError });

// Success toast
const successToast = useCrudSuccessToast('task');

// Visual feedback states
const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
const [isBulkDeleting, setIsBulkDeleting] = useState(false);
const [isRefreshingAfterMutation, setIsRefreshingAfterMutation] = useState(false);
const isMutating = useRef(false);

// Delete confirmation dialog
const [deleteConfirmation, setDeleteConfirmation] = useState<{
	open: boolean;
	taskId: string | null;
}>({ open: false, taskId: null });

// Bulk delete dialog
const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

// Store tasks for visual feedback
const [tasks, setTasks] = useState<Task[]>([]);
```

Add useEffect for clearing states:

```typescript
// Clear states when data refreshes
useEffect(() => {
	if (isMutating.current && tasks.length > 0) {
		isMutating.current = false;
		setIsRefreshingAfterMutation(false);
		setIsBulkDeleting(false);
		setDeletingIds(new Set());
	}
}, [tasks]);
```

Update fetchTasks to store tasks:

```typescript
const fetchTasks = useCallback(async (query: ComposedQuery) => {
	const response = await tasksApi.getTasksList({
		/* ... */
	});

	setTasks(response.items); // ADD THIS

	return {
		items: response.items,
		pagination: response.pagination,
	};
}, []);
```

Add handlers:

```typescript
const handleDelete = (id: string) => {
	setDeleteConfirmation({ open: true, taskId: id });
};

const handleDeleteConfirm = async () => {
	if (deleteConfirmation.taskId) {
		setDeletingIds(prev => new Set([...prev, deleteConfirmation.taskId!]));
		setIsRefreshingAfterMutation(true);
		isMutating.current = true;

		try {
			await deleteTask(deleteConfirmation.taskId);
			await cache.actions.refresh();
			successToast.deleted();
		} finally {
			setDeletingIds(prev => {
				const next = new Set(prev);
				next.delete(deleteConfirmation.taskId!);
				return next;
			});
		}
	}
	setDeleteConfirmation({ open: false, taskId: null });
};

const handleBulkDelete = async () => {
	if (selection.fstate.isEmpty) return;
	setShowBulkDeleteDialog(true);
};

const handleSelectAll = (ids: string[]) => {
	const allSelected = ids.every(id => selection.actions.isSelected(id));

	if (allSelected) {
		const newSelection = new Set(selection.fstate.selectedIds);
		ids.forEach(id => newSelection.delete(id));
		selection.actions.set(newSelection);
	} else {
		const newSelection = new Set([...selection.fstate.selectedIds, ...ids]);
		selection.actions.set(newSelection);
	}
};
```

Add BulkActionBar (after TaskFilters2, line ~166):

```typescript
{/* Bulk Action Bar */}
{!selection.fstate.isEmpty && (
  <BulkActionBar
    selectionCount={selection.fstate.count}
    selectedLabel={`${selection.fstate.count} task(s) selected`}
    onCancel={selection.actions.clear}
    variant="light"
  >
    <Button onClick={handleBulkDelete} variant="destructive" size="sm">
      <Trash2 className="mr-2 size-4" />
      Delete
    </Button>
  </BulkActionBar>
)}
```

Update Data2 (line ~212):

```typescript
<Data2
  fetchData={fetchTasks}
  pagination={pagination}
  sorting={sorting}
  search={search}
  filter={filters as any}
  cache={cache}
  selection={selection}  // ADD
  delegateLoadingToChildren={true}
>
  {injectedProps => (
    <TasksTable2
      {...injectedProps}
      onDelete={handleDelete}
      refreshing={injectedProps.isLoading || isRefreshingAfterMutation}
      deleting={isBulkDeleting}
      deletingIds={deletingIds}
      onSelectionToggle={selection.actions.toggle}
      onSelectAll={handleSelectAll}
    />
  )}
</Data2>
```

Add dialogs before closing Page tag:

```typescript
{/* Bulk Delete Workflow */}
<BulkDeleteWorkflow
  open={showBulkDeleteDialog}
  onOpenChange={setShowBulkDeleteDialog}
  selectedIds={selection.fstate.selectedIds}
  onClear={selection.actions.clear}
  onBulkDelete={bulkDeleteTasks}
  onReload={async () => cache.actions.refresh()}
  itemTypeName="task"
  onDeletingChange={ids => {
    if (ids.size > 0) {
      setDeletingIds(ids);
    }
  }}
  onBulkDeletingChange={deleting => {
    if (deleting) {
      setIsBulkDeleting(true);
      isMutating.current = true;
    }
  }}
/>

{/* Delete Confirmation Dialog */}
<AlertDialogWrapper
  open={deleteConfirmation.open}
  onOpenChange={open => {
    setDeleteConfirmation({ open, taskId: open ? deleteConfirmation.taskId : null });
  }}
  title="Delete Task"
  description="Are you sure you want to delete this task? This action cannot be undone."
  confirmLabel="Delete"
  cancelLabel="Cancel"
  variant="danger"
  onConfirm={handleDeleteConfirm}
/>
```

### Step 5: Testing

Write tests for:

- `TasksService.bulkDeleteTasks()` - success, failure, partial
- `useTasksCrud` hook - operations and error handling
- TasksPage2 - delete button, confirmation, bulk delete flow

Run after implementation:

- `npm run check` - TypeScript validation
- `npm run test:agent` - All tests
- Manual browser testing - visual feedback, toasts, real-time updates

## Critical Files

1. `packages/shared-frontend-backend/src/api/tasks.contract.ts` - Add bulk delete schemas
2. `packages/web-backend/src/services/TasksService.ts` - Implement bulkDeleteTasks
3. `packages/web-frontend/src/app/pages/tasks/useTasksCrud.ts` - Create CRUD hook (NEW)
4. `packages/web-frontend/src/app/pages/tasks2/TasksPage2.tsx` - Add selection, dialogs, handlers
5. `packages/web-frontend/src/app/pages/tasks2/TasksTable2.tsx` - Add delete button

## Success Criteria

✅ Single delete works with confirmation dialog
✅ Bulk delete works with batch processing (10 per batch)
✅ Visual feedback (strike-through, blur) during operations
✅ Success/failure toasts appear
✅ Real-time updates work after deletion
✅ All tests pass (>70% coverage)
✅ TypeScript check passes
✅ No console errors in browser

## Implementation Order

1. Backend (contract → service → controller)
2. Frontend API client
3. Frontend CRUD hook
4. Frontend table component
5. Frontend page component
6. Tests
7. Verification (check + tests + manual)
