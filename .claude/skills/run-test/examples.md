# run-test Examples

## Quick Scripts (Most Common)

```bash
# Run only unit tests (fastest)
npm run test:agent:unit

# Run only E2E tests
npm run test:agent:e2e

# Run specific workspace tests
npm run test:agent:frontend
npm run test:agent:backend
npm run test:agent:shared
```

## Filter Reference

| Filter      | Purpose                                              | Example                |
| ----------- | ---------------------------------------------------- | ---------------------- |
| `--type`    | Filter by test type (unit, e2e-functional)           | `--type=unit`          |
| `--suite`   | Filter by suite name (supports wildcards `*`)        | `--suite="*Frontend*"` |
| `--exclude` | Exclude suites (supports wildcards `*`)              | `--exclude="E2E*"`     |
| `--grep`    | Filter individual test names (passed to test runner) | `--grep="BookForm"`    |

## Advanced Filtering Examples

### Filter by Suite Name

```bash
# Run specific suite by exact name
npm run test:agent -- --suite="Frontend Unit Tests"

# Run all unit test suites
npm run test:agent -- --suite="*Unit*"

# Run all frontend-related tests
npm run test:agent -- --suite="*Frontend*"
```

### Exclude Suites

```bash
# Skip slow E2E tests during development
npm run test:agent -- --exclude="E2E*"

# Run everything except backend
npm run test:agent -- --exclude="*Backend*"

# Skip multiple patterns (run command twice with different excludes)
npm run test:agent -- --exclude="E2E*" --type=unit
```

### Filter by Test Name (grep)

```bash
# Run only BookForm tests in frontend
npm run test:agent -- --suite="*Frontend*" --grep="BookForm"

# Run only useBooks hook tests
npm run test:agent -- --grep="useBooks"

# Run all tests matching "Table"
npm run test:agent -- --grep="Table"
```

### Combining Filters

```bash
# Unit tests only, excluding backend (Frontend + Shared only)
npm run test:agent -- --type=unit --exclude="*Backend*"

# Frontend tests matching "Table"
npm run test:agent:frontend -- --grep="Table"

# E2E tests excluding components
npm run test:agent -- --type=e2e-functional --exclude="*Component*"
```

## Workflow Examples

### Feature Development Workflow

```bash
# 1. While developing: run only relevant tests
npm run test:agent:frontend -- --grep="BookForm"

# 2. Before committing: run all unit tests
npm run test:agent:unit

# 3. Before PR: run all tests
npm run test:agent
```

### Bug Fix Workflow

```bash
# 1. Identify the failing test area
npm run test:agent:frontend

# 2. Run specific test to reproduce
npm run test:agent -- --grep="IngredientSearch"

# 3. After fix: verify all related tests
npm run test:agent:frontend

# 4. Final verification: all tests
npm run test:agent
```

### Quick Development Loop

```bash
# Skip slow E2E tests during active development
npm run test:agent -- --exclude="E2E*"

# Or just run unit tests (fastest)
npm run test:agent:unit
```

## Output Examples

### Success (Filtered)

```
Running 3 of 5 test suites...

  Backend Unit Tests... ✓
  Frontend Unit Tests... ✓
  Shared Unit Tests... ✓

✓ All tests passed
  3 suites, 12.3s
```

### Failure (With Error Log)

```
Running 1 of 5 test suites...

  Frontend Unit Tests... ✗

✗ Tests failed
  0 passed, 1 failed, 10.8s
  Error log: C:\Workspace_Other\boilerplate\test-errors.log

Failed suites:
  - Frontend Unit Tests
```

### No Matching Suites

```
No test suites match the specified filters.
Available filters: --suite, --type, --exclude, --grep
```

## Test Suites Included

This command runs from these configured test suites:

1. **Backend Unit Tests** (`--type=unit`)
    - Business logic, services, repositories
    - Command: `npm run test --workspace=@app/backend`

2. **Frontend Unit Tests** (`--type=unit`)
    - React components, hooks, utilities
    - Command: `npm run test --workspace=@app/frontend`

3. **Shared Unit Tests** (`--type=unit`)
    - Shared types and utilities
    - Command: `npm run test --workspace=@app/shared-frontend-backend`

4. **E2E Application Tests** (`--type=e2e-functional`)
    - Complete user flows (Playwright)
    - Command: `npm run test:e2e:app`

5. **E2E Component Tests** (`--type=e2e-functional`)
    - Storybook component tests (Playwright)
    - Command: `npm run test:e2e:components`

## Tips

- **Start narrow**: Use `--grep` or specific suites during development
- **Expand gradually**: Add more suites as you gain confidence
- **Skip E2E for speed**: Use `--exclude="E2E*"` for faster feedback
- **Use npm scripts**: Prefer `test:agent:unit` over typing full commands
- **No filters = all tests**: Default behavior runs everything (best for CI/PR)
