# Custom ESLint Rules - Error Handling

Custom ESLint rules to enforce best practices for error handling in the frontend codebase.

## Rules

### 1. `error-handling/require-get-error-message` (error)

**Problem**: Direct access to `error.message` doesn't properly format Zod validation errors from API responses, resulting in generic "ValidationError" messages instead of user-friendly field-specific errors.

**Detects**:

```typescript
// ❌ BAD - Will be flagged
catch (error) {
  const message = error.message; // ESLint error here
  showToast(message, 'error');
}
```

**Solution**:

```typescript
// ✅ GOOD
import { getErrorMessage } from '@framework/utils/errors/errorUtils';

catch (error) {
  showToast(getErrorMessage(error), 'error');
}
```

**Exceptions**:

- Allows `error.message` inside `console.error()`, `console.log()`, and `console.warn()` for debugging
- Only applies inside `catch` blocks
- Only checks variables named `error`, `err`, or `e`

---

### 2. `error-handling/require-user-feedback-on-error` (warn)

**Problem**: Catching errors silently or only logging them without showing user feedback creates a poor UX where users don't know something went wrong.

**Detects**:

---

_Reference content moved to [docs/reference.md](docs/reference.md)._
