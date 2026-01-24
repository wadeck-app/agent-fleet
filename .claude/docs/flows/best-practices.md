# Flow Best Practices

This guide covers design patterns, optimization strategies, and best practices for creating robust, maintainable flows.

**Last Updated**: 2026-01-23
**Version**: 1.0.0
**Audience**: Intermediate to Advanced Flow Creators

## Table of Contents

1. [Workspace Strategy Selection](#1-workspace-strategy-selection)
2. [Step Design Patterns](#2-step-design-patterns)
3. [Data Flow Patterns](#3-data-flow-patterns)
4. [Output Configuration](#4-output-configuration)
5. [Error Handling Strategies](#5-error-handling-strategies)
6. [Performance Optimization](#6-performance-optimization)
7. [Testing Flows](#7-testing-flows)
8. [Maintainability](#8-maintainability)

---

## 1. Workspace Strategy Selection

### Decision Matrix

Choose your workspace configuration based on task requirements:

| Scenario                | Mode       | Git Strategy     | Reuse Policy | Rationale                                                  |
| ----------------------- | ---------- | ---------------- | ------------ | ---------------------------------------------------------- |
| **Code Implementation** | `isolated` | `main-only`      | `always`     | Safe isolation, allows commits, reuses workspace for speed |
| **Feature Development** | `isolated` | `feature-branch` | `never`      | Each task gets fresh branch, no cross-contamination        |
| **Q&A / Analysis**      | `shared`   | `main-only`      | `always`     | Read-only, fast reuse, multiple tasks can share            |
| **Documentation**       | `shared`   | `main-only`      | `always`     | Read-only, no builds needed                                |
| **Local Testing**       | `manual`   | `any`            | `always`     | Debug in current directory, see changes in IDE             |
| **Critical Production** | `isolated` | `worktree`       | `never`      | Maximum isolation with git worktrees                       |

### Workspace Mode Deep Dive

#### When to Use `isolated`

**Use Cases:**

- Code modifications
- Running builds or tests
- Creating commits
- File system changes

**Benefits:**

- Complete isolation (no conflicts with other tasks)
- Full git access (commits, branches)
- Safe for destructive operations

**Costs:**

- Slower startup (clone or worktree creation)
- More disk space
- Cleanup overhead

**Example:**

```yaml
workspace:
    mode: isolated
    gitStrategy: main-only # Safest for most tasks
    reusePolicy: always # Reuse workspace across tasks for speed
```

#### When to Use `shared`

**Use Cases:**

- Question answering
- Code analysis
- Documentation queries
- Read-only operations

**Benefits:**

- Fast execution (no cloning)
- Low overhead
- Multiple tasks can run concurrently

**Costs:**

- No git modifications allowed
- Shared state (must be stateless)
- Requires careful concurrency handling

**Example:**

```yaml
workspace:
    mode: shared
    gitStrategy: main-only
    reusePolicy: always
    concurrencyKey: readonly # Group with other read-only tasks
```

**⚠️ WARNING**: Never use `shared` mode for flows that:

- Modify files
- Run builds
- Create commits
- Change git state

#### When to Use `manual`

**Use Cases:**

- Local debugging
- Flow development
- Quick testing
- IDE integration

**Benefits:**

- Instant execution (uses current directory)
- See changes in real-time in your IDE
- No workspace overhead

**Costs:**

- Affects your working directory
- No isolation
- Not safe for production

**Example:**

```yaml
workspace:
    mode: manual
    gitStrategy: any # Use whatever branch you're on
    reusePolicy: always
```

**⚠️ WARNING**: Only use `manual` for development/debugging. Never in production flows.

### Git Strategy Selection

| Strategy         | When to Use         | Behavior                 | Safety     |
| ---------------- | ------------------- | ------------------------ | ---------- |
| `main-only`      | Most flows          | Only uses main branch    | ✅ Highest |
| `feature-branch` | Feature development | Creates feature branches | ✅ High    |
| `any`            | Flexible workflows  | Uses current/any branch  | ⚠️ Medium  |
| `worktree`       | Maximum isolation   | Creates git worktrees    | ✅ Highest |

**Recommendation**: Start with `main-only` unless you have a specific reason for other strategies.

### Reuse Policy Guidelines

| Policy         | When to Use          | Behavior                        | Performance |
| -------------- | -------------------- | ------------------------------- | ----------- |
| `never`        | Fresh state required | Always creates new workspace    | 🐌 Slow     |
| `if-available` | Flexible reuse       | Reuse if available, else create | ⚡ Medium   |
| `always`       | Maximum reuse        | Block until workspace available | ⚡ Fast     |

**Recommendation**: Use `always` with `isolated` mode for best performance while maintaining isolation.

### Performance Implications

**Clone Time Comparison** (for a typical monorepo):

- `isolated` + `never`: ~30-60 seconds per task
- `isolated` + `always`: ~2-5 seconds (reusing workspace)
- `shared` + `always`: ~0-1 seconds (workspace already exists)
- `manual`: ~0 seconds (uses current directory)

**Memory/Disk Impact**:

- `isolated`: ~500MB-2GB per workspace
- `shared`: ~500MB-2GB (shared across tasks)
- `manual`: 0 (uses existing directory)

---

## 2. Step Design Patterns

### Single Responsibility Principle

Each step should have ONE clear purpose.

**❌ Bad: Multi-purpose step**

```yaml
- type: model
  id: do-everything
  name: 'Analyze, Implement, and Test'
  model: sonnet
  prompt: |
      Analyze the requirements, implement the solution,
      and write tests for: ${{ inputs.task }}
```

**✅ Good: Separate steps**

```yaml
- type: model
  id: analyze
  name: 'Analyze Requirements'
  model: sonnet
  prompt: 'Analyze requirements: ${{ inputs.task }}'
  output:
      approach: { type: string }

- type: model
  id: implement
  name: 'Implement Solution'
  depends: [analyze]
  model: sonnet
  prompt: 'Implement using approach: ${{ steps.analyze.outputs.approach }}'

- type: model
  id: test
  name: 'Write Tests'
  depends: [implement]
  model: haiku
  prompt: 'Write tests for the implementation'
```

**Benefits:**

- Better observability (trace each step separately)
- Easier debugging
- Parallel execution opportunities
- Clearer failure points

### Naming Conventions

#### Step IDs: kebab-case, descriptive

**❌ Bad:**

```yaml
- id: step1
- id: s
- id: doStuff
```

**✅ Good:**

```yaml
- id: analyze-requirements
- id: run-unit-tests
- id: deploy-to-staging
```

#### Step Names: Imperative verbs, human-readable

**❌ Bad:**

```yaml
- name: 'Analysis'
- name: 'Testing'
- name: 'Step 1'
```

**✅ Good:**

```yaml
- name: 'Analyze Requirements'
- name: 'Run Unit Tests'
- name: 'Deploy to Staging'
```

**Pattern**: `[Verb] [Object] [Optional Context]`

Examples:

- "Generate Database Schema"
- "Validate Input Parameters"
- "Transform Data to JSON"
- "Deploy Backend Service"

### Output Structure

**Principle**: Expose what downstream steps need, nothing more.

**❌ Bad: Over-exposure**

```yaml
- type: script
  id: build
  script: npm run build
  output:
      # Too much output, most won't be used
      stdout: { type: string }
      stderr: { type: string }
      exitCode: { type: number }
      buildTime: { type: string }
      warnings: { type: object }
      errors: { type: object }
      artifacts: { type: object }
```

**✅ Good: Essential outputs only**

```yaml
- type: script
  id: build
  script: npm run build
  output:
      success: { type: boolean, pattern: 'Build (succeeded|failed)' }
      artifactPath: { type: string, pattern: 'Output: (.*)' }
      # Only expose what downstream steps need
```

### Step Granularity

**When to Split Steps:**

- Different error handling needs
- Parallel execution opportunities
- Reusable across flows
- Different retry strategies
- Clear separation of concerns

**When to Combine Steps:**

- Tightly coupled operations
- Shared context requirements
- Minimal overhead
- No reuse value in splitting

**Example: When to Split**

```yaml
# ✅ Split: Different models, can run in parallel
- type: model
  id: security-review
  name: 'Security Review'
  model: sonnet
  prompt: 'Review security: ${{ inputs.code }}'

- type: model
  id: performance-review
  name: 'Performance Review'
  model: haiku # Different model, different concern
  prompt: 'Review performance: ${{ inputs.code }}'
```

**Example: When to Keep Together**

```yaml
# ✅ Keep together: Tightly coupled setup and execution
- type: script
  id: run-tests
  name: 'Run Tests with Setup'
  script: |
      # Setup
      npm install
      # Execute
      npm test
  output:
      exitCode: { type: number }
```

---

## 3. Data Flow Patterns

### Pattern 1: Linear Pipeline

**Use Case**: Sequential data transformations

**Structure**: A → B → C → D

**Example:**

```yaml
steps:
    - type: script
      id: extract
      name: 'Extract Data'
      script: curl https://api.example.com/data
      output:
          rawData: { type: string }

    - type: model
      id: transform
      name: 'Transform Data'
      depends: [extract]
      model: haiku
      prompt: 'Transform to JSON: ${{ steps.extract.outputs.rawData }}'
      output:
          jsonData: { type: object, transform: parseJSON }

    - type: script
      id: load
      name: 'Load Data'
      depends: [transform]
      script: |
          echo '${{ steps.transform.outputs.jsonData }}' > data.json
```

**When to Use:**

- ETL pipelines
- Data processing workflows
- Sequential transformations

### Pattern 2: Fan-Out (Parallel Processing)

**Use Case**: Independent parallel operations

**Structure**:

```
     A
   / | \
  B  C  D
```

**Example:**

```yaml
steps:
    - type: script
      id: prepare
      name: 'Prepare Environment'
      script: echo "Ready"

    # All three run in parallel after prepare
    - type: script
      id: security-scan
      name: 'Run Security Scan'
      depends: [prepare]
      script: npm audit

    - type: script
      id: lint
      name: 'Run Linter'
      depends: [prepare]
      script: npm run lint

    - type: script
      id: test
      name: 'Run Tests'
      depends: [prepare]
      script: npm test
```

**When to Use:**

- Independent validations
- Parallel testing
- Multi-target deployments

### Pattern 3: Fan-In (Diamond/Fork-Join)

**Use Case**: Parallel work with merge point

**Structure**:

```
     A
   /   \
  B     C
   \   /
     D
```

**Example:**

```yaml
steps:
    - type: script
      id: start
      name: 'Initialize'
      script: echo "Starting"

    - type: model
      id: analyze-security
      name: 'Analyze Security'
      depends: [start]
      model: sonnet
      prompt: 'Security analysis: ${{ inputs.code }}'
      output:
          securityScore: { type: number }

    - type: model
      id: analyze-performance
      name: 'Analyze Performance'
      depends: [start]
      model: sonnet
      prompt: 'Performance analysis: ${{ inputs.code }}'
      output:
          performanceScore: { type: number }

    - type: model
      id: merge-results
      name: 'Generate Combined Report'
      depends: [analyze-security, analyze-performance]
      model: haiku
      prompt: |
          Create report:
          Security: ${{ steps.analyze-security.outputs.securityScore }}
          Performance: ${{ steps.analyze-performance.outputs.performanceScore }}
```

**When to Use:**

- Parallel analysis with summary
- Multiple validations before proceeding
- Distributed work collection

### Pattern 4: Conditional Branching

**Use Case**: Different paths based on conditions

**Example:**

```yaml
steps:
    - type: script
      id: check-environment
      name: 'Check Environment'
      script: |
          if [ "$ENV" = "production" ]; then
              echo "env=production"
          else
              echo "env=staging"
          fi
      output:
          environment: { type: string, pattern: 'env=(.*)' }

    - type: script
      id: deploy-staging
      name: 'Deploy to Staging'
      depends: [check-environment]
      when: "${{ steps.check-environment.outputs.environment === 'staging' }}"
      script: ./deploy-staging.sh

    - type: script
      id: deploy-production
      name: 'Deploy to Production'
      depends: [check-environment]
      when: "${{ steps.check-environment.outputs.environment === 'production' }}"
      script: ./deploy-production.sh
```

**When to Use:**

- Environment-specific logic
- Feature flags
- Multi-tenant workflows

### Pattern 5: Feedback Loop

**Use Case**: Retry with feedback/improvements

**Structure**: A → B (fails) → goto A (with feedback) → B (succeeds) → C

**Example:**

```yaml
steps:
    - type: model
      id: implement
      name: 'Implement Feature'
      model: sonnet
      prompt: 'Implement: ${{ inputs.feature }}'

    - type: script
      id: test
      name: 'Run Tests'
      depends: [implement]
      onFailure:
          goto: implement
          maxIterations: 3
      script: npm test

    - type: script
      id: deploy
      name: 'Deploy'
      depends: [test]
      script: ./deploy.sh
```

**When to Use:**

- Test-driven development
- Validation with retry
- Iterative improvement

**⚠️ IMPORTANT**: Always set `maxIterations` to prevent infinite loops!

---

## 4. Output Configuration

### Regex Pattern Best Practices

#### Simple Value Extraction

**✅ Good: Capture single value**

```yaml
output:
    exitCode: { type: number } # Captures entire output
    # OR
    version: { type: string, pattern: 'v(\d+\.\d+\.\d+)' } # Captures "1.2.3" from "v1.2.3"
```

#### Multiple Captures

**✅ Good: Multiple outputs from one script**

```yaml
- type: script
  id: analyze
  script: |
      echo "passed=42"
      echo "failed=3"
      echo "coverage=87"
  output:
      passed: { type: number, pattern: 'passed=(\d+)' }
      failed: { type: number, pattern: 'failed=(\d+)' }
      coverage: { type: number, pattern: 'coverage=(\d+)' }
```

#### Pattern Debugging Tips

**Problem**: Pattern not matching

**Solution**: Test incrementally

```yaml
# Start simple, add complexity gradually
output:
    # Step 1: Capture entire output
    raw: { type: string }

    # Step 2: Add pattern after verifying raw output
    value: { type: string, pattern: 'result=(.*)' }
```

**Common Patterns:**

| Pattern            | Matches          | Example                         |
| ------------------ | ---------------- | ------------------------------- | ----------------- |
| `(.*)`             | Everything       | Captures entire line            |
| `(\d+)`            | Numbers          | `42`, `1234`                    |
| `(true             | false)`          | Boolean                         | `true` or `false` |
| `v(\d+\.\d+\.\d+)` | Semantic version | `v1.2.3` → `1.2.3`              |
| `(\w+)`            | Word characters  | `success`, `error_123`          |
| `"([^"]+)"`        | Quoted string    | `"hello world"` → `hello world` |

### Transform Functions

**Use Cases for Transforms:**

| Transform      | Use Case           | Example                     |
| -------------- | ------------------ | --------------------------- |
| `parseJSON`    | Parse JSON output  | `{"name":"test"}` → object  |
| `parseYAML`    | Parse YAML output  | `name: test` → object       |
| `parseInt`     | Convert to integer | `"42"` → `42`               |
| `parseFloat`   | Convert to float   | `"3.14"` → `3.14`           |
| `parseBoolean` | Convert to boolean | `"true"` → `true`           |
| `trim`         | Remove whitespace  | `" hello "` → `"hello"`     |
| `toLowerCase`  | Lowercase          | `"HELLO"` → `"hello"`       |
| `toUpperCase`  | Uppercase          | `"hello"` → `"HELLO"`       |
| `split`        | Split string       | `"a,b,c"` → `["a","b","c"]` |

**Example:**

```yaml
- type: script
  id: get-config
  script: cat config.json
  output:
      config: { type: object, transform: parseJSON }
      # Now config can be used as an object
```

### Required vs Optional Outputs

**Principle**: Mark outputs as required only if downstream steps depend on them.

**✅ Good: Clear requirements**

```yaml
- type: script
  id: build
  script: npm run build
  output:
      success: { type: boolean, required: true } # Critical for flow
      warnings: { type: string, required: false } # Nice to have
      buildTime: { type: string, required: false, default: 'unknown' }
```

**Validation Behavior:**

- `required: true` → Flow fails if output not found
- `required: false` → Output is optional
- `default: value` → Use default if extraction fails

### Default Values

**Use Cases:**

- Graceful degradation
- Optional parameters
- Backward compatibility

**Example:**

```yaml
output:
    exitCode: { type: number, required: false, default: 0 }
    message: { type: string, required: false, default: 'No message' }
```

---

## 5. Error Handling Strategies

### Retry Configuration

**When to Use Retries:**

- Transient failures (network, timeouts)
- Flaky tests
- Race conditions

**When NOT to Use Retries:**

- Validation errors
- Logic errors
- Permanent failures

**Example: Linear Backoff**

```yaml
- type: script
  id: fetch-data
  name: 'Fetch Data from API'
  script: curl https://api.example.com/data
  retry:
      maxAttempts: 3
      backoff: linear # Wait 1s, 2s, 3s between retries
```

**Example: Exponential Backoff**

```yaml
- type: script
  id: deploy
  name: 'Deploy to Production'
  script: ./deploy.sh
  retry:
      maxAttempts: 5
      backoff: exponential # Wait 1s, 2s, 4s, 8s, 16s
```

**Backoff Strategies:**

| Strategy      | Wait Pattern           | Use Case              |
| ------------- | ---------------------- | --------------------- |
| `linear`      | 1s, 2s, 3s, 4s...      | Predictable delays    |
| `exponential` | 1s, 2s, 4s, 8s, 16s... | Overwhelming services |

### Feedback Loops

**Pattern: Test-Fix-Repeat**

```yaml
steps:
    - type: model
      id: implement
      name: 'Implement Feature'
      model: sonnet
      prompt: 'Implement: ${{ inputs.feature }}'

    - type: script
      id: test
      name: 'Run Tests'
      depends: [implement]
      onFailure:
          goto: implement # Jump back to implementation
          maxIterations: 3 # Try max 3 times
      script: npm test

    - type: script
      id: complete
      name: 'Mark Complete'
      depends: [test]
      script: echo "Feature complete and tested"
```

**Key Properties:**

| Property         | Purpose                            | Example     |
| ---------------- | ---------------------------------- | ----------- |
| `goto`           | Target step to jump to on failure  | `implement` |
| `maxIterations`  | Maximum times a step can run       | `3`         |
| `resetOnSuccess` | Reset counter when target succeeds | `true`      |

### Skip on Loop

**Use Case**: One-time setup steps that shouldn't re-run

```yaml
steps:
    - type: script
      id: setup-environment
      name: 'Setup Environment'
      skipOnLoop: true # Only run once, even if loop triggered
      script: |
          npm install
          npm run build

    - type: model
      id: implement
      name: 'Implement Feature'
      depends: [setup-environment]
      model: sonnet
      prompt: 'Implement: ${{ inputs.feature }}'

    - type: script
      id: test
      name: 'Run Tests'
      depends: [implement]
      onFailure:
          goto: implement # setup-environment will be skipped on retry
          maxIterations: 3
      script: npm test
```

**Benefits:**

- Faster retry cycles
- Avoid redundant work
- Clear separation of setup vs work

### Conditional Error Paths

**Pattern: Different actions based on error type**

```yaml
steps:
    - type: script
      id: validate
      name: 'Validate Input'
      script: ./validate.sh "${{ inputs.data }}"
      output:
          valid: { type: boolean }
          errorType: { type: string }

    - type: model
      id: fix-format-error
      name: 'Fix Format Error'
      depends: [validate]
      when: "${{ steps.validate.outputs.errorType === 'format' }}"
      model: haiku
      prompt: 'Fix format error in: ${{ inputs.data }}'

    - type: model
      id: fix-logic-error
      name: 'Fix Logic Error'
      depends: [validate]
      when: "${{ steps.validate.outputs.errorType === 'logic' }}"
      model: sonnet
      prompt: 'Fix logic error in: ${{ inputs.data }}'
```

### Validation Contracts

**Pre-Process Validation (Input Contract)**

```yaml
steps:
    - type: model
      id: deploy
      name: 'Deploy Service'
      contract:
          preProcess:
              required: [environment, version]
              validateInputs:
                  environment:
                      - type: enum
                        value: [staging, production]
                        message: 'Environment must be staging or production'
                  version:
                      - type: pattern
                        value: '^\d+\.\d+\.\d+$'
                        message: 'Version must be semantic (e.g., 1.2.3)'
      prompt: 'Deploy ${{ inputs.version }} to ${{ inputs.environment }}'
```

**Post-Process Validation (Output Contract)**

```yaml
steps:
    - type: script
      id: build
      name: 'Build Application'
      script: npm run build
      output:
          exitCode: { type: number }
          artifactPath: { type: string }
      contract:
          postProcess:
              required: [exitCode, artifactPath]
              validateOutputs:
                  exitCode:
                      - type: enum
                        value: [0]
                        message: 'Build must succeed (exit code 0)'
                  artifactPath:
                      - type: pattern
                        value: '^dist/.*\.js$'
                        message: 'Artifact must be a .js file in dist/'
```

**Benefits:**

- Early failure detection
- Clear error messages
- Input/output contracts
- Self-documenting flows

---

## 6. Performance Optimization

### Workspace Reuse

**Impact**: Workspace cloning is the slowest operation in flow execution.

**Optimization Strategy:**

```yaml
# ❌ Slow: Creates new workspace every time
workspace:
    mode: isolated
    gitStrategy: main-only
    reusePolicy: never  # ~30-60s per task

# ✅ Fast: Reuses workspace across tasks
workspace:
    mode: isolated
    gitStrategy: main-only
    reusePolicy: always  # ~2-5s per task (after first)
```

**Benchmarks** (typical monorepo):

- First task: ~30-60s (clone)
- Subsequent tasks with `reusePolicy: always`: ~2-5s (reset workspace)
- Shared workspace: ~0-1s (already exists)

### Parallel Execution

**Principle**: Steps without dependencies run in parallel automatically.

**❌ Slow: Unnecessary dependencies**

```yaml
steps:
    - type: script
      id: lint
      script: npm run lint

    - type: script
      id: test
      depends: [lint] # ❌ Unnecessary dependency
      script: npm test

    - type: script
      id: audit
      depends: [test] # ❌ Unnecessary dependency
      script: npm audit
# Total time: lint_time + test_time + audit_time
```

**✅ Fast: Parallel execution**

```yaml
steps:
    # All three run in parallel
    - type: script
      id: lint
      script: npm run lint

    - type: script
      id: test
      script: npm test

    - type: script
      id: audit
      script: npm audit
# Total time: max(lint_time, test_time, audit_time)
```

**Rule**: Only use `depends` when a step truly needs another step's outputs or side effects.

### Model Selection

Choose the right model for the task complexity:

| Model    | Speed       | Cost      | Use Case                          |
| -------- | ----------- | --------- | --------------------------------- |
| `haiku`  | ⚡⚡⚡ Fast | $ Low     | Simple tasks, quick responses     |
| `sonnet` | ⚡⚡ Medium | $$ Medium | Balanced tasks, most common       |
| `opus`   | ⚡ Slow     | $$$ High  | Complex reasoning, critical tasks |

**Optimization Strategy:**

```yaml
# ✅ Use fast model for simple tasks
- type: model
  id: format-code
  name: 'Format Code'
  model: haiku # Simple formatting
  prompt: 'Format this code: ${{ inputs.code }}'

# ✅ Use powerful model for complex tasks
- type: model
  id: design-architecture
  name: 'Design System Architecture'
  model: opus # Complex reasoning
  prompt: 'Design architecture for: ${{ inputs.requirements }}'
```

**Cost/Speed Comparison** (approximate):

- Haiku: ~1-3s per call, $0.25/1M input tokens
- Sonnet: ~3-10s per call, $3/1M input tokens
- Opus: ~10-30s per call, $15/1M input tokens

### Concurrency Control

**Use Case**: Limit parallel execution to avoid overwhelming services

```yaml
workspace:
    mode: shared
    gitStrategy: main-only
    reusePolicy: always
    concurrencyKey: readonly # All flows with this key share concurrency limits
```

**Benefits:**

- Prevent resource exhaustion
- Group compatible workspaces
- Improve throughput

**Example: Read-only flows**

```yaml
# Flow 1: Q&A
workspace:
    mode: shared
    concurrencyKey: readonly

# Flow 2: Analysis
workspace:
    mode: shared
    concurrencyKey: readonly

# Both flows can share the same workspace
```

### Context Optimization

**Problem**: Large context slows down model steps

**Solution**: Be selective about what you include

**❌ Slow: Include everything**

```yaml
- type: model
  id: analyze
  context:
      files: ['**/*'] # ❌ Includes everything (slow, expensive)
  prompt: 'Analyze this code'
```

**✅ Fast: Include only what's needed**

```yaml
- type: model
  id: analyze
  context:
      files: ['src/**/*.ts'] # ✅ Only TypeScript source files
  prompt: 'Analyze this TypeScript code'
```

**Context Options:**

| Option            | Purpose                             | Example                        |
| ----------------- | ----------------------------------- | ------------------------------ |
| `files`           | Include specific files              | `['src/**/*.ts', 'README.md']` |
| `previousOutputs` | Include outputs from specific steps | `['step-a', 'step-b']`         |
| `taskMetadata`    | Include task metadata fields        | `['priority', 'assignee']`     |

---

## 7. Testing Flows

### Test in Manual Mode First

**Strategy**: Develop and test flows locally before deploying

```yaml
# During development: Use manual mode
workspace:
    mode: manual # Fast iteration, see changes in IDE
    gitStrategy: any
    reusePolicy: always
```

**Workflow:**

1. Create flow with `manual` mode
2. Test with simple inputs
3. Iterate and fix issues
4. Once stable, switch to `isolated` or `shared` mode

### Validation Examples

**Run validation** (automatic when saving flows.yml):

1. Edit `.agent-fleet/flows.yml`
2. Save file
3. Check UI for validation errors

**Common Validation Errors:**

| Code                  | Message                         | Fix                        |
| --------------------- | ------------------------------- | -------------------------- |
| `DUPLICATE_ID`        | Two steps have same ID          | Rename one step            |
| `UNDEFINED_STEP`      | Dependency on non-existent step | Check `depends` array      |
| `CIRCULAR_DEPENDENCY` | Steps depend on each other      | Remove circular dependency |
| `UNDEFINED_INPUT`     | Using undeclared input          | Add to `inputs` section    |
| `UNDEFINED_OUTPUT`    | Using undeclared output         | Add to `output` section    |

### Simple Inputs First

**Strategy**: Test with simple values before complex data

```yaml
# ✅ Good test inputs
inputs:
    message: "Hello World"  # Simple string
    count: 5  # Simple number
    enabled: true  # Simple boolean

# ❌ Don't start with complex inputs
inputs:
    config: { ... }  # Complex object
```

**Progressive Testing:**

1. Test with hardcoded values
2. Test with simple variable interpolation
3. Test with complex expressions
4. Test with error conditions

### Monitoring Trace Logs

**Where to Find Traces:**

1. Navigate to task in UI
2. Click on "Flow Trace" tab
3. Expand individual steps

**What to Check:**

- Step execution order
- Step duration
- Outputs extracted
- Error messages
- Retry attempts

**Example Trace Analysis:**

```
✅ Step: analyze (2.3s)
   - Model: sonnet
   - Outputs: { approach: "microservices" }

❌ Step: test (failed after 3 retries)
   - Script: npm test
   - Exit code: 1
   - Stderr: "Test suite failed"
   - Triggered loop: goto implement
```

### Test Checklist

Before deploying a flow to production:

- [ ] Flow passes validation (no errors)
- [ ] Tested with simple inputs
- [ ] Tested with edge cases
- [ ] Verified outputs are extracted correctly
- [ ] Checked trace logs for each step
- [ ] Dependencies are correct (no missing/extra `depends`)
- [ ] Workspace mode is appropriate for task
- [ ] Model selection is optimal for each step
- [ ] Error handling is tested (retry/loops)
- [ ] Performance is acceptable (check trace durations)

---

## 8. Maintainability

### Clear Naming

**Principle**: Names should be self-documenting

**Flow ID:**

```yaml
# ❌ Bad
flow-1:

# ✅ Good
deploy-backend-to-staging:
```

**Step ID:**

```yaml
# ❌ Bad
- id: s1
- id: step

# ✅ Good
- id: run-unit-tests
- id: deploy-to-production
```

**Step Name:**

```yaml
# ❌ Bad
- name: 'Step 1'
- name: 'Processing'

# ✅ Good
- name: 'Run Unit Tests'
- name: 'Deploy to Production'
```

### Comprehensive Descriptions

**Flow Description:**

```yaml
# ❌ Bad: Vague
description: 'Deploy service'

# ✅ Good: Specific
description: 'Deploy backend service to staging environment with smoke tests'
```

**Step Context:**

```yaml
# ✅ Good: Clear prompts
- type: model
  id: analyze
  name: 'Analyze Security Vulnerabilities'
  prompt: |
      Analyze this code for security vulnerabilities:

      Code: ${{ inputs.code }}

      Focus areas:
      - SQL injection
      - XSS attacks
      - Authentication issues

      Provide:
      1. List of vulnerabilities
      2. Severity (critical/high/medium/low)
      3. Remediation steps
```

### Documentation

**Inline Documentation:**

```yaml
# Production deployment flow
# This flow deploys the backend service to production with approval gates
# Owner: Platform Team
# Last updated: 2026-01-23
deploy-to-production:
    version: '1.0.0'
    name: 'Deploy Backend to Production'
    description: 'Full production deployment with approvals and smoke tests'

    workspace:
        mode: isolated
        gitStrategy: main-only
        reusePolicy: always

    inputs:
        version:
            type: string
            required: true
            description: 'Semantic version to deploy (e.g., 1.2.3)'

    steps:
        # Step 1: Validate version format
        - type: script
          id: validate-version
          name: 'Validate Version'
          script: |
              # Ensure version matches semantic versioning
              echo "${{ inputs.version }}" | grep -E '^\d+\.\d+\.\d+$'
```

### Versioning

**Semantic Versioning for Flows:**

```yaml
# Version format: MAJOR.MINOR.PATCH
version: '1.2.3'

# MAJOR: Breaking changes (incompatible inputs/outputs)
# MINOR: New features (backward compatible)
# PATCH: Bug fixes (backward compatible)
```

**Version Change Examples:**

| Change                | Old   | New   | Reason                      |
| --------------------- | ----- | ----- | --------------------------- |
| Add optional input    | 1.0.0 | 1.1.0 | Minor (backward compatible) |
| Remove required input | 1.0.0 | 2.0.0 | Major (breaking change)     |
| Fix output pattern    | 1.0.0 | 1.0.1 | Patch (bug fix)             |
| Add new step          | 1.0.0 | 1.1.0 | Minor (new feature)         |
| Change step order     | 1.0.0 | 2.0.0 | Major (behavior change)     |

### Input Documentation

**Always document inputs:**

```yaml
inputs:
    environment:
        type: string
        required: true
        description: 'Target environment: staging or production'

    skipTests:
        type: boolean
        required: false
        default: false
        description: 'Skip test suite (not recommended for production)'

    timeout:
        type: number
        required: false
        default: 300
        description: 'Deployment timeout in seconds'
```

### Output Documentation

**Document outputs with context:**

```yaml
- type: script
  id: deploy
  name: 'Deploy Service'
  script: ./deploy.sh
  output:
      deploymentUrl:
          type: string
          pattern: 'Deployed to: (https://.*)'
          required: true
          # Used by: smoke-test step

      deploymentId:
          type: string
          pattern: 'Deployment ID: (.*)'
          required: true
          # Used by: monitoring step
```

---

## Summary: Quick Reference

### Workspace Selection

- **Code changes** → `isolated` + `main-only` + `always`
- **Read-only** → `shared` + `main-only` + `always`
- **Local debug** → `manual` + `any` + `always`

### Step Design

- **One responsibility per step**
- **Use imperative verb names**
- **Expose essential outputs only**
- **Add dependencies only when needed**

### Data Flow

- **Linear**: A → B → C (sequential)
- **Fan-out**: A → [B, C, D] (parallel)
- **Fan-in**: A → [B, C] → D (fork-join)
- **Conditional**: Use `when` clause
- **Loop**: Use `onFailure.goto` with `maxIterations`

### Error Handling

- **Transient failures** → Use `retry` with exponential backoff
- **Iterative improvement** → Use `onFailure.goto`
- **One-time setup** → Use `skipOnLoop: true`
- **Validation** → Use `contract` for pre/post-process validation

### Performance

- **Workspace reuse** → `reusePolicy: always`
- **Parallel execution** → Minimize `depends` arrays
- **Model selection** → Haiku for simple, Opus for complex
- **Context optimization** → Include only necessary files

### Testing

- **Start with** `manual` mode
- **Test with** simple inputs first
- **Monitor** trace logs
- **Validate** before deploying

### Maintainability

- **Clear naming** (descriptive IDs and names)
- **Comprehensive descriptions**
- **Document inputs and outputs**
- **Use semantic versioning**

---

**Next Steps:**

- Review the [Pattern Catalog](./pattern-catalog.md) for complete examples
- See [Schema Reference](./schema-reference.md) for detailed field documentation
- Check [Troubleshooting](./troubleshooting.md) for common issues

---

**Last Updated**: 2026-01-23
**Version**: 1.0.0
