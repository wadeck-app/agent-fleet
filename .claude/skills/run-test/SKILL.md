---
name: run-test
description: Run all tests with minimal context-efficient output. Use when verifying code changes, before creating PRs, or after implementing features. Outputs 3 lines on success, logs errors to test-errors.log on failure. Do not use this skill to run a single test file.
allowed-tools:
    - Bash
    - Read
context: fork
#context: fork
---

# Run-Test Agent Skill

Run comprehensive test suites (unit + E2E) with minimal console output to reduce context pollution for LLM agents.
<important>Please do not use this skill if you intent to only test a single class.</important>

## When to Use

Use this skill whenever you need to:

- ✅ Verify code changes before creating a PR
- ✅ Check test suite status after implementing features
- ✅ Validate bug fixes or refactoring

**ALWAYS prefer this approach over running test commands manually** (`npm test`, `npm run test:e2e`, etc.)

## Basic Usage

```bash
# Run all tests
npm run test:agent

# Run only unit tests (faster)
npm run test:agent:unit

# Run specific workspace
npm run test:agent:frontend
```

For filtering options and advanced usage, see [examples.md](examples.md).

## Interpreting Results

**On Success (minimal output):**

```
Running tests...
  Backend Unit Tests... ✓
  Frontend Unit Tests... ✓
  ...
✓ All tests passed
  5 suites, 45.2s
```

**On Failure (with error log reference):**

```
✗ Tests failed
  4 passed, 1 failed, 47.3s
  Error log: C:\Workspace_Other\boilerplate\test-errors.log
```

Read the error log for full details:

```bash
Read test-errors.log
```

## Quick Filter Reference

- `--type=unit` or `--type=e2e-functional` - Filter by test type
- `--suite="*Frontend*"` - Filter by suite name (supports wildcards)
- `--exclude="E2E*"` - Exclude suites (supports wildcards)
- `--grep="BookForm"` - Filter individual test names

See [examples.md](examples.md) for detailed examples and workflows.
