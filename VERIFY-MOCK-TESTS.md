# Verify MockOrchestratorClient Tests

## Quick Verification Commands

### Option 1: Run via workspace (Recommended)

```bash
cd C:\Workspace_Tooling\agent-fleet\packages\orchestrator-adapters
npm run test -- MockOrchestratorClient.test.ts
```

### Option 2: Run via test agent

```bash
cd C:\Workspace_Tooling\agent-fleet
npm run test:agent -- --suite="*Orchestrator Adapters*"
```

### Option 3: Run all orchestrator-adapters tests

```bash
cd C:\Workspace_Tooling\agent-fleet
npm run test --workspace=orchestrator-adapters
```

## What to Expect

**Success Output:**

```
✓ MockOrchestratorClient (28 tests)
  ✓ should track connect call
  ✓ should track disconnect call and clean up
  ✓ should return static mock response for createTask
  ... (25 more tests)

Test Files  1 passed (1)
Tests  28 passed (28)
```

**If Tests Fail:**
Check the error log for details:

- TypeScript compilation errors
- Import path issues
- Type mismatches
- Logic errors

## Test File Details

- **Location**: `packages/orchestrator-adapters/src/__mocks__/MockOrchestratorClient.test.ts`
- **Total Lines**: 544 lines
- **Test Cases**: 28 tests
- **Coverage Areas**:
    - Lifecycle (2)
    - Method Mocking - Static (2)
    - Method Mocking - Function (2)
    - Default Responses (5)
    - Call History (3)
    - Helper Methods (4)
    - Events (6)
    - Mock Config (2)
    - Void Methods (2)

## Troubleshooting

### If you see "Cannot find module" errors:

```bash
cd C:\Workspace_Tooling\agent-fleet
npm install
npm run build:shared
```

### If TypeScript compilation fails:

```bash
cd C:\Workspace_Tooling\agent-fleet
npm run check
```

### To see detailed test output:

```bash
cd C:\Workspace_Tooling\agent-fleet\packages\orchestrator-adapters
npm run test:watch -- MockOrchestratorClient.test.ts
```

## Coverage Report

To generate coverage report:

```bash
cd C:\Workspace_Tooling\agent-fleet\packages\orchestrator-adapters
npm run test:coverage
```

The coverage report will show:

- Line coverage
- Branch coverage
- Function coverage

Expected coverage for MockOrchestratorClient: >90%
