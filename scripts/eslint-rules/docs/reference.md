# Reference

_Moved from README -- see [README](../README.md) for the overview._

```typescript
// ❌ BAD - Will be flagged
try {
	await loadProjects();
} catch (error) {
	console.error('Failed:', error); // Only logging, no user feedback
}
```

**Solution**:

```typescript
// ✅ GOOD
try {
	await loadProjects();
} catch (error) {
	showToast(getErrorMessage(error), 'error'); // User sees the error
	console.error('Failed:', error);
}
```

**Exceptions**:

- Skips test files (`.test.ts`, `.spec.ts`)
- Allows re-throwing errors (delegates feedback to caller)
- Allows `setError()` calls (for form validation)
- Only applies to files in `src/app/` and `src/framework/`

---

### 3. `error-handling/defensive-array-access` (warn)

**Problem**: API responses may return `undefined` or `null` for array properties, causing runtime errors when calling `.map()`, `.filter()`, etc.

**Detects**:

```typescript
// ❌ BAD - Will be flagged
const response = await api.getProjects();
const ids = response.items.map(p => p.id); // Crashes if items is undefined
```

**Solution**:

```typescript
// ✅ GOOD
const response = await api.getProjects();
const ids = (response.items || []).map(p => p.id); // Safe
```

**What it checks**:

- Array methods: `.map()`, `.filter()`, `.forEach()`, `.reduce()`, `.find()`, `.some()`, `.every()`
- API response properties: `items`, `results`, `data`, `list`, `entries`, `rows`
- Response variable names: `response`, `data`, `result`

---

## Configuration

These rules are automatically enabled in `packages/web-frontend/eslint.config.mjs`:

```javascript
rules: {
  'error-handling/require-get-error-message': 'error',
  'error-handling/require-user-feedback-on-error': 'warn',
  'error-handling/defensive-array-access': 'warn',
}
```

## Running ESLint

```bash
# Check all files
npm run lint

# Check specific file
cd packages/web-frontend
npx eslint src/app/pages/tasks/CreateTaskDialog.tsx

# Auto-fix issues (won't fix error-handling rules, they require manual fixes)
npm run lint:fix
```

## Why These Rules?

These rules were added after discovering multiple UX issues:

1. **ValidationError Toast Issue** (Jan 2025): Users saw generic "ValidationError" instead of "description: Description is required"
2. **Silent Failures**: API errors being caught and logged without user notification
3. **Runtime Crashes**: `response.items.map()` crashing when API returns null

See `.claude/kb/lessons-learned.md` for more context.

## Disabling Rules (Use Sparingly)

If you have a legitimate reason to disable a rule:

```typescript
// eslint-disable-next-line error-handling/require-get-error-message
const message = error.message; // Only for logging, not user-facing
```

**Note**: Disabling should be rare. If you find yourself disabling these rules often, there's likely a better pattern.
