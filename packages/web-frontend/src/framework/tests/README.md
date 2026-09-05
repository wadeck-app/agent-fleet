 Test Utilities

 Controllable Promise Pattern

 Problem

Using `setTimeout` in tests creates flaky and inefficient tests:

```typescript
//  FLAKY: Race conditions and arbitrary delays
const onSubmit = vi.fn<[CreateBook], Promise<void>>(() => new Promise(resolve => setTimeout(resolve, )));

fireEvent.click(submitButton);

// Problem : May check too early if system is slow
expect(screen.getByText(/saving.../i)).toBeInTheDocument();

// Problem : Wastes ms even if promise could resolve instantly
await waitFor(() => {
	expect(screen.queryByText(/saving.../i)).not.toBeInTheDocument();
});
```

Issues:

.  Too fast: Test may check before loading state appears
.  Too slow: Wastes ms+ per test execution
.  Non-deterministic: Timing depends on system load
.  False positives: Tests may pass despite bugs in timing logic

 Solution: `createControllablePromise`

Complete control over async timeline - resolve promises exactly when you're ready:

```typescript
//  DETERMINISTIC: Full control over timing
const { fn: onSubmit, resolve } = createControllablePromise<[CreateBook], void>();

render(<BookForm onSubmit={onSubmit} />);
fireEvent.click(submitButton);

// Check loading state appears (guaranteed to check at right time)
expect(screen.getByText(/saving.../i)).toBeInTheDocument();

// Complete the promise when YOU decide (not after arbitrary timeout)

---

_Reference content moved to [docs/reference.md](docs/reference.md)._
