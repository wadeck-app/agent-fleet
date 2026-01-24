# Prevent Outside Click - Dialog Component

## Overview

The `preventOutsideClick` prop prevents accidental dialog closure when users click outside the dialog. This is particularly important for form dialogs where users might lose unsaved data.

## Implementation

The feature is implemented at three levels:

1. **Dialog.tsx** - Base component with `onInteractOutside` handler
2. **CrudDialog.tsx** - Wrapper that propagates the prop
3. **Form Dialogs** - Individual dialogs that enable the feature

## Usage

### Basic Example

```tsx
<CrudDialog
	open={open}
	onOpenChange={onOpenChange}
	title="Create Task"
	description="Fill in the details"
	preventOutsideClick={true} // Prevents closing on outside click
>
	<FormContainer>{/* form fields */}</FormContainer>
</CrudDialog>
```

### When to Use

**Enable `preventOutsideClick={true}` for:**

- Create forms with user input
- Edit forms with user input
- Forms with complex validation
- Any dialog where data loss would be frustrating

**Leave default (false) for:**

- Read-only dialogs
- Confirmation dialogs
- Configuration dialogs without forms
- Dialogs with auto-save functionality

## Examples in Codebase

### Forms with preventOutsideClick enabled:

- `CreateTaskDialog.tsx` - Task creation form
- `CreateProjectDialog.tsx` - Project creation form
- `EditProjectDialog.tsx` - Project edit form

### Dialogs with default behavior:

- `ConfigureScriptsDialog.tsx` - Auto-save configuration (no data loss risk)

## Technical Details

### How It Works

The implementation uses Radix UI's `onInteractOutside` event:

```tsx
<DialogPrimitive.Content
  onInteractOutside={(e) => {
    if (preventOutsideClick) {
      e.preventDefault();
    }
  }}
>
```

### User Experience

- **With preventOutsideClick=true:**
    - Click outside → Dialog stays open
    - Escape key → Dialog still closes (expected behavior)
    - X button → Dialog closes
    - Cancel button → Dialog closes

- **With preventOutsideClick=false (default):**
    - Click outside → Dialog closes
    - Escape key → Dialog closes
    - X button → Dialog closes
    - Cancel button → Dialog closes

## Best Practices

1. **Always enable for forms with user input** - Prevents accidental data loss
2. **Document the behavior** - Add a comment when setting the prop
3. **Consider form state** - If form has auto-save, default behavior might be fine
4. **Test the UX** - Ensure users can still close the dialog easily via X or Cancel

## Testing

Tests are included in `CrudDialog.test.tsx` to verify:

- Prop acceptance without errors
- Default behavior when prop is omitted
- Behavior with both true and false values

## References

- Radix UI Dialog: https://www.radix-ui.com/primitives/docs/components/dialog
- Implementation: `packages/web-frontend/src/framework/components/overlays/Dialog.tsx`
