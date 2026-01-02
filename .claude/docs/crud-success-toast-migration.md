# CRUD Success Toast Migration Guide

## Overview

This document tracks the migration to add success toast notifications for all CRUD operations across the application. Success toasts provide essential user feedback and improve the overall UX.

## Pattern

Use the `useCrudSuccessToast` hook for consistent success messaging:

```typescript
import { useCrudSuccessToast } from '@framework/hooks/useCrudSuccessToast';

// In component:
const successToast = useCrudSuccessToast('ingredient'); // or 'book', 'worker', etc.

// In handlers:
await createIngredient(data);
successToast.created(); // ✓ Ingredient created successfully

await updateIngredient(id, data);
successToast.updated(); // ✓ Ingredient updated successfully

await deleteIngredient(id);
successToast.deleted(); // ✓ Ingredient deleted successfully
```

## Migration Status

### ✅ Completed

| Page                          | Operations             | Status  | Notes                                  |
| ----------------------------- | ---------------------- | ------- | -------------------------------------- |
| **Ingredients2Page** (v2)     | Create, Update, Delete | ✅ Done | Uses `useCrudSuccessToast`             |
| **Ingredients3GridPage** (v3) | Create, Update, Delete | ✅ Done | Uses `useCrudSuccessToast`             |
| **IngredientsPage** (v1)      | Create, Update, Delete | ✅ Done | Uses `useCrudSuccessToast`             |
| **BooksPage**                 | Create, Update, Delete | ✅ Done | Uses `useCrudSuccessToast`             |
| **FlowEditorPage**            | Save (Update)          | ✅ Done | Uses direct `showToast` with useEffect |
| **TasksPage**                 | Create                 | ✅ Done | Uses direct `showToast` in callback    |

### ℹ️ No CRUD Operations

| Page               | Notes                                          |
| ------------------ | ---------------------------------------------- |
| **WorkersPage**    | Read-only page with only refresh functionality |
| **WorkspacesPage** | Read-only page with only refresh functionality |

## Implementation Checklist

For each page that needs migration:

1. **Import the hook**

    ```typescript
    import { useCrudSuccessToast } from '@framework/hooks/useCrudSuccessToast';
    ```

2. **Initialize the hook**

    ```typescript
    const successToast = useCrudSuccessToast('itemTypeName');
    ```

3. **Add success toasts to handlers**
    - After successful create: `successToast.created()`
    - After successful update: `successToast.updated()`
    - After successful delete: `successToast.deleted()`

4. **Test all operations**
    - Create a new item → should see success toast
    - Update an existing item → should see success toast
    - Delete an item → should see success toast
    - Error cases → should still show error toasts (via `useErrorToast`)

## Benefits

✅ **Consistent UX**: All CRUD operations provide immediate user feedback
✅ **User Confidence**: Users know their actions succeeded
✅ **Error Distinction**: Success toasts complement error toasts
✅ **Maintainability**: Centralized message patterns via hook
✅ **Accessibility**: Visual feedback for successful operations

## Related Files

- **Hook**: `packages/web-frontend/src/framework/hooks/useCrudSuccessToast.ts`
- **Error Toast Hook**: `packages/web-frontend/src/framework/hooks/useErrorToast.ts`
- **Toast Context**: `packages/web-frontend/src/framework/features/toast/ToastContext.tsx`
- **Example Implementations**:
    - `packages/web-frontend/src/app/pages/ingredients2/Ingredients2Page.tsx`
    - `packages/web-frontend/src/app/pages/ingredients3/Ingredients3GridPage.tsx`

## Notes

- Bulk delete operations already have success toasts via `BulkDeleteWorkflow` component
- The hook automatically capitalizes item names ("ingredient" → "Ingredient")
- Use `successToast.custom('message')` for non-standard success messages
- Always call success toasts AFTER the operation completes and AFTER refreshing the data
