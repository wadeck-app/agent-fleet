# Plan: Fix Tests Incrementally with Continuous Validation

## Context

Current state: 256 failing tests across 6 test suites after recent refactoring (commit 37d66a4 - "Refactor all backend logs!").

**Key Learning from Previous Failure:**

- ❌ Creating new tests without immediate validation → bugs accumulate
- ❌ Mass refactoring without checkpoints → cascade failures
- ❌ Parallel modifications without coordination → conflicts
- ✅ **NEW APPROACH**: One fix at a time, validate immediately, commit often

## Strategy

**Golden Rule:** After EVERY change, run tests. If tests fail, fix immediately before proceeding.

**Workflow per step:**

1. Make ONE focused change
2. Run `npm run test:agent` (or specific suite)
3. ✅ Tests pass → `git commit` → proceed to next step
4. ❌ Tests fail → Revert/fix immediately, do NOT proceed

---

## Phase 0: Baseline & Setup

**Objective:** Establish current state and prepare for incremental fixes.

### Step 0.1: Document Current Failures

- Run `npm run test:agent` to generate fresh error log
- Count failures: `grep -E "FAIL" test-errors.log | wc -l`
- Document baseline:
    ```
    Backend Unit Tests: 12 failed / 572 tests
    Frontend Unit Tests: 55 failed / 1684 tests
    Worker Unit Tests: 0 tests (3 files blocked)
    Orchestrator Unit Tests: 77 failed / 209 tests
    E2E: Server startup failed
    ```

**Validation:** Error log generated, baseline documented
**Commit:** Not needed, read-only step

---

## Phase 1: Critical Blocking Issues (Module Imports)

**Target:** Fix 21 "Cannot find module" errors that block entire test suites.

**Impact:** Unblocks Worker tests (3 files) and ~10 Orchestrator tests.

### Step 1.1: Fix Orchestrator Path Aliases

**Problem:** `Cannot find package 'orchestrator/test-utils/MockOrchestrator'` and similar errors.

**Root Cause:** tsconfig.json path aliases out of sync with actual file structure after refactoring.

**Action:**

1. Read `packages/orchestrator/tsconfig.json`
2. Compare `paths` configuration with actual directory structure in `packages/orchestrator/src/`
3. Update path aliases to match actual locations
4. Key exports to verify:
    - `orchestrator/test-utils/*` → `src/test-utils/*`
    - `orchestrator/core/*` → `src/core/*`
    - `orchestrator/websocket/*` → `src/websocket/*`

**Validation:**

```bash
cd packages/orchestrator
npm test
```

**Success Criteria:** Worker tests should now find imports, Orchestrator test count improves by ~10 tests.

**If fails:** Revert tsconfig.json changes, investigate specific import that's still broken.

**Commit:** `fix: restore orchestrator path aliases after refactoring`

---

### Step 1.2: Fix Worker Module Exports

**Problem:** `Cannot find module '/dist-types/flow/ClaudeLifecycleManager'`

**Root Cause:** TypeScript declaration files not being generated or paths incorrect.

**Action:**

1. Check `packages/worker/package.json` - verify `main`, `types`, and `exports` fields
2. Run `npm run build` in worker package to ensure types are generated
3. If paths use `/dist-types`, verify this directory exists after build
4. Update exports to use correct TypeScript declaration paths

**Validation:**

```bash
cd packages/worker
npm test
```

**Success Criteria:** Worker test files should load without import errors.

**If fails:** Check build output, verify declaration files exist in expected location.

**Commit:** `fix: restore worker module exports for test utilities`

---

### Step 1.3: Fix Orchestrator Package Entry

**Problem:** `Failed to resolve entry for package "orchestrator"` in DataStoreFactory test.

**Root Cause:** Vite trying to import orchestrator package but exports field malformed.

**Action:**

1. Read `packages/orchestrator/package.json`
2. Verify `exports` field has correct paths for:
    - Main entry: `".": "./src/index.ts"`
    - Subpath exports: `"./core/*": "./src/core/*.ts"`
3. Update vitest.config.ts in web-backend if needed to add proper alias resolution

**Validation:**

```bash
cd packages/web-backend
npm test -- src/factories/DataStoreFactory.orchestrator-integration.test.ts
```

**Success Criteria:** Test file loads without package resolution error.

**If fails:** Try adding explicit Vite alias in vitest.config.ts instead of relying on package exports.

**Commit:** `fix: configure orchestrator package exports for vitest`

---

**Phase 1 Checkpoint:**

```bash
npm run test:agent:unit
```

**Expected Improvement:**

- Worker: 3 test files → should now run (may have test failures but at least load)
- Orchestrator: 77 failures → target 60-65 failures
- Backend: 12 failures → target 10-11 failures

**If not improved:** Review Phase 1 commits, check for missed imports. Do NOT proceed to Phase 2.

**Commit Phase 1:** `chore: Phase 1 complete - module imports fixed`

---

## Phase 2: Missing Mock Methods (High Priority)

**Target:** Fix 8 "is not a function" errors in mocks.

**Impact:** Unblocks event handling tests and state manager tests.

### Step 2.1: Fix TasksService.writeTrace Mock

**Problem:** `TypeError: this.tasksService.writeTrace is not a function` (4 test failures)

**Root Cause:** OrchestratorEventHandler tests expect writeTrace method but mock doesn't provide it.

**Action:**

1. Read `packages/web-backend/src/services/OrchestratorEventHandler.test.ts`
2. Find mockTasksService definition (usually in beforeEach)
3. Add `writeTrace: vi.fn().mockResolvedValue(undefined)` to mock
4. Verify TasksService.ts actually has this method (may have been renamed/removed)

**Validation:**

```bash
cd packages/web-backend
npm test -- src/services/OrchestratorEventHandler.test.ts
```

**Success Criteria:** 4 tests in OrchestratorEventHandler should pass (related to task_trace_update).

**If fails:** Check if writeTrace was renamed in refactoring. Update both mock and handler code if needed.

**Commit:** `fix: add writeTrace method to TasksService mock`

---

### Step 2.2: Fix StateManager.on Mock

**Problem:** `TypeError: this.stateManager.on is not a function`

**Root Cause:** StateManager mock incomplete after refactoring.

**Action:**

1. Read `packages/shared-orch-worker/StateManager.test.ts`
2. Find StateManager mock/spy setup
3. Add `on: vi.fn()` to mock if missing
4. Check if StateManager is an EventEmitter - if so, mock it properly

**Validation:**

```bash
cd packages/shared-orch-worker
npm test
```

**Success Criteria:** StateManager tests should run without "on is not a function" error.

**If fails:** StateManager might need proper EventEmitter mocking. Use `vi.spyOn(EventEmitter.prototype, 'on')` instead.

**Commit:** `fix: add event emitter methods to StateManager mock`

---

**Phase 2 Checkpoint:**

```bash
npm run test:agent:backend
```

**Expected Improvement:**

- Backend: 12 failures → target 4-6 failures
- OrchestratorEventHandler: All tests should load and execute

**If not improved:** Review mock configurations, ensure all required methods are mocked.

**Commit Phase 2:** `chore: Phase 2 complete - mock methods restored`

---

## Phase 3: Frontend Contract Updates (Medium Priority)

**Target:** Fix 15 state/object shape mismatches in frontend hooks.

**Impact:** Fixes hook tests that broke when return structure changed.

### Step 3.1: Fix useCacheControl2 Contract

**Problem:** Tests expect `{ state, fstate, actions }` but hook only returns `{ fstate, actions, fillQuery }`

**Action:**

1. Read `packages/web-frontend/src/framework/hooks2/useCacheControl2.test.ts`
2. Find assertions checking for `.state` property
3. Remove or update to check for `.fstate` instead
4. Verify `effectiveCacheId` is in expected shape (not just `cacheId` and `isRefreshing`)

**Validation:**

```bash
cd packages/web-frontend
npm test -- src/framework/hooks2/useCacheControl2.test.ts
```

**Success Criteria:** All contract shape tests pass.

**If fails:** Read actual hook implementation to see current return structure, update test to match.

**Commit:** `fix: update useCacheControl2 test contract to match implementation`

---

### Step 3.2: Fix Other Hook Contracts

**Problem:** Similar `.state` property issues in useCategoryFilter2, usePagination2, useSorting2.

**Action:**

1. Apply same fix pattern as Step 3.1 to:
    - `packages/web-frontend/src/framework/hooks2/useCategoryFilter2.test.ts`
    - `packages/web-frontend/src/framework/hooks2/usePagination2.test.ts`
    - `packages/web-frontend/src/framework/hooks2/useSorting2.test.ts`
2. Remove `.state` property checks
3. Update expected shapes to match actual hook returns

**Validation:**

```bash
cd packages/web-frontend
npm test -- src/framework/hooks2/*.test.ts
```

**Success Criteria:** All 4 hook test files pass.

**If fails:** Check each hook's actual return structure, update tests individually.

**Commit:** `fix: update hook test contracts after state refactoring`

---

**Phase 3 Checkpoint:**

```bash
npm run test:agent:frontend
```

**Expected Improvement:**

- Frontend: 55 failures → target 40-45 failures

**If not improved:** Individual hooks may have additional issues. Fix one hook at a time.

**Commit Phase 3:** `chore: Phase 3 complete - frontend hook contracts updated`

---

## Phase 4: Easy Wins (Low Hanging Fruit)

**Target:** Fix 5-10 simple issues that don't depend on others.

### Step 4.1: Fix UUID Mocking

**Problem:** `expected '12345678-...' to be 'test-uuid-123'` in TransportManager tests.

**Action:**

1. Read `packages/web-frontend/src/transport/TransportManager.test.ts`
2. Find UUID generation mock (likely `vi.mock('crypto')` or `uuid` library)
3. Update mock to return expected value: `'test-uuid-123'`
4. Or update test expectation to match actual mocked UUID

**Validation:**

```bash
cd packages/web-frontend
npm test -- src/transport/TransportManager.test.ts
```

**Success Criteria:** UUID-related tests pass.

**Commit:** `fix: configure UUID mock in TransportManager tests`

---

### Step 4.2: Remove Empty Test Suites

**Problem:** 5 test files have no tests (all commented out or removed).

**Files:**

- `packages/web-backend/src/factories/DataStoreFactory.test.ts`
- `packages/web-backend/src/transport/OrchestratorEventBridge.test.ts`
- `packages/web-backend/src/transport/TransportRouter.test.ts`
- `packages/web-backend/src/transport/integration/websocket-auth-flow.test.ts`

**Action:**

- **Option A:** Delete these files if tests were intentionally removed
- **Option B:** Uncomment tests if they were temporarily disabled
- **Decision:** Check git history to see if tests were removed in recent refactoring

**Validation:**

```bash
npm run test:agent:backend
```

**Success Criteria:** "No test suite found" errors disappear.

**Commit:** `chore: remove empty test files after refactoring` OR `fix: restore commented-out tests`

---

### Step 4.3: Fix DOM Mocking (scrollIntoView)

**Problem:** `TypeError: candidate?.scrollIntoView is not a function`

**Action:**

1. Read `packages/web-frontend/src/app/App.test.tsx`
2. Add to test setup:
    ```typescript
    Element.prototype.scrollIntoView = vi.fn();
    ```
3. Or add to global test setup in vitest.config.ts

**Validation:**

```bash
cd packages/web-frontend
npm test -- src/app/App.test.tsx
```

**Success Criteria:** App.test.tsx passes.

**Commit:** `fix: mock scrollIntoView in DOM tests`

---

**Phase 4 Checkpoint:**

```bash
npm run test:agent:unit
```

**Expected Improvement:**

- Backend: 4-6 failures → target 2-4 failures
- Frontend: 40-45 failures → target 35-40 failures

**Commit Phase 4:** `chore: Phase 4 complete - easy wins fixed`

---

## Phase 5: Event Broadcasting & Assertions

**Target:** Fix remaining spy/mock assertion failures (45+).

**Note:** This is the largest category. Fix in small batches.

### Step 5.1: Fix Event Broadcasting No Transport Server

**Problem:** `[ERROR] No transport server found for type: websocket` (2 tests)

**Action:**

1. Read `packages/web-backend/src/transport/integration/event-broadcasting.test.ts`
2. Find test setup - ensure MockTransportServer is registered with EventBroadcaster
3. Add missing registration:
    ```typescript
    const mockServer = new MockTransportServer();
    broadcaster.registerTransport(mockServer);
    ```

**Validation:**

```bash
cd packages/web-backend
npm test -- src/transport/integration/event-broadcasting.test.ts
```

**Success Criteria:** 2 event broadcasting tests pass.

**Commit:** `fix: register transport server in event broadcasting tests`

---

### Step 5.2: Fix Spy Assertion Failures (Batch Processing)

**Problem:** 40+ tests expect spies/mocks to be called but aren't.

**Strategy:** Group by file, fix one file at a time.

**Files to fix (in order):**

1. `packages/web-backend/src/services/OrchestratorEventHandler.test.ts` (8 tests)
2. `packages/web-backend/src/transport/EventBroadcaster.test.ts` (3 tests)
3. `packages/web-frontend/src/transport/adapters/HttpPollingTransportClient.test.ts` (5 tests)
4. (Continue with others)

**Action per file:**

1. Read test file
2. Identify which spies aren't being called
3. Check if underlying method was renamed/removed in refactoring
4. Either:
    - Fix implementation to call the method again
    - Update test to use new method name
    - Remove test if method is gone

**Validation after each file:**

```bash
npm test -- <file-path>
```

**Commit after each file:** `fix: update spy assertions in <component> tests`

---

**Phase 5 Checkpoint:**

```bash
npm run test:agent:unit
```

**Expected Improvement:**

- Backend: 2-4 failures → target 0-2 failures
- Frontend: 35-40 failures → target 20-30 failures

**Important:** This phase is iterative. If a file is too complex, skip and come back later.

**Commit Phase 5:** `chore: Phase 5 complete - event broadcasting and assertions fixed`

---

## Phase 6: React act() Warnings & Cleanup

**Target:** Fix remaining React warnings and edge cases.

### Step 6.1: Wrap Async Updates in act()

**Problem:** 12+ "not wrapped in act()" warnings.

**Files:**

- `packages/web-frontend/src/framework/hooks/useAsyncData.test.tsx`
- `packages/web-frontend/src/app/components/domain/BookDialog.test.tsx`
- `packages/web-frontend/src/framework/features/toast/ToastContext.test.tsx`

**Action per file:**

1. Find async operations (fetch, setState, etc.)
2. Wrap in act():
    ```typescript
    await act(async () => {
    	await asyncOperation();
    });
    ```

**Validation:** Run tests, warnings should disappear.

**Commit:** `fix: wrap async state updates in act()`

---

## Phase 7: E2E (If Time Permits)

**Problem:** E2E server startup fails with port permission error.

**Action:**

1. Fix environment variable expansion in `packages/e2e-web/scripts/start-webapp-with-retry.js`
2. Change `${VITE_E2E_PORT:-5200}` to proper Node.js variable: `process.env.VITE_E2E_PORT || 5200`
3. Test E2E startup manually before running tests

**Validation:**

```bash
npm run test:agent:e2e
```

**Commit:** `fix: resolve E2E port variable expansion`

---

## Final Validation

After all phases complete:

```bash
npm run test:agent
```

**Target:**

- Backend Unit Tests: ✓ (0 failures)
- Frontend Unit Tests: ✓ or 0-5 failures
- Worker Unit Tests: ✓
- Orchestrator Unit Tests: ✓
- E2E: ✓ (if Phase 7 completed)

---

## Recovery Plan (If Tests Break During Phase)

1. **STOP immediately** - Do not proceed to next step
2. **Identify what changed** - `git diff`
3. **Options:**
    - Fix the issue immediately (if obvious)
    - Revert the change: `git checkout <file>`
    - Skip the step and document why
4. **Re-run tests** to confirm recovery
5. **Only then proceed** to next step

---

## Critical Files to Modify

**Phase 1:**

- `packages/orchestrator/tsconfig.json`
- `packages/worker/package.json`
- `packages/orchestrator/package.json`
- `packages/web-backend/vitest.config.ts`

**Phase 2:**

- `packages/web-backend/src/services/OrchestratorEventHandler.test.ts`
- `packages/shared-orch-worker/StateManager.test.ts`

**Phase 3:**

- `packages/web-frontend/src/framework/hooks2/*.test.ts` (4 files)

**Phase 4:**

- `packages/web-frontend/src/transport/TransportManager.test.ts`
- `packages/web-frontend/src/app/App.test.tsx`
- Empty test files (5 files to delete or restore)

**Phase 5-6:**

- Various test files with spy assertions
- React test files with act() issues

---

## Success Metrics

- **Phase 1:** Worker tests load, Orchestrator failures drop by 15+
- **Phase 2:** Backend failures drop by 6-8
- **Phase 3:** Frontend failures drop by 10-15
- **Phase 4:** Backend/Frontend each drop by 2-5
- **Phase 5:** Majority of spy assertion issues resolved
- **Phase 6:** React warnings eliminated

**Overall Goal:** 256 failing tests → 0-10 failing tests

---

## Time Estimates

- Phase 0: 15 minutes
- Phase 1: 2-3 hours
- Phase 2: 1-2 hours
- Phase 3: 1-2 hours
- Phase 4: 1 hour
- Phase 5: 3-5 hours (largest phase)
- Phase 6: 1-2 hours
- Phase 7: 1-2 hours (optional)

**Total: 10-17 hours** (spread over multiple sessions)

---

## Key Principles

1. ✅ **One change at a time** - Never combine fixes
2. ✅ **Test immediately** - After every change
3. ✅ **Commit often** - After every successful fix
4. ✅ **Revert fast** - If tests break, undo immediately
5. ✅ **Document progress** - Update this plan with actual results
6. ❌ **No skipping ahead** - Phases are sequential for a reason
7. ❌ **No parallel fixes** - One thing breaks, easier to debug
