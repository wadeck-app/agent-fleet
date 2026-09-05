# Scripts Documentation

This directory contains various utility scripts for testing, validation, and development tasks.

## Table of Contents

- [Testing Scripts](#testing-scripts)
- [Flow Validation Scripts](#flow-validation-scripts)
- [Development Scripts](#development-scripts)

---

## Testing Scripts

### test-all.js

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

---

_Reference content moved to [docs/reference.md](docs/reference.md)._
