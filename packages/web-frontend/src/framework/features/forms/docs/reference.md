# Reference

_Moved from README -- see [README](../README.md) for the overview._

- Submit button with loading state ("Saving...")
- Cancel button
- Automatic button disabling during submission

**Props:**

```typescript
interface FormContainerProps {
	title: string;
	isSubmitting: boolean;
	onSubmit: (e: React.FormEvent) => void;
	onCancel: () => void;
	submitLabel: string;
	children: React.ReactNode;
}
```

### Field Components (High-Level)

Complete form fields with label, input, and error display. Use these for standard form layouts.

#### TextField

Text-based inputs (text, email, password, tel, url)

```typescript
<TextField
  label="Email"
  type="email"
  value={email}
  onChange={setEmail}
  placeholder="you@example.com"
  required
  error={errors.email}
/>
```

#### NumberField

Numeric inputs with configurable step, min, and max

```typescript
<NumberField
  label="Price"
  value={price}
  onChange={setPrice}
  step={0.01}
  min={0}
  placeholder="0.00"
/>
```

#### IntegerField

Convenience wrapper for whole numbers (step=1)

```typescript
<IntegerField
  label="Quantity"
  value={quantity}
  onChange={setQuantity}
  min={0}
/>
```

#### SelectField

Dropdown selection with options

```typescript
<SelectField
  label="Country"
  value={country}
  onChange={setCountry}
  placeholder="Select a country"
  options={[
    { value: 'us', label: 'United States' },
    { value: 'uk', label: 'United Kingdom' },
  ]}
  required
/>
```

#### TextAreaField

Multi-line text input

```typescript
<TextAreaField
  label="Description"
  value={description}
  onChange={setDescription}
  rows={4}
  placeholder="Enter description..."
/>
```

#### DateField

Date picker (ISO format: YYYY-MM-DD)

```typescript
<DateField
  label="Birth Date"
  value={birthDate}
  onChange={setBirthDate}
  min="1900-01-01"
  max="2024-12-31"
/>
```

#### CheckboxField

Checkbox with inline label

```typescript
<CheckboxField
  label="I agree to the terms"
  checked={agreed}
  onChange={setAgreed}
  required
/>
```

### Input Components (Low-Level)

Styled input wrappers without labels. Use these when you need custom layouts or want to compose your own field components.

- **TextInput**: Basic text input wrapper
- **NumberInput**: Number input wrapper
- **SelectInput**: Select dropdown wrapper
- **TextAreaInput**: TextArea wrapper
- **DateInput**: Date input wrapper
- **CheckboxInput**: Checkbox wrapper

Example custom field:

```typescript
<div className="flex items-center gap-2">
  <TextInput
    value={isbn}
    onChange={setIsbn}
    placeholder="ISBN"
  />
  <Button onClick={checkIsbn}>Check</Button>
</div>
```

## Hooks

### useFormState

Manages form state, real-time validation, and async submission.

**Features:**

- Real-time validation as user types
- Async submission handling with loading state
- Automatic form reset after successful submission
- Error handling and display
- Field-level error mapping

**Usage:**

```typescript
const { formData, updateField, isSubmitting, validationErrors, handleSubmit } = useFormState({
	defaultData: { name: '', email: '' },
	initialData: existingData, // Optional
	validator: data => {
		const errors = [];
		if (!data.name) errors.push('Name is required');
		if (!data.email) errors.push('Email is required');
		return { valid: errors.length === 0, errors };
	},
	errorFieldMapping: {
		Name: 'name',
		Email: 'email',
	},
	onSubmit: async data => {
		await api.submit(data);
	},
});
```

## Integration Example

Complete working example combining FormContainer, field components, and useFormState:

```typescript
import { FormContainer, TextField, useFormState } from '@framework/features/forms';

function MyForm({ onSubmit, initialData }) {
  const {
    formData,
    updateField,
    isSubmitting,
    validationErrors,
    handleSubmit
  } = useFormState({
    defaultData: { name: '', email: '' },
    initialData,
    validator: (data) => {
      const errors = [];
      if (!data.name) errors.push('Name is required');
      if (!data.email) errors.push('Email is required');
      return { valid: errors.length === 0, errors };
    },
    errorFieldMapping: {
      'Name': 'name',
      'Email': 'email'
    },
    onSubmit
  });

  return (
    <FormContainer
      title="My Form"
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onCancel={() => {}}
      submitLabel="Create"
    >
      <TextField
        label="Name"
        value={formData.name}
        onChange={(value) => updateField('name', value)}
        required
        error={validationErrors.name}
      />

      <TextField
        label="Email"
        type="email"
        value={formData.email}
        onChange={(value) => updateField('email', value)}
        required
        error={validationErrors.email}
      />
    </FormContainer>
  );
}
```

## Testing

### Unit Tests

- `FormContainer.test.tsx` - Tests UI props and interactions
- `useFormState.test.ts` - Tests hook logic in isolation

### Integration Tests

- `FormContainer.test.tsx` (lines 143-259) - Tests FormContainer + useFormState working together

**Key testing pattern**: Use `createControllablePromise` for deterministic async testing:

```typescript
import { createControllablePromise } from '@/test/createControllablePromise';

const { fn: onSubmit, resolve } = createControllablePromise();

// Submit form
fireEvent.click(submitButton);

// Verify loading state
expect(screen.getByText(/saving.../i)).toBeInTheDocument();

// Complete submission when ready (no race conditions!)
resolve();

// Verify completion
await waitFor(() => {
	expect(screen.queryByText(/saving.../i)).not.toBeInTheDocument();
});
```

See `@/test/README.md` for more details on testing patterns.

## Design Principles

1. **Generic & Reusable**: Works for any form, not tied to specific entities
2. **Composable**: Small, focused components that work together
3. **Type-safe**: Full TypeScript support with generics
4. **Testable**: Each piece testable in isolation and integration
5. **Deterministic**: No flaky async behavior in tests

## Real-World Usage

This form system is used by:

- `features/BookForm.tsx` - Book creation/editing
- `features/IngredientForm.tsx` - Ingredient creation/editing

Both demonstrate the pattern: feature-specific forms compose these generic building blocks.
