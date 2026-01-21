# Plan: Fix All TypeScript and ESLint Errors

## Objective

Eliminate all 537 TypeScript errors and 2462 ESLint errors to achieve 0 errors.

## Error Analysis

### TypeScript Errors (537 total)

1. **TS6305 (442 errors, 82%)**: Output files not built from source
    - Root cause: Shared packages (`shared-common`, `shared-orch-worker`, `shared-frontend-backend`, `shared-orch-backend`) not compiled
    - These packages need to be built before type-checking dependent packages

2. **TS2339 (37 errors)**: Property does not exist on type
    - Type definition mismatches

3. **TS7006 (34 errors)**: Parameter implicitly has 'any' type
    - Missing type annotations on parameters

4. **TS18046 (6 errors)**: Variable is of type 'unknown'
    - Need explicit type guards or assertions

5. **TS7053 (5 errors)**: Element implicitly has 'any' type (indexing)
    - Missing index signatures or improper object access

6. **Other errors (18 total)**: TS2353, TS2365, TS2554, TS2345
    - Various type mismatches

### ESLint Errors (2462 total)

1. **no-console (370 errors)**: Unexpected console statements
    - Present throughout production code (controllers, services, repositories, transport adapters)
    - Logger infrastructure from `@shared-common/logger` is in place
    - Need to replace all remaining console.\* with appropriate logger methods

2. **@typescript-eslint/no-explicit-any (248 errors)**: Use of `any` type
    - **Project policy**: `any` allowed only in tests/stories, NOT in production code
    - Must identify which errors are in production vs tests/stories
    - Replace with proper types in all production code

3. **better-tailwindcss/enforce-consistent-class-order (223 warnings)**: Incorrect Tailwind class order
    - Auto-fixable with `npm run lint:fix`

4. **@typescript-eslint/no-unused-vars (45 errors)**: Unused variables
    - Remove or prefix with underscore

5. **no-restricted-syntax (20 errors)**: Forbidden native elements
    - Replace native `<button>` with `<Button>` component

6. **Other (various)**: prefer-const, no-restricted-imports, react-hooks/exhaustive-deps

## Implementation Strategy

### Phase 1: Build Infrastructure (Critical Foundation)

**Goal**: Resolve 82% of TypeScript errors by building shared packages

1. Build shared packages in correct order:

    ```bash
    npm run build:shared
    ```

    Order: shared-common → shared-orch-worker → shared-frontend-backend → shared-orch-backend

2. Verify build outputs exist:
    - `packages/shared-common/dist-types/`
    - `packages/shared-orch-worker/dist-types/`
    - `packages/shared-frontend-backend/dist-types/`
    - `packages/shared-orch-backend/dist-types/`

**Expected outcome**: Reduce from 537 → ~95 TypeScript errors

### Phase 2: Auto-fixable ESLint Issues

**Goal**: Automatically fix format and style issues

1. Run ESLint auto-fix:

    ```bash
    npm run lint:fix
    ```

    - Fixes Tailwind class order (~223 errors)
    - May fix some import issues

2. Run Prettier:
    ```bash
    npm run format
    ```

**Expected outcome**: Reduce ESLint errors by ~250

### Phase 3: TypeScript Type Fixes

**Goal**: Fix remaining TypeScript errors systematically

#### 3.1 Fix TS7006 (Implicit any parameters) - 34 errors

- Files to fix:
    - `web-backend/src/repositories/BooksRepository.ts` (4 errors)
    - `web-backend/src/repositories/IngredientsRepository.ts` (4 errors)
    - `web-backend/src/repositories/ProjectsRepository.ts` (1 error)
    - `web-frontend/src/app/pages/workspaces/ProjectSelect.tsx` (2 errors)
    - Other repositories and services

- Strategy: Add explicit type annotations to parameters

#### 3.2 Fix TS7053 (Implicit any indexing) - 5 errors

- Files to fix:
    - `web-frontend/src/app/pages/projects2/WorkspacePanel.tsx` (2 errors)
    - Add proper index signatures or use type-safe access

#### 3.3 Fix TS2339 (Property does not exist) - 37 errors

- Files to fix:
    - `web-backend/src/repositories/WorkersRepository.ts` (3 errors: WorkerMetadata type issues)
    - Review type definitions and ensure proper interface usage

#### 3.4 Fix TS18046 (Unknown type) - 6 errors

- Files to fix:
    - `web-backend/src/services/FlowsService.ts` (3 errors)
    - `web-backend/src/services/ProjectsService.ts` (1 error)
- Add type guards or explicit type assertions

#### 3.5 Fix remaining TS errors (18 total)

- Review each error individually
- Fix type mismatches in function calls and object literals

### Phase 4: ESLint Code Quality Fixes

**Goal**: Replace console statements and eliminate 'any' types

#### 4.1 Replace console.log with logger (370 errors)

Priority files (most console statements):

- `web-backend/src/migrations/MigrateToBackendStorage.ts` (50+ console statements)
- `web-backend/src/auth/MockAuthService.ts`
- `web-backend/src/controllers/TransportsController.ts`
- `web-backend/src/factories/DataStoreFactory.ts`

Strategy:

1. Import logger from `@shared-common/logger`
2. Replace `console.log` → `logger.info`
3. Replace `console.error` → `logger.error`
4. Replace `console.warn` → `logger.warn`

#### 4.2 Replace 'any' with proper types (248 errors)

**First**: Analyze which files are production code vs tests/stories:

- Tests/stories: `any` is acceptable per project policy
- Production code: Must fix all `any` violations

Priority production files (identified from error log):

- Controllers (FlowsController, MonitoringController)
- Factories (DataStoreFactory)
- Hooks (apiStats.hook, requestLogger.hook)
- Plugins (responseHelpers.plugin, testRoutes.plugin)
- Services and repositories

Strategy:

1. Filter errors to identify production code violations
2. Identify the actual types from usage context
3. Define proper interfaces where needed
4. Use generics for reusable functions
5. Use `unknown` with type guards if type truly unknown (last resort)

#### 4.3 Fix no-restricted-syntax (20 errors)

- Replace native `<button>` with `<Button>` from framework
- Files: ColorPicker.tsx, ProjectSelect.tsx

#### 4.4 Fix no-unused-vars (45 errors)

- Remove unused imports and variables
- Prefix intentionally unused parameters with underscore

#### 4.5 Fix remaining ESLint issues

- Fix prefer-const violations
- Fix no-restricted-imports violations
- Fix react-hooks/exhaustive-deps

### Phase 5: Verification

1. Run full check:

    ```bash
    npm run check
    ```

2. Expected results:
    - ✅ TypeScript: 0 errors
    - ✅ ESLint: 0 errors
    - ✅ Prettier: All files formatted

3. If any errors remain:
    - Review error logs
    - Fix remaining issues
    - Re-run check

## Critical Files to Modify

### TypeScript Fixes

- `packages/web-backend/src/repositories/BooksRepository.ts`
- `packages/web-backend/src/repositories/IngredientsRepository.ts`
- `packages/web-backend/src/repositories/ProjectsRepository.ts`
- `packages/web-backend/src/repositories/WorkersRepository.ts`
- `packages/web-backend/src/services/FlowsService.ts`
- `packages/web-backend/src/services/ProjectsService.ts`
- `packages/web-frontend/src/app/pages/projects2/WorkspacePanel.tsx`
- `packages/web-frontend/src/app/pages/workspaces/ProjectSelect.tsx`

### ESLint Fixes (High Priority)

- `packages/web-backend/src/migrations/MigrateToBackendStorage.ts` (50+ console statements)
- `packages/web-backend/src/factories/DataStoreFactory.ts` (console + any types)
- `packages/web-backend/src/controllers/TransportsController.ts` (console statements)
- `packages/web-backend/src/controllers/FlowsController.ts` (any types)
- `packages/web-backend/src/auth/MockAuthService.ts` (console statements)
- `packages/web-frontend/src/framework/components/pickers/ColorPicker.tsx` (native button)
- `packages/web-frontend/src/app/pages/workspaces/ProjectSelect.tsx` (native button)

## Risk Assessment

### Low Risk

- Phase 1 (Build): Zero code changes, just compilation
- Phase 2 (Auto-fix): Automated fixes, low risk
- Console.log replacements: Straightforward, low risk

### Medium Risk

- Type annotations: May reveal hidden bugs
- Removing 'any' types: Could expose type mismatches

### High Risk

- TS2339 fixes (property does not exist): May indicate architectural issues with type definitions

## Success Criteria

- [ ] All shared packages build successfully
- [ ] TypeScript check passes with 0 errors
- [ ] ESLint check passes with 0 errors
- [ ] Prettier check passes with 0 formatting issues
- [ ] No functionality broken (existing tests still pass)
