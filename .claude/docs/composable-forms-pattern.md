# Composable Forms Pattern

## Overview

The composable forms pattern separates form structure from form actions, making components reusable across different contexts (pages or dialogs) while ensuring proper visual hierarchy (fixed headers/footers with scrollable content).

## Problem Statement

### Before: Tightly Coupled Form + Footer

```tsx
// OLD PATTERN - Footer scrolls with content ❌
<CrudDialog>
  <form>
    <scrollable content>
      <fields>
    <DialogFooter> ❌ Scrolls!
      <buttons>
    </DialogFooter>
  </form>
</CrudDialog>
```

**Issues:**

- Footer scrolls out of view with long forms
- Form component makes UI decisions (buttons, layout)
- Not reusable in different contexts
- Couples form logic with presentation

### After: Composable Components

```tsx
// NEW PATTERN - Footer is fixed ✅
<CrudDialog>
  <DialogBody> ✅ Scrollable
    <FormContainer id="my-form" onSubmit={...}>
      <fields>
    </FormContainer>
  </DialogBody>
  <DialogFooter> ✅ Fixed
    <FormActions actions={...} formId="my-form" />
  </DialogFooter>
</CrudDialog>
```

**Benefits:**

- Footer always visible at bottom
- FormContainer is pure (no UI decisions)
- FormActions is reusable view component
- Works in both dialogs and pages
- External form submission via HTML form attribute

## Architecture

### 1. FormContainer (Pure Form Wrapper)

**File:** `packages/web-frontend/src/framework/features/forms/FormContainer.tsx`

```tsx
export interface FormContainerProps {
	id: string; // Form ID for external submission
	onSubmit: (e: FormEvent) => void;
	children: ReactNode;
	className?: string;
}

export function FormContainer({ id, onSubmit, children, className }: FormContainerProps) {
	return (
		<form id={id} onSubmit={onSubmit} className={cn('grid gap-4 md:grid-cols-2', className)}>
			{children}
		</form>
	);
}
```

**Responsibilities:**

- Wraps form fields in a `<form>` element
- Provides unique ID for external submission
- Applies grid layout
- NO UI decisions (buttons, footer, etc.)

### 2. FormActions (Pure Action Buttons)

**File:** `packages/web-frontend/src/framework/features/forms/FormActions.tsx`

```tsx
export interface FormAction {
	label: string;
	onClick?: () => void;
	type?: 'submit' | 'button' | 'reset';
	variant?: 'default' | 'outline' | 'ghost' | 'destructive';
	disabled?: boolean;
	formId?: string; // For external form submission
}

export function FormActions({ actions, isSubmitting }: FormActionsProps) {
	return (
		<>
			{actions.map((action, index) => (
				<Button
					key={index}
					type={action.type || 'button'}
					variant={action.variant || 'default'}
					onClick={action.onClick}
					disabled={action.disabled ?? isSubmitting}
					form={action.formId} // External form submission
				>
					{action.label}
				</Button>
			))}
		</>
	);
}
```

**Responsibilities:**

- Renders action buttons
- Supports external form submission
- NO business logic

### 3. Dialog Structure

**Key CSS Classes:**

- `DialogContent`: `flex flex-col` (stacks children vertically)
- `DialogHeader`: `flex-shrink-0` (fixed height)
- `DialogBody`: `flex-1 overflow-y-auto` (grows and scrolls)
- `DialogFooter`: `flex-shrink-0` (fixed height)

```tsx
<DialogContent className="flex flex-col">
	<DialogHeader className="flex-shrink-0">...</DialogHeader>
	<DialogBody className="flex-1 overflow-y-auto">...</DialogBody>
	<DialogFooter className="flex-shrink-0">...</DialogFooter>
</DialogContent>
```

## Usage Examples

### Example 1: Simple Dialog Form

```tsx
export function CreateTaskDialog({ open, onOpenChange, onSuccess }: Props) {
  const FORM_ID = 'create-task-form';
  const formState = useFormState({ ... });

  const actions: FormAction[] = [
    {
      label: 'Create Task',
      type: 'submit',
      formId: FORM_ID,
      disabled: formState.isSubmitting,
    },
    {
      label: 'Cancel',
      variant: 'outline',
      onClick: () => onOpenChange(false),
    },
  ];

  return (
    <CrudDialog open={open} onOpenChange={onOpenChange} title="Create Task">
      <DialogBody>
        <FormContainer id={FORM_ID} onSubmit={formState.handleSubmit}>
          <TextField label="Name" {...} />
          <TextAreaField label="Description" {...} />
        </FormContainer>
      </DialogBody>

      <DialogFooter>
        <FormActions actions={actions} isSubmitting={formState.isSubmitting} />
      </DialogFooter>
    </CrudDialog>
  );
}
```

### Example 2: Complex Two-Column Layout

```tsx
export function CreateTaskDialog({ open, onOpenChange }: Props) {
  const FORM_ID = 'create-task-form';
  const formState = useFormState({ ... });

  return (
    <CrudDialog open={open} onOpenChange={onOpenChange} title="Create Task" maxWidth="4xl">
      <DialogBody>
        <FormContainer id={FORM_ID} onSubmit={formState.handleSubmit} className="grid-cols-1">
          {/* Custom two-column layout with resizable splitter */}
          <div className="flex gap-4">
            <div className="flex-1">
              <h3>Basic Info</h3>
              <TextField label="Name" {...} />
              <SelectField label="Priority" {...} />
            </div>

            <div className="w-1 bg-border" /> {/* Splitter */}

            <div className="flex-1">
              <h3>Advanced</h3>
              <ComboboxField label="Flow" {...} />
              {/* Dynamic flow inputs */}
            </div>
          </div>
        </FormContainer>
      </DialogBody>

      <DialogFooter>
        <FormActions actions={[...]} />
      </DialogFooter>
    </CrudDialog>
  );
}
```

### Example 3: Page Form (Non-Dialog)

```tsx
export function TaskPage() {
  const FORM_ID = 'task-form';
  const formState = useFormState({ ... });

  return (
    <div className="flex h-full flex-col">
      <header>...</header>

      <main className="flex-1 overflow-y-auto p-4">
        <FormContainer id={FORM_ID} onSubmit={formState.handleSubmit}>
          <TextField label="Name" {...} />
          <TextAreaField label="Description" {...} />
        </FormContainer>
      </main>

      <footer className="border-t p-4">
        <FormActions actions={[...]} />
      </footer>
    </div>
  );
}
```

## Migration Guide

### From Old FormContainer to New Pattern

**Before:**

```tsx
<FormContainer
  onSubmit={formState.handleSubmit}
  onCancel={() => close()}
  submitLabel="Save"
  isSubmitting={formState.isSubmitting}
  secondaryActions={[...]}
>
  {fields}
</FormContainer>
```

**After:**

```tsx
<DialogBody>
  <FormContainer id="my-form" onSubmit={formState.handleSubmit}>
    {fields}
  </FormContainer>
</DialogBody>

<DialogFooter>
  <FormActions
    actions={[
      { label: 'Save', type: 'submit', formId: 'my-form' },
      { label: 'Cancel', variant: 'outline', onClick: () => close() },
    ]}
    isSubmitting={formState.isSubmitting}
  />
</DialogFooter>
```

### Legacy Support

The old `FormContainer` has been renamed to `FormContainerLegacy` and is deprecated but still available for backward compatibility.

```tsx
import { FormContainerLegacy } from '@framework/features/forms/FormContainer';

// Old code continues to work
<FormContainerLegacy
  onSubmit={...}
  onCancel={...}
  submitLabel="Save"
  isSubmitting={...}
>
  {fields}
</FormContainerLegacy>
```

## Testing

### FormActions Unit Tests

```tsx
it('supports external form submission via formId', () => {
	const actions: FormAction[] = [{ label: 'Submit', type: 'submit', formId: 'my-form' }];

	render(<FormActions actions={actions} />);

	const button = screen.getByRole('button', { name: 'Submit' });
	expect(button).toHaveAttribute('form', 'my-form');
});
```

### Integration Testing

```tsx
it('footer stays fixed while content scrolls', () => {
	render(<CreateTaskDialog open={true} />);

	// Check footer is visible
	expect(screen.getByRole('button', { name: 'Create Task' })).toBeVisible();

	// Scroll content
	const body = screen.getByRole('dialog').querySelector('[data-slot="dialog-body"]');
	fireEvent.scroll(body!, { target: { scrollTop: 1000 } });

	// Footer should still be visible
	expect(screen.getByRole('button', { name: 'Create Task' })).toBeVisible();
});
```

## Best Practices

### 1. Always Use Unique Form IDs

```tsx
// ✅ Good
const FORM_ID = 'create-task-form';

// ❌ Bad - can conflict
const FORM_ID = 'form';
```

### 2. Define Actions Outside JSX

```tsx
// ✅ Good - clean and reusable
const actions: FormAction[] = [
  { label: 'Save', type: 'submit', formId: FORM_ID },
  { label: 'Cancel', variant: 'outline', onClick: () => close() },
];

return <FormActions actions={actions} />;

// ❌ Bad - inline makes JSX noisy
return (
  <FormActions
    actions={[
      { label: 'Save', type: 'submit', formId: FORM_ID },
      { label: 'Cancel', variant: 'outline', onClick: () => close() },
    ]}
  />
);
```

### 3. Always Provide isSubmitting State

```tsx
// ✅ Good - disables all buttons during submit
<FormActions actions={actions} isSubmitting={formState.isSubmitting} />

// ❌ Bad - buttons stay enabled during submit
<FormActions actions={actions} />
```

### 4. Use DialogBody and DialogFooter as Siblings

```tsx
// ✅ Good - footer is fixed
<CrudDialog>
  <DialogBody>
    <FormContainer>...</FormContainer>
  </DialogBody>
  <DialogFooter>
    <FormActions />
  </DialogFooter>
</CrudDialog>

// ❌ Bad - footer scrolls
<CrudDialog>
  <DialogBody>
    <FormContainer>
      ...
      <DialogFooter>...</DialogFooter>
    </FormContainer>
  </DialogBody>
</CrudDialog>
```

## Technical Details

### HTML Form Attribute

The pattern uses the HTML `form` attribute on buttons to trigger submission of a form by ID:

```html
<form id="my-form" onsubmit="...">
	<input name="name" />
</form>

<button type="submit" form="my-form">Submit</button>
```

This is standard HTML5 and works across all modern browsers. It allows buttons to be outside the `<form>` element while still triggering submission.

### Flexbox Layout

The dialog uses flexbox to create a fixed header/footer with scrollable body:

```css
.dialog-content {
	display: flex;
	flex-direction: column;
	max-height: 85vh;
}

.dialog-header {
	flex-shrink: 0; /* Fixed height */
}

.dialog-body {
	flex: 1; /* Grows to fill space */
	overflow-y: auto; /* Scrolls if content overflows */
}

.dialog-footer {
	flex-shrink: 0; /* Fixed height */
}
```

## Examples in Codebase

### Fully Migrated

- `CreateTaskDialog.tsx` - Two-column layout with resizable splitter

### Using Legacy Pattern

- `CreateProjectDialog.tsx` - Uses `FormContainerLegacy`
- `EditProjectDialog.tsx` - Uses `FormContainerLegacy`
- `EditWorkspaceDialog.tsx` - Uses `FormContainerLegacy`

## Success Criteria

- ✅ DialogFooter is sibling of DialogBody, not child
- ✅ Footer never scrolls
- ✅ FormContainer is pure, no UI decisions
- ✅ FormActions is reusable view component
- ✅ Pattern works in pages and dialogs
- ✅ TypeScript compiles
- ✅ No visual regressions

## References

- HTML form attribute: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/button#form
- Flexbox layout: https://css-tricks.com/snippets/css/a-guide-to-flexbox/
- React best practices: https://react.dev/learn/sharing-state-between-components
