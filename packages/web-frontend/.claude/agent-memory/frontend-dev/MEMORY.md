# Frontend Developer Agent Memory

## Critical Testing Patterns

### React Component Cleanup (Memory Leak Prevention)

**Global cleanup exists but `vi.restoreAllMocks()` is critical:**

The global test setup (`src/framework/tests/setup.ts`) already includes `afterEach(cleanup)` for all tests. However, tests using `vi.spyOn()` accumulate spy objects that prevent garbage collection.

**Pattern for tests with mocks:**

```typescript
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('MyComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Clears call history but keeps spies
  });

  afterEach(() => {
    // Restore all mocks to prevent memory leaks from accumulated spies
    vi.restoreAllMocks();
    // Critical: Unmount all components and clean up React state (redundant with global but explicit)
    cleanup();
  });

  it('should render', () => {
    vi.spyOn(someModule, 'someFunction').mockReturnValue({...});
    render(<MyComponent />);
    // test assertions
  });
});
```

**Why `vi.restoreAllMocks()` matters:**

- `vi.clearAllMocks()` only clears call history, not the spy objects themselves
- `vi.spyOn()` creates new spy wrappers each test that accumulate in memory
- `vi.restoreAllMocks()` removes spies and restores original implementations
- FileTree tests: 7 tests × each creating 1 spy = linear memory growth until OOM

**Fixed files (2026-02-26):**

- `src/app/pages/projects2/files/FileTree.test.tsx` (added `vi.restoreAllMocks()`)
- `src/app/pages/projects2/files/FileBrowserPanel.test.tsx` (added `vi.restoreAllMocks()`)
- `src/app/pages/projects2/files/FileEditorPanel.test.tsx` (added `vi.restoreAllMocks()`)

**Root cause:** Tests creating spies in every test without restoring them, causing exponential memory growth.

## Test Configuration Notes

- Global cleanup exists in `src/framework/tests/setup.ts` (automatic for all tests)
- Vitest runs with `pool: 'forks'` and `maxForks: 1` (sequential, isolated processes)
- Current memory allocation: 8GB (`NODE_OPTIONS=--max-old-space-size=8192`)
- This high allocation masks spy accumulation memory leaks
