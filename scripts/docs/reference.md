# Reference

_Moved from README -- see [README](../README.md) for the overview._

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
   ALL TESTS PASSED!
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

---

## Flow Validation Scripts

### validate-flows-complete.js

**RECOMMENDED**: Complete autonomous validation that reproduces FlowWorker's full validation logic.

Implements all 8 validators:

1. SchemaValidator - Structure, types, workspace
2. GraphValidator - Cycles, reachability
3. SemanticValidator - Output references
4. TemplateValidator - Variable expressions
5. DependencyOrderValidator - Variable usage vs dependencies
6. LogicalValidator - Required + default, data flow
7. ContractValidator - Pre/post conditions
8. SimulationValidator - Arithmetic/logical operators detection

**Usage:**

```bash
# Validate only example flows
node scripts/validate-flows-complete.js

# Validate all flows
node scripts/validate-flows-complete.js --all
```

**What it validates:**

All validations from FlowWorker:

-  Schema (required fields, types, workspace settings)
-  Circular dependencies
-  Undefined step/output references
-  Template arithmetic/logical operators (not supported)
-  Dependency order (step uses output without depending on it)
-  Greedy regex patterns (`.*` vs `.*?`)
-  UserIntervention output 'from' values
-  Default value type mismatches
-  Required inputs with default values
-  Recursive SubFlow steps

**Exit codes:**

- `0` = All flows valid
- `1` = One or more flows have errors

---

### validate-example-flows.js

**DEPRECATED**: Use `validate-flows-complete.js` instead.

Performs **basic structure validation only** on flows in `.agent-fleet/flows.yml`.

By default validates only example flows (flows with `example-` prefix). Use `--all` flag to validate all flows.

**Usage:**

```bash
# Validate only example flows
node scripts/validate-example-flows.js

# Validate all flows
node scripts/validate-example-flows.js --all
```

**What it validates:**

-  Required fields: `version`, `name`, `description`, `workspace`, `steps`
-  Workspace settings: valid `mode`, `gitStrategy`, `reusePolicy`
-  Input types: all 21 supported types
-  Default value types match declared types (integer, priority, regex, etc.)
-  Step structure: each step has `id` and `type`

**What it DOES NOT validate:**

-  Step dependencies (circular dependencies, undefined steps)
-  Template expressions (`${{ }}` syntax)
-  Output references (undefined outputs)
-  SubFlow references (non-existent flows)
-  Complex type constraints

**For complete validation**, start the FlowWorker - it will perform full validation using the FlowRegistry and show detailed errors in the console.

**Output:**

```
 Validating example flows...
 Found 34 flows total (10 example flows)

Validating 10 flows...

   example-blog-post
   example-performance-metrics
   example-broken-flow
     ERROR: Invalid workspace.reusePolicy: prefer
     ERROR: Invalid input type for 'count': invalidType
     ERROR: Default value for 'priority' must be one of: low, medium, high, critical (type: priority), got: 'normal'

 Summary:
   Valid: 9
   Invalid: 1

  Note: This script performs basic validation only.
   For complete validation, start the FlowWorker to see full results.
```

**Exit codes:**

- `0` = All flows passed basic validation
- `1` = One or more flows have basic validation errors

**When to use:**

- Quick sanity check before committing flow changes
- Catch obvious errors (typos in enum values, wrong types)
- Verify basic structure before running full validation

### test-flows-service.js

Tests basic flow loading functionality - parses YAML and lists all flows.

**Usage:**

```bash
node scripts/test-flows-service.js
```

**Output:**

```
 Loaded 35 flows:
  - simple-qa: Simple Question & Answer (1.0.0)
  - example-blog-post: Example: Blog Post Generator (1.0.0)
  ...
```

**Purpose:** Verify flows.yml syntax and basic structure.

### validate-all-flows.js

**(Advanced)** Validates flows using the actual FlowRegistry validator with full validation rules.

**Note:** This script imports TypeScript modules and requires special setup. For quick validation, use `validate-example-flows.js` instead or just start the FlowWorker.

**Usage (requires tsx):**

```bash
npx tsx scripts/validate-all-flows.js
```

**Why this is complex:** The project uses a composite TypeScript build that only emits declaration files. The FlowWorker and other packages use bundlers (esbuild) to create runtime JavaScript. To use FlowRegistry directly in a script, you need tsx to handle TypeScript imports on-the-fly.

**Recommended approach:** Just start the FlowWorker (`npm run start:worker`) - it will load and validate all flows automatically and show detailed errors in the console.

---

## Development Scripts
