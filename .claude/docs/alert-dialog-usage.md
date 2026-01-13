# AlertDialog Usage Guide

Complete guide for using AlertDialog components and hooks in the frontend.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Available Patterns](#available-patterns)
3. [Decision Tree](#decision-tree)
4. [API Reference](#api-reference)
5. [Examples](#examples)
6. [Migration Guide](#migration-guide)

## Quick Start

### Delete Confirmation (Recommended)

The easiest way to add delete confirmations:

```tsx
import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';
import { useDialogDeleteConfirmation } from '@framework/hooks/useDialogDeleteConfirmation';

function MyComponent() {
	const deleteConfirmation = useDialogDeleteConfirmation({
		itemTypeName: 'ingredient',
		onDelete: async (id: string) => {
			await deleteIngredient(id);
			refresh();
		},
	});

	return (
		<>
			<Button onClick={() => deleteConfirmation.open(ingredientId)}>Delete</Button>

			<AlertDialogWrapper {...deleteConfirmation.dialogProps} />
		</>
	);
}
```

### Custom Action Confirmation

For other confirmations (reset, publish, archive, etc.):

```tsx
import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';
import { useDialogActionConfirmation } from '@framework/hooks/useDialogActionConfirmation';
import { AlertTriangle } from 'lucide-react';

function FlowEditor() {
	const resetConfirmation = useDialogActionConfirmation({
		title: 'Reset Flow?',
		description: 'All unsaved changes will be lost.',
		confirmLabel: 'Reset',
		variant: 'warning',
		icon: <AlertTriangle />,
		onConfirm: () => resetFlow(),
	});

	return (
		<>
			<Button onClick={() => resetConfirmation.open()}>Reset</Button>
			<AlertDialogWrapper {...resetConfirmation.dialogProps} />
		</>
	);
}
```

## Available Patterns

### 1. Direct Primitives (Full Control)

Use when you need:

- Trigger-based opening (`AlertDialogTrigger`)
- Complex custom layout
- Maximum flexibility

**Files:**

- `packages/web-frontend/src/framework/components/overlays/AlertDialog.tsx`

**Example:**

```tsx
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@framework/components/overlays/AlertDialog';
import { Trash2 } from 'lucide-react';

<AlertDialog>
	<AlertDialogTrigger asChild>
		<Button variant="destructive">Delete</Button>
	</AlertDialogTrigger>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogMedia>
				<Trash2 className="text-destructive" />
			</AlertDialogMedia>
			<AlertDialogTitle>Delete Item?</AlertDialogTitle>
			<AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<AlertDialogAction variant="destructive" onClick={handleDelete}>
				Delete
			</AlertDialogAction>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>;
```

**Pros:**

- Full flexibility
- Icon support
- No state management needed

**Cons:**

- Verbose (~25 lines)
- No programmatic control
- Repetitive code

### 2. AlertDialogWrapper (Simplified API)

Use when you need:

- Controlled state (programmatic open/close)
- Standard layout
- Icon support
- One-off confirmations

**Files:**

- `packages/web-frontend/src/framework/components/overlays/AlertDialogWrapper.tsx`

**Example:**

```tsx
import { useState } from 'react';

import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';
import { Trash2 } from 'lucide-react';

function MyComponent() {
	const [open, setOpen] = useState(false);

	return (
		<>
			<Button onClick={() => setOpen(true)}>Delete</Button>

			<AlertDialogWrapper
				open={open}
				onOpenChange={setOpen}
				title="Delete Item?"
				description="This action cannot be undone."
				confirmLabel="Delete"
				onConfirm={() => handleDelete()}
				variant="danger"
				icon={<Trash2 />}
			/>
		</>
	);
}
```

**Props:**

- `open: boolean` - Whether dialog is open
- `onOpenChange: (open: boolean) => void` - Open state change handler
- `title: string` - Dialog title
- `description: string` - Dialog description
- `confirmLabel?: string` - Confirm button label (default: "Confirm")
- `cancelLabel?: string` - Cancel button label (default: "Cancel")
- `onConfirm: () => void` - Confirm callback
- `onCancel?: () => void` - Cancel callback (optional)
- `variant?: 'danger' | 'warning' | 'info'` - Visual variant (default: "danger")
- `icon?: React.ReactNode` - Optional icon
- `size?: 'default' | 'sm'` - Dialog size (default: "default")

**Pros:**

- Concise (~10 lines)
- Controlled state
- Icon support

**Cons:**

- Manual state management
- No item context support

### 3. useDialog (State Management)

Use when you need:

- Standardized state management
- Context item support (e.g., item ID to delete)
- Async confirmation handling
- Consistent state patterns

**Files:**

- `packages/web-frontend/src/framework/hooks/useDialog.ts`

**Example:**

```tsx
import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';
import { useDialog } from '@framework/hooks/useDialog';
import { Trash2 } from 'lucide-react';

function MyComponent() {
	const dialog = useDialog<string>({
		onConfirm: async itemId => {
			await deleteItem(itemId);
			refresh();
		},
	});

	return (
		<>
			<Button onClick={() => dialog.open(itemId)}>Delete</Button>

			<AlertDialogWrapper
				{...dialog.dialogProps}
				title="Delete Item?"
				description="This action cannot be undone."
				confirmLabel="Delete"
				variant="danger"
				icon={<Trash2 />}
				onConfirm={dialog.confirm}
			/>
		</>
	);
}
```

**API:**

- `isOpen: boolean` - Whether dialog is open
- `item: T | null` - Context item
- `open: (item?: T) => void` - Opens dialog with optional context
- `close: () => void` - Closes dialog
- `confirm: () => Promise<void>` - Confirms action
- `cancel: () => void` - Cancels action
- `dialogProps: { open, onOpenChange }` - Convenience props for AlertDialogWrapper

**Pros:**

- Standardized state management
- Context item support
- Async handling
- Reusable pattern

**Cons:**

- Still need to provide title/description

### 4. useDialogDeleteConfirmation (Zero Boilerplate)

Use when you need:

- Delete confirmations
- Auto-generated title/description
- Zero boilerplate

**Files:**

- `packages/web-frontend/src/framework/hooks/useDialogDeleteConfirmation.ts`

**Example:**

```tsx
import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';
import { useDialogDeleteConfirmation } from '@framework/hooks/useDialogDeleteConfirmation';

function MyComponent() {
	const deleteConfirmation = useDialogDeleteConfirmation({
		itemTypeName: 'ingredient',
		onDelete: async (id: string) => {
			await deleteIngredient(id);
			refresh();
		},
	});

	return (
		<>
			<Button onClick={() => deleteConfirmation.open(ingredientId)}>Delete</Button>

			{/* Everything is pre-configured! */}
			<AlertDialogWrapper {...deleteConfirmation.dialogProps} />
		</>
	);
}
```

**With Personalized Display Name:**

```tsx
interface Ingredient {
	id: string;
	name: string;
}

const deleteConfirmation = useDialogDeleteConfirmation<Ingredient>({
	itemTypeName: 'ingredient',
	onDelete: async ingredient => {
		await deleteIngredient(ingredient.id);
	},
	getItemDisplayName: ingredient => ingredient.name,
});

// Opens with: Delete "Salt"?
deleteConfirmation.open({ id: '123', name: 'Salt' });
```

**Options:**

- `itemTypeName: string` - Item type name (e.g., "ingredient")
- `onDelete: (item: T) => void | Promise<void>` - Delete callback
- `getItemDisplayName?: (item: T) => string` - Optional display name extractor
- `description?: string` - Optional custom description
- `variant?: 'danger' | 'warning'` - Optional variant (default: "danger")
- `icon?: React.ReactNode` - Optional custom icon (default: `<Trash2 />`)

**Auto-generated:**

- **Title:** `"Delete {itemTypeName}?"` or `"Delete \"{displayName}\"?"`
- **Description:** `"This action cannot be undone. The {itemTypeName} will be permanently deleted."`
- **Confirm Label:** `"Delete"`
- **Cancel Label:** `"Cancel"`
- **Icon:** `<Trash2 />`
- **Variant:** `"danger"`

**Pros:**

- Zero boilerplate (<10 lines)
- Auto-generated messages
- Personalized titles
- Complete pre-configuration

**Cons:**

- Less flexible than useDialog

### 5. useDialogActionConfirmation (Flexible Preset)

Use when you need:

- Non-delete confirmations (reset, publish, archive, etc.)
- Pre-configured dialog with custom messaging
- Full control over all options

**Files:**

- `packages/web-frontend/src/framework/hooks/useDialogActionConfirmation.ts`

**Example:**

```tsx
import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';
import { useDialogActionConfirmation } from '@framework/hooks/useDialogActionConfirmation';
import { AlertTriangle } from 'lucide-react';

function FlowEditor() {
	const resetConfirmation = useDialogActionConfirmation({
		title: 'Reset Flow?',
		description: 'All unsaved changes will be lost. This action cannot be undone.',
		confirmLabel: 'Reset',
		cancelLabel: 'Cancel',
		variant: 'warning',
		icon: <AlertTriangle />,
		onConfirm: () => resetFlow(),
	});

	return (
		<>
			<Button onClick={() => resetConfirmation.open()}>Reset</Button>
			<AlertDialogWrapper {...resetConfirmation.dialogProps} />
		</>
	);
}
```

**With Context:**

```tsx
interface Task {
	id: string;
	name: string;
}

const archiveConfirmation = useDialogActionConfirmation<Task>({
	title: 'Archive Task?',
	description: 'Archived tasks can be restored later.',
	confirmLabel: 'Archive',
	variant: 'warning',
	onConfirm: async task => {
		await archiveTask(task.id);
	},
});

archiveConfirmation.open(task);
```

**Options:**

- `title: string` - Dialog title
- `description: string` - Dialog description
- `onConfirm: (context?: T) => void | Promise<void>` - Confirm callback
- `onCancel?: () => void` - Optional cancel callback
- `confirmLabel?: string` - Confirm button label (default: "Confirm")
- `cancelLabel?: string` - Cancel button label (default: "Cancel")
- `variant?: 'danger' | 'warning' | 'info'` - Variant (default: "info")
- `icon?: React.ReactNode` - Optional icon
- `size?: 'default' | 'sm'` - Dialog size (default: "default")

**Pros:**

- Pre-configured
- Full control over messaging
- Context support
- Flexible variant/icon/size

**Cons:**

- Need to provide title/description

## Decision Tree

```
Need confirmation dialog?
│
├─ Trigger-based opening?
│  └─ YES → Use Direct Primitives (AlertDialog + components)
│
├─ Delete confirmation?
│  └─ YES → Use useDialogDeleteConfirmation
│
├─ Custom action (reset, publish, archive)?
│  └─ YES → Use useDialogActionConfirmation
│
├─ Need context item with state management?
│  └─ YES → Use useDialog
│
└─ Simple one-off confirmation?
   └─ Use AlertDialogWrapper
```

## API Reference

### AlertDialogWrapper

```typescript
interface AlertDialogWrapperProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	confirmLabel?: string; // default: "Confirm"
	cancelLabel?: string; // default: "Cancel"
	onConfirm: () => void;
	onCancel?: () => void;
	variant?: 'danger' | 'warning' | 'info'; // default: "danger"
	icon?: React.ReactNode;
	size?: 'default' | 'sm'; // default: "default"
}
```

### useDialog

```typescript
function useDialog<T = string>(options?: {
	onConfirm?: (item: T | null) => void | Promise<void>;
	onCancel?: () => void;
	autoClose?: boolean; // default: true
}): {
	isOpen: boolean;
	item: T | null;
	open: (item?: T) => void;
	close: () => void;
	confirm: () => Promise<void>;
	cancel: () => void;
	dialogProps: {
		open: boolean;
		onOpenChange: (open: boolean) => void;
	};
};
```

### useDialogDeleteConfirmation

```typescript
function useDialogDeleteConfirmation<T = string>(options: {
	itemTypeName: string;
	onDelete: (item: T) => void | Promise<void>;
	getItemDisplayName?: (item: T) => string;
	description?: string;
	variant?: 'danger' | 'warning'; // default: "danger"
	icon?: React.ReactNode; // default: <Trash2 />
}): {
	isOpen: boolean;
	item: T | null;
	open: (item: T) => void;
	close: () => void;
	confirm: () => Promise<void>;
	dialogProps: AlertDialogWrapperProps;
};
```

### useDialogActionConfirmation

```typescript
function useDialogActionConfirmation<T = void>(options: {
	title: string;
	description: string;
	onConfirm: (context?: T) => void | Promise<void>;
	onCancel?: () => void;
	confirmLabel?: string; // default: "Confirm"
	cancelLabel?: string; // default: "Cancel"
	variant?: 'danger' | 'warning' | 'info'; // default: "info"
	icon?: React.ReactNode;
	size?: 'default' | 'sm'; // default: "default"
}): {
	isOpen: boolean;
	context: T | null;
	open: (context?: T) => void;
	close: () => void;
	confirm: () => Promise<void>;
	dialogProps: AlertDialogWrapperProps;
};
```

## Examples

### Delete Confirmation (Generic)

```tsx
const deleteConfirmation = useDialogDeleteConfirmation({
  itemTypeName: 'ingredient',
  onDelete: async (id: string) => {
    await deleteIngredient(id);
    refresh();
  },
});

// Trigger
<Button onClick={() => deleteConfirmation.open(ingredientId)}>Delete</Button>

// Dialog
<AlertDialogWrapper {...deleteConfirmation.dialogProps} />
```

### Delete Confirmation (Personalized)

```tsx
const deleteConfirmation = useDialogDeleteConfirmation<Book>({
	itemTypeName: 'book',
	onDelete: async book => {
		await deleteBook(book.id);
	},
	getItemDisplayName: book => book.title,
});

// Shows: Delete "The Great Gatsby"?
deleteConfirmation.open(book);
```

### Reset Confirmation

```tsx
const resetConfirmation = useDialogActionConfirmation({
	title: 'Reset Flow?',
	description: 'All unsaved changes will be lost.',
	confirmLabel: 'Reset',
	variant: 'warning',
	icon: <AlertTriangle />,
	onConfirm: () => resetFlow(),
});
```

### Publish Confirmation

```tsx
const publishConfirmation = useDialogActionConfirmation({
	title: 'Publish Changes?',
	description: 'Your changes will be visible to all users.',
	confirmLabel: 'Publish',
	variant: 'info',
	onConfirm: async () => {
		await publishChanges();
	},
});
```

### Archive with Context

```tsx
const archiveConfirmation = useDialogActionConfirmation<Task>({
	title: 'Archive Task?',
	description: 'Archived tasks can be restored later.',
	confirmLabel: 'Archive',
	variant: 'warning',
	onConfirm: async task => {
		await archiveTask(task.id);
	},
});

archiveConfirmation.open(task);
```

## Migration Guide

### From Manual State to useDialog

**Before:**

```tsx
const [open, setOpen] = useState(false);
const [itemId, setItemId] = useState<string | null>(null);

const handleClick = (id: string) => {
	setItemId(id);
	setOpen(true);
};

const handleConfirm = async () => {
	if (itemId) {
		await deleteItem(itemId);
	}
	setOpen(false);
	setItemId(null);
};
```

**After:**

```tsx
const dialog = useDialog<string>({
	onConfirm: async id => {
		await deleteItem(id);
	},
});

// Trigger
dialog.open(itemId);

// Dialog props
<AlertDialogWrapper {...dialog.dialogProps} onConfirm={dialog.confirm} />;
```

### From AlertDialogWrapper to useDialogDeleteConfirmation

**Before:**

```tsx
const [itemToDelete, setItemToDelete] = useState<Item | null>(null);

<AlertDialogWrapper
	open={itemToDelete !== null}
	onOpenChange={open => !open && setItemToDelete(null)}
	title={itemToDelete ? `Delete "${itemToDelete.name}"?` : ''}
	description="This action cannot be undone."
	confirmLabel="Delete"
	onConfirm={() => {
		if (itemToDelete) {
			handleDelete(itemToDelete.id);
			setItemToDelete(null);
		}
	}}
	variant="danger"
/>;
```

**After:**

```tsx
const deleteConfirmation = useDialogDeleteConfirmation<Item>({
	itemTypeName: 'item',
	onDelete: item => handleDelete(item.id),
	getItemDisplayName: item => item.name,
});

<AlertDialogWrapper {...deleteConfirmation.dialogProps} />;
```

**Savings:** 10+ lines eliminated, cleaner code

### From Direct Primitives to useDialogDeleteConfirmation

**Before (~25 lines):**

```tsx
<AlertDialog>
	<AlertDialogTrigger asChild>
		<Button variant="destructive">Delete</Button>
	</AlertDialogTrigger>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogMedia>
				<Trash2 className="text-destructive" />
			</AlertDialogMedia>
			<AlertDialogTitle>Delete Item?</AlertDialogTitle>
			<AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<AlertDialogAction variant="destructive" onClick={handleDelete}>
				Delete
			</AlertDialogAction>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>
```

**After (~8 lines):**

```tsx
const deleteConfirmation = useDialogDeleteConfirmation({
  itemTypeName: 'item',
  onDelete: handleDelete,
});

<Button onClick={() => deleteConfirmation.open(itemId)}>Delete</Button>
<AlertDialogWrapper {...deleteConfirmation.dialogProps} />
```

**Savings:** 17+ lines eliminated, programmatic control, cleaner code

## Best Practices

1. **Use the Right Pattern:**
    - Delete confirmations → `useDialogDeleteConfirmation`
    - Other confirmations → `useDialogActionConfirmation`
    - Generic state management → `useDialog`
    - Trigger-based → Direct primitives

2. **Personalize Titles:**
    - Use `getItemDisplayName` for delete confirmations
    - Example: "Delete "Salt"?" vs "Delete ingredient?"

3. **Choose Appropriate Variants:**
    - `danger` - Destructive actions (delete, permanently remove)
    - `warning` - Potentially dangerous actions (reset, clear)
    - `info` - Informational confirmations (publish, archive)

4. **Use Icons for Clarity:**
    - `<Trash2 />` for delete
    - `<AlertTriangle />` for warnings
    - `<Info />` for info
    - Automatic icon styling based on variant

5. **Keep Descriptions Concise:**
    - Explain consequences clearly
    - Mention if action is reversible or not
    - Example: "This action cannot be undone."

6. **Async Handling:**
    - All hooks support async `onConfirm`
    - Dialog auto-closes after confirmation completes
    - Handle errors in your callback

7. **Testing:**
    - All hooks have >90% test coverage
    - Test state management, callbacks, and dialogProps
    - Use `@testing-library/react` for component tests

## Related Files

- **Components:**
    - `packages/web-frontend/src/framework/components/overlays/AlertDialog.tsx`
    - `packages/web-frontend/src/framework/components/overlays/AlertDialogWrapper.tsx`

- **Hooks:**
    - `packages/web-frontend/src/framework/hooks/useDialog.ts`
    - `packages/web-frontend/src/framework/hooks/useDialogDeleteConfirmation.ts`
    - `packages/web-frontend/src/framework/hooks/useDialogActionConfirmation.ts`

- **Examples:**
    - `packages/web-frontend/src/framework/components/advanced/CrudTable.tsx` (uses useDialogDeleteConfirmation)
    - `packages/web-frontend/src/app/components/domain/BulkDeleteWorkflow.tsx` (uses AlertDialogWrapper)
    - `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorPropertiesPanel.tsx` (uses direct primitives)

## Support

For questions or issues:

- Check this guide first
- Review the test files for usage examples
- Ask in the team chat

---

**Last Updated:** 2026-01-02
