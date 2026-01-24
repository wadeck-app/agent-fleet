# Composable Forms - Quick Reference

## When to Use

Use the new composable pattern when:

- Creating new dialogs with forms
- Form content might be long (needs scrolling)
- You want footer buttons always visible

Use the legacy pattern when:

- Maintaining existing dialogs (already working)
- Quick prototypes (less boilerplate)

## New Pattern (Recommended)

### Basic Template

```tsx
import { FormContainer } from '@framework/features/forms/FormContainer';
import { FormActions, type FormAction } from '@framework/features/forms/FormActions';
import { DialogBody, DialogFooter } from '@framework/components/overlays/Dialog';

export function MyDialog({ open, onOpenChange }: Props) {
  const FORM_ID = 'my-dialog-form';
  const formState = useFormState({ ... });

  const actions: FormAction[] = [
    { label: 'Save', type: 'submit', formId: FORM_ID },
    { label: 'Cancel', variant: 'outline', onClick: () => onOpenChange(false) },
  ];

  return (
    <CrudDialog open={open} onOpenChange={onOpenChange} title="My Dialog">
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

### With Secondary Actions

```tsx
const actions: FormAction[] = [
	{ label: 'Save', type: 'submit', formId: FORM_ID },
	{ label: 'Save and Open', type: 'button', onClick: handleSaveAndOpen },
	{ label: 'Cancel', variant: 'outline', onClick: () => close() },
];
```

### Custom Layout (Two Columns)

```tsx
<FormContainer id={FORM_ID} onSubmit={...} className="grid-cols-1">
  <div className="flex gap-4">
    <div className="flex-1">
      <TextField label="Left" {...} />
    </div>
    <div className="flex-1">
      <TextField label="Right" {...} />
    </div>
  </div>
</FormContainer>
```

## Legacy Pattern (Backward Compatible)

```tsx
import { FormContainerLegacy as FormContainer } from '@framework/features/forms/FormContainer';

<CrudDialog open={open} onOpenChange={onOpenChange} title="My Dialog">
  <FormContainer
    onSubmit={formState.handleSubmit}
    onCancel={() => onOpenChange(false)}
    submitLabel="Save"
    isSubmitting={formState.isSubmitting}
    secondaryActions={[
      { label: 'Action', onClick: handleAction }
    ]}
  >
    <TextField label="Name" {...} />
  </FormContainer>
</CrudDialog>
```

## FormAction Interface

```tsx
interface FormAction {
	label: string; // Button text
	onClick?: () => void; // Click handler (for type='button')
	type?: 'submit' | 'button' | 'reset'; // Button type (default: 'button')
	variant?: 'default' | 'outline' | 'ghost' | 'destructive'; // Style
	disabled?: boolean; // Individual disabled state
	formId?: string; // External form submission (for type='submit')
}
```

## Common Patterns

### Submit Only

```tsx
const actions: FormAction[] = [{ label: 'Save', type: 'submit', formId: FORM_ID }];
```

### Submit + Cancel

```tsx
const actions: FormAction[] = [
	{ label: 'Save', type: 'submit', formId: FORM_ID },
	{ label: 'Cancel', variant: 'outline', onClick: () => close() },
];
```

### Submit + Secondary + Cancel

```tsx
const actions: FormAction[] = [
	{ label: 'Save', type: 'submit', formId: FORM_ID },
	{ label: 'Save and Close', type: 'button', onClick: handleSaveAndClose },
	{ label: 'Cancel', variant: 'outline', onClick: () => close() },
];
```

### Destructive Action

```tsx
const actions: FormAction[] = [
	{ label: 'Delete', type: 'button', variant: 'destructive', onClick: handleDelete },
	{ label: 'Cancel', variant: 'outline', onClick: () => close() },
];
```

### Conditional Disabled

```tsx
const actions: FormAction[] = [
	{
		label: 'Save',
		type: 'submit',
		formId: FORM_ID,
		disabled: !isValid, // Individual disabled
	},
	{ label: 'Cancel', variant: 'outline', onClick: () => close() },
];

// Pass isSubmitting to disable ALL buttons during submission
<FormActions actions={actions} isSubmitting={formState.isSubmitting} />;
```

## Checklist

### Creating New Dialog

- [ ] Define `FORM_ID` constant
- [ ] Define `actions: FormAction[]`
- [ ] Use `DialogBody` with `FormContainer`
- [ ] Use `DialogFooter` with `FormActions`
- [ ] Pass `isSubmitting` to FormActions
- [ ] Set `formId` on submit actions

### Migration from Legacy

- [ ] Create `FORM_ID` constant
- [ ] Convert `secondaryActions` to `FormAction[]`
- [ ] Remove `onSubmit`, `onCancel`, `submitLabel`, `isSubmitting` from FormContainer props
- [ ] Add `id` prop to FormContainer
- [ ] Wrap FormContainer in `DialogBody`
- [ ] Add `DialogFooter` with `FormActions`
- [ ] Import `DialogBody` and `DialogFooter`

## Common Mistakes

### ❌ Wrong: Footer inside FormContainer

```tsx
<FormContainer id={FORM_ID} onSubmit={...}>
  <fields />
  <DialogFooter> {/* Wrong! Will scroll */}
    <FormActions />
  </DialogFooter>
</FormContainer>
```

### ✅ Correct: Footer as sibling

```tsx
<DialogBody>
  <FormContainer id={FORM_ID} onSubmit={...}>
    <fields />
  </FormContainer>
</DialogBody>
<DialogFooter> {/* Correct! Fixed */}
  <FormActions />
</DialogFooter>
```

### ❌ Wrong: Missing formId on submit button

```tsx
const actions: FormAction[] = [
	{ label: 'Save', type: 'submit' }, // Wrong! No formId
];
```

### ✅ Correct: Include formId

```tsx
const actions: FormAction[] = [
	{ label: 'Save', type: 'submit', formId: FORM_ID }, // Correct!
];
```

### ❌ Wrong: Forgot isSubmitting

```tsx
<FormActions actions={actions} /> {/* Wrong! Buttons stay enabled */}
```

### ✅ Correct: Pass isSubmitting

```tsx
<FormActions actions={actions} isSubmitting={formState.isSubmitting} />
```

## Testing

### Manual Test

1. Open dialog
2. Scroll content → Footer should stay fixed
3. Fill form
4. Click submit → Should work
5. During submit → All buttons disabled

### Unit Test

```tsx
import { render, screen } from '@testing-library/react';

import { FormActions } from './FormActions';

it('supports external form submission', () => {
	const actions: FormAction[] = [{ label: 'Submit', type: 'submit', formId: 'my-form' }];

	render(<FormActions actions={actions} />);

	const button = screen.getByRole('button', { name: 'Submit' });
	expect(button).toHaveAttribute('form', 'my-form');
});
```

## Troubleshooting

### Footer scrolls with content

- ✅ Check: DialogBody and DialogFooter are siblings
- ✅ Check: FormContainer is inside DialogBody
- ✅ Check: DialogFooter is NOT inside FormContainer

### Submit button doesn't work

- ✅ Check: `formId` matches `FormContainer` id
- ✅ Check: `type='submit'` on submit action
- ✅ Check: `onSubmit` handler is defined on FormContainer

### All buttons disabled incorrectly

- ✅ Check: Individual action `disabled` state
- ✅ Check: `isSubmitting` prop on FormActions
- ✅ Check: `formState.isSubmitting` value

## Performance Tips

1. Define `FORM_ID` outside component (constant)
2. Memoize `actions` array if using computed values
3. Use `useCallback` for action onClick handlers

```tsx
// Outside component (best)
const FORM_ID = 'my-form';

export function MyDialog() {
	// Inside component, with memoization
	const actions = useMemo(
		(): FormAction[] => [
			{ label: 'Save', type: 'submit', formId: FORM_ID },
			{ label: 'Cancel', variant: 'outline', onClick: handleCancel },
		],
		[handleCancel]
	);

	const handleCancel = useCallback(() => {
		onOpenChange(false);
	}, [onOpenChange]);
}
```

## See Also

- Full docs: `.claude/docs/composable-forms-pattern.md`
- Example: `packages/web-frontend/src/app/pages/tasks/CreateTaskDialog.tsx`
- Tests: `test-composable-forms.md`
