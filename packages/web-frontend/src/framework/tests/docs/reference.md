 Reference

_Moved from README -- see [README](../README.md) for the overview._

resolve();

// Check loading state clears
await waitFor(() => {
  expect(screen.queryByText(/saving.../i)).not.toBeInTheDocument();
});
```

 Benefits

.  Deterministic: Tests execute the same way every time
.  Fast: No artificial delays - tests run at maximum speed
.  Precise: Test exactly what you want, when you want
.  Reliable: Eliminates race conditions

 API

```typescript
interface ControllablePromise<TArgs extends unknown[], TReturn> {
	// Function to use as mock or callback
	fn: (...args: TArgs) => Promise<TReturn>;

	// Resolve the pending promise
	resolve: (value?: TReturn) => void;

	// Reject the pending promise
	reject: (error: Error) => void;

	// Get last call arguments
	lastCall: () => TArgs | undefined;

	// Check if function was called
	wasCalled: () => boolean;
}
```

 Usage Examples

 Basic async function testing

```typescript
const { fn: onSubmit, resolve } = createControllablePromise<[CreateBook], void>();

render(<BookForm onSubmit={onSubmit} />);

// Fill form and submit
fireEvent.change(titleInput, { target: { value: 'Test Book' } });
fireEvent.click(submitButton);

// Verify loading state
expect(screen.getByText(/saving.../i)).toBeInTheDocument();

// Complete when ready
resolve();

await waitFor(() => {
  expect(screen.queryByText(/saving.../i)).not.toBeInTheDocument();
});
```

 Testing error handling

```typescript
const { fn: onSubmit, reject } = createControllablePromise<[CreateBook], void>();

render(<BookForm onSubmit={onSubmit} />);

fireEvent.click(submitButton);

// Verify loading state
expect(screen.getByText(/saving.../i)).toBeInTheDocument();

// Simulate error
reject(new Error('Network error'));

// Verify error handling
await waitFor(() => {
  expect(screen.queryByText(/saving.../i)).not.toBeInTheDocument();
});
```

 Checking function arguments

```typescript
const { fn: onSubmit, lastCall, resolve } = createControllablePromise<[CreateBook], void>();

render(<BookForm onSubmit={onSubmit} />);

fireEvent.change(titleInput, { target: { value: 'Clean Code' } });
fireEvent.click(submitButton);

// Verify correct data was passed
expect(lastCall()).toEqual([{
  title: 'Clean Code',
  author: 'Robert C. Martin',
  // ... other fields
}]);

resolve();
```

 Using with `vi.fn()` compatibility

```typescript
// Works with vitest's mock system
const mockSubmit = vi.fn();
const { fn: controllableSubmit, resolve } = createControllablePromise<[CreateBook], void>();

mockSubmit.mockImplementation(controllableSubmit);

// Now you have both controllable timing AND vitest's mock tracking
expect(mockSubmit).toHaveBeenCalledOnce();
resolve();
```

 When to Use

Use `createControllablePromise` when:

-  Testing async UI states (loading, success, error)
-  Verifying state transitions at specific moments
-  Testing race conditions or concurrent operations
-  Need precise control over when promises resolve

Don't use when:

-  Promise resolves immediately (use `mockResolvedValue`)
-  Don't care about intermediate states
-  Testing synchronous code

 Migration Guide

Before:

```typescript
const mockOnSubmit = vi.fn<[CreateBook], Promise<void>>(() => new Promise(resolve => setTimeout(resolve, )));
```

After:

```typescript
const { fn: onSubmit, resolve } = createControllablePromise<[CreateBook], void>();

// Use onSubmit as you would mockOnSubmit
// Call resolve() when you want the promise to complete
```

 Real-World Examples

 Integration Tests (Recommended)

See `packages/frontend/src/features/form/FormContainer.test.tsx:-` for the canonical example of testing `FormContainer` + `useFormState` integration with minimal context:

```typescript
function TestForm({ onSubmit }) {
  const { formData, updateField, isSubmitting, handleSubmit } = useFormState({
    defaultData: { name: '' },
    validator: () => ({ valid: true, errors: [] }),
    errorFieldMapping: {},
    onSubmit,
  });

  return (
    <FormContainer
      title="Test Form"
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onCancel={() => {}}
      submitLabel="Create"
    >
      <input value={formData.name} onChange={(e) => updateField('name', e.target.value)} />
    </FormContainer>
  );
}

const { fn: onSubmit, resolve } = createControllablePromise<[TestFormData], void>();
render(<TestForm onSubmit={onSubmit} />);
// ... test loading states with full control
```

 Hook Unit Tests

See `packages/frontend/src/features/form/useFormState.test.ts:-` for testing the hook in isolation:

```typescript
const { fn: controllableSubmit, resolve } = createControllablePromise<[TestFormData], void>();
mockOnSubmit.mockImplementation(controllableSubmit);
// ... test isSubmitting flag transitions
```

 Test Architecture

Tests should be organized by level:

```
. Unit Tests
    packages/frontend/src/features/form/FormContainer.test.tsx → UI states (isSubmitting prop)
    packages/frontend/src/features/form/useFormState.test.ts → Hook logic
    packages/frontend/src/features/form/BookForm.test.tsx → Component wiring

. Integration Tests  (Use createControllablePromise here)
    packages/frontend/src/features/form/FormContainer.test.tsx → FormContainer + useFormState
        Loading state transitions
        Error handling
        Button state management

. Feature Tests
    packages/frontend/src/features/form/BookForm.test.tsx → Data flow verification
```

Key principle: Test at the lowest possible level. Integration tests for `FormContainer` + `useFormState` are more valuable than testing through `BookForm` because they prove the generic pattern works.

---

Location: `packages/frontend/src/test/createControllablePromise.ts`
Tests: `packages/frontend/src/test/createControllablePromise.test.ts`
