# Testing Scripts

## test-all.js

Cross-platform unified test runner (Node.js) that executes all test types (unit + E2E) and displays a comprehensive summary report.

### Usage

```bash
npm test
```

Or directly:

```bash
node scripts/test-all.js
```

### What it does

Runs tests in the following order:

1. **Backend Unit Tests** (Jest) - Service layer, repositories, utilities
2. **Frontend Unit Tests** (Vitest) - React components, hooks
3. **Shared Unit Tests** (Jest) - Common utilities, validation
4. **E2E Application Tests** (Playwright) - Full user workflows
5. **E2E Component Tests** (Playwright) - Storybook component interactions

### Output

The script provides:

- Real-time output from each test suite as it runs
- Summary report at the end showing pass/fail counts for each suite
- Overall pass/fail status with exit code

Example summary:

```
================================================================================
  TEST SUMMARY REPORT
================================================================================

  Backend Unit Tests:     Tests: 118 passed, 118 total
  Frontend Unit Tests:    Tests: 97 passed, 97 total
  Shared Unit Tests:      Tests: 40 passed, 40 total
  E2E Application Tests:  72 passed (1h 2m)
  E2E Component Tests:    15 passed (30s)

================================================================================
  Overall: 5 suites passed, 0 suites failed
================================================================================
  ✓ ALL TESTS PASSED!
```

### Exit Codes

- `0` = All tests passed
- `1` = One or more test suites failed

### Alternative Commands

- `npm run test:unit` - Run only unit tests (fast, no E2E)
- `npm run test:e2e` - Run only E2E tests
- `npm run test:e2e:app` - Run only application E2E tests
- `npm run test:e2e:components` - Run only component E2E tests
- `npm run test:coverage` - Run unit tests with coverage report

## Why This Approach?

**Problem:** E2E tests were separate and easy to forget, leading to missed issues (like missing Fastify dependency after merge).

**Solution:** Unified `npm test` command that runs everything ensures:

- Dependencies are verified (E2E tests start actual servers)
- All test types are checked before considering tests "passing"
- Clear summary makes it easy to identify which suite failed

**Best Practice:** Always run `npm test` before committing or creating PRs.
