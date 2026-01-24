# Flow Creation Quick Start (15 minutes)

## What You'll Learn

- Create your first flow in 5 minutes
- Choose the right pattern for your needs
- Validate and test your flow
- Avoid common mistakes

## Prerequisites

- Basic YAML knowledge
- Understanding of the task you want to automate
- Access to `.agent-fleet/flows.yml` file

**Estimated Time**: 15 minutes

## Step 1: Choose Your Starting Template

Use this decision tree to select the right pattern:

### Decision Tree

**What type of task are you automating?**

1. **Simple task with one AI step** → Use `simple-implement` pattern
    - Example: "Ask Claude to implement something"
    - Best for: Quick AI-powered tasks

2. **Multi-step with parallel execution** → Use `test-diamond` pattern
    - Example: "Fork work into parallel branches, then merge"
    - Best for: Tasks that can be parallelized

3. **Multiple independent parallel tasks** → Use `test-fork` pattern
    - Example: "Run security audit, linting, and tests in parallel"
    - Best for: Independent tasks without merge point

4. **Task with retry logic** → Use `test-loop` pattern
    - Example: "Implement → Test → Fix → Repeat until tests pass"
    - Best for: Implement-test-fix cycles

5. **Data processing pipeline** → Use `data-etl` pattern
    - Example: "Extract → Transform → Load"
    - Best for: Sequential data transformations

6. **Composition of sub-tasks** → Use `test-subflow-basic` pattern
    - Example: "Reuse existing flows as building blocks"
    - Best for: Complex workflows built from simpler flows

7. **Need user approval** → Use `test-user-intervention` pattern
    - Example: "Prepare deployment → Get approval → Deploy"
    - Best for: Workflows requiring human decision-making

## Step 2: Copy Template from flows.yml

**Location**: `.agent-fleet/flows.yml`

1. Open `.agent-fleet/flows.yml`
2. Find your chosen pattern (e.g., `simple-implement`, `test-diamond`)
3. Copy the entire flow definition (including the flow ID)

**Example** - Copying the `simple-implement` pattern:

```yaml
simple-implement:
    version: '1.0.0'
    name: '(Dummy) Simple Implementation'
    description: 'Ask Claude to implement something'
    workspace:
        mode: isolated
        gitStrategy: main-only
        reusePolicy: always
    statusTransitions:
        onSuccess: review
        onFailure: changes_requested
    inputs:
        task: string
    steps:
        - type: model
          id: implement
          name: 'Implement Task'
          model: haiku
          prompt: '${{ inputs.task }}'
```

## Step 3: Customize Core Properties

Replace the template values with your own:

```yaml
your-flow-id: # ✏️ Choose a unique, descriptive ID (kebab-case)
    version: '1.0.0' # ✏️ Start with 1.0.0
    name: 'Your Flow Name' # ✏️ Human-readable name
    description: 'Clear description of what this flow does' # ✏️ Be specific
```

**Naming Guidelines**:

- **Flow ID**: Use kebab-case (e.g., `deploy-to-production`, `run-security-audit`)
- **Name**: Use proper capitalization (e.g., "Deploy to Production")
- **Description**: Explain what the flow does and when to use it

## Step 4: Configure Workspace

Choose workspace mode based on your needs:

```yaml
workspace:
    mode: isolated # ✏️ Choose: isolated|shared|manual
    gitStrategy: main-only # ✏️ Choose: main-only|feature-branch|any|worktree
    reusePolicy: always # ✏️ Choose: never|if-available|always
```

### Workspace Mode Decision Table

| Mode         | When to Use                       | Git Changes         | Performance          | Safety               |
| ------------ | --------------------------------- | ------------------- | -------------------- | -------------------- |
| **isolated** | Code modifications, builds, tests | ✅ Allowed          | Slower (fresh clone) | ✅ High (isolated)   |
| **shared**   | Q&A, analysis, read-only tasks    | ❌ Not allowed      | ⚡ Fast (reused)     | ⚠️ Medium (shared)   |
| **manual**   | Local debugging                   | ✅ Uses current dir | ⚡ Instant           | ⚠️ Low (current dir) |

**Git Strategy**:

- `main-only`: Only use main branch (safest)
- `feature-branch`: Create feature branches
- `any`: Allow any branch
- `worktree`: Use git worktrees (advanced)

**Reuse Policy**:

- `never`: Always create fresh workspace
- `if-available`: Reuse if available, otherwise create new
- `always`: Block until workspace available (for shared mode)

**👉 Quick Rule**: Use `isolated` + `main-only` + `always` for most flows.

## Step 5: Define Inputs

Inputs are variables passed from the task to the flow.

### Shorthand Syntax (Type Only)

```yaml
inputs:
    taskDescription: string
    count: number
    enabled: boolean
    config: object
```

### Extended Syntax (With Metadata)

```yaml
inputs:
    priority:
        type: string
        required: true # Default: false
        default: 'medium'
        description: 'Task priority: low, medium, high'

    maxRetries:
        type: number
        required: false
        default: 3
        description: 'Maximum number of retry attempts'
```

**Types**:

- `string` - Text values
- `number` - Numeric values (integer or float)
- `boolean` - true/false
- `object` - JSON objects

## Step 6: Customize Steps

Replace template steps with your logic.

### Basic Step Structure

```yaml
steps:
    - type: model|script|subflow|user_intervention
      id: unique-step-id # ✏️ Must be unique within flow
      name: 'Human-Readable Step Name' # ✏️ Use imperative verbs
      # ... step-specific config
```

### Model Step (AI Execution)

```yaml
- type: model
  id: analyze-code
  name: 'Analyze Code Quality'
  model: sonnet # haiku (fast), sonnet (balanced), opus (powerful)
  prompt: |
      Analyze this code for bugs:

      ${{ inputs.codeSnippet }}

      Focus on: ${{ inputs.focusArea }}
  output:
      score: { type: number }
      issues: { type: object, transform: parseJSON }
```

### Script Step (Command Execution)

```yaml
- type: script
  id: run-tests
  name: 'Run Test Suite'
  script: npm test -- ${{ inputs.testPattern }}
  output:
      exitCode: { type: number }
      passed: { type: number, pattern: 'Tests passed: (\d+)' }
      failed: { type: number, pattern: 'Tests failed: (\d+)' }
```

### SubFlow Step (Flow Composition)

```yaml
- type: subflow
  id: deploy-frontend
  name: 'Deploy Frontend'
  flowId: deploy-to-production
  inputs:
      service: 'frontend'
      version: '${{ inputs.version }}'
  output:
      deploymentUrl: '${{ steps.deploy.outputs.url }}'
```

### User Intervention Step (Approval)

```yaml
- type: user_intervention
  id: approval
  name: 'Approve Deployment'
  interventionType: approval
  blocking: true
  approval:
      title: 'Approve Production Deployment'
      description: 'Version: ${{ inputs.version }}'
      allowReject: true
  output:
      approved: { type: boolean, from: 'intervention.approved' }
      comment: { type: string, from: 'intervention.comment' }
```

## Step 7: Add Dependencies

Steps run in parallel by default. Use `depends` to enforce order:

```yaml
steps:
    - type: script
      id: step-a
      name: 'Step A'
      script: echo "A"

    - type: script
      id: step-b
      name: 'Step B (depends on A)'
      depends: [step-a]  # ✏️ Waits for step-a to complete
      script: echo "B uses: ${{ steps.step-a.outputs.result }}"

    - type: script
      id: step-c
      name: 'Step C (depends on A and B)'
      depends: [step-a, step-b]  # ✏️ Waits for both
      script: echo "C merges A and B"
```

**Key Rule**: If a step uses `${{ steps.X.outputs.Y }}`, it MUST have `depends: [X]`.

## Step 8: Validate

The system validates flows automatically when you save `flows.yml`.

### Check Validation in UI

1. Navigate to the Flows page in the UI
2. Look for validation indicators (red = error, yellow = warning)
3. Click on the flow to see detailed validation issues

### Validate from Command Line

**Complete autonomous validation (RECOMMENDED):**

Use the complete validation script that implements ALL FlowWorker validation logic:

```bash
# Validate only example flows
node scripts/validate-flows-complete.js

# Validate all flows
node scripts/validate-flows-complete.js --all
```

This script implements all 8 validators from FlowWorker and checks:

- ✅ Schema (required fields, types, workspace settings)
- ✅ Circular dependencies
- ✅ Undefined step/output references
- ✅ Template arithmetic/logical operators (not supported)
- ✅ Dependency order (step uses output without depending on it)
- ✅ Greedy regex patterns (`.*` vs `.*?`)
- ✅ UserIntervention output 'from' values
- ✅ Default value type mismatches
- ✅ Required inputs with default values
- ✅ Recursive SubFlow steps

**Alternative: Validate with FlowWorker**

You can also start the FlowWorker to see validation results with the same logic:

```bash
npm run start:worker
```

The FlowWorker will show detailed validation errors in the console:

```
⚠️  Flow 'example-broken' has validation errors (loading anyway for editing):
  Errors: 3
  Warnings: 1

  [ERROR] Circular dependency detected: step-a → step-b → step-a
    at step: step-b
    suggestion: Remove circular dependency

  [ERROR] Reference to undefined output: steps.missing.outputs.value
    at step: step-c
    suggestion: Declare output 'value' in step 'missing'

✓ Loaded flow: example-working
```

**Output example:**

```
🔍 Validating flows (complete validation)...
📝 Found 34 flows total (10 example flows)

Validating 10 flows...

  ❌ example-blog-post
     ERROR: Template expression contains logical operator which is not supported: ${{ inputs.reference_url || 'None provided' }}
  ⚠️  example-performance-metrics
     WARNING: Default value type 'number' for input 'max_iterations' does not match declared type 'integer'
     WARNING: Input 'max_iterations' is marked required but has a default value
  ✅ example-file-processor

📊 Summary:
   Valid: 6
   Invalid: 4

❌ Some flows have validation errors
```

### Common Validation Errors

1. **DUPLICATE_ID**: Two steps have the same ID

    ```yaml
    # ❌ Wrong
    - type: script
      id: build
    - type: script
      id: build # Duplicate!

    # ✅ Correct
    - type: script
      id: build-frontend
    - type: script
      id: build-backend
    ```

2. **UNDEFINED_STEP**: Dependency on non-existent step

    ```yaml
    # ❌ Wrong
    - type: script
      id: step-b
      depends: [step-a] # step-a doesn't exist!

    # ✅ Correct
    - type: script
      id: step-a
      script: echo "A"

    - type: script
      id: step-b
      depends: [step-a]
      script: echo "B"
    ```

3. **CIRCULAR_DEPENDENCY**: Steps depend on each other in a loop

    ```yaml
    # ❌ Wrong - creates a cycle
    - type: script
      id: step-a
      depends: [step-b]

    - type: script
      id: step-b
      depends: [step-a]

    # ✅ Correct - linear dependency
    - type: script
      id: step-a
      script: echo "A"

    - type: script
      id: step-b
      depends: [step-a]
      script: echo "B"
    ```

## Step 9: Test Your Flow

1. **Create a test task** in the UI
2. **Select your new flow** from the dropdown
3. **Fill in input values**
4. **Execute and monitor** the trace
5. **Check outputs and logs**

### Testing Tips

- Start with `manual` workspace mode for faster iteration
- Use simple test inputs first
- Check the trace logs for each step
- Verify outputs are extracted correctly

## Common First-Time Mistakes

### Mistake #1: Forgetting to Declare Dependencies

**Problem**: Step uses another step's output but doesn't declare dependency.

```yaml
# ❌ Wrong: step-b uses step-a output but no dependency
steps:
    - type: script
      id: step-a
      script: echo "result=42"
      output:
          result: { type: string, pattern: 'result=(.*)' }

    - type: script
      id: step-b
      # Missing: depends: [step-a]
      script: echo "${{ steps.step-a.outputs.result }}"
```

**Solution**: Add dependency declaration:

```yaml
# ✅ Correct: declare dependency
steps:
    - type: script
      id: step-a
      script: echo "result=42"
      output:
          result: { type: string, pattern: 'result=(.*)' }

    - type: script
      id: step-b
      depends: [step-a] # ✅ Added dependency
      script: echo "${{ steps.step-a.outputs.result }}"
```

### Mistake #2: Output Pattern Not Matching Script Output

**Problem**: Regex pattern expects different format than script produces.

```yaml
# ❌ Wrong: pattern expects "result=" but script outputs just "42"
- type: script
  id: calculate
  script: echo "42"
  output:
      value: { type: string, pattern: 'result=(.*)' } # Won't match!
```

**Solution**: Either fix the pattern or the script:

```yaml
# ✅ Option 1: Fix pattern to match actual output
- type: script
  id: calculate
  script: echo "42"
  output:
      value: { type: string } # Captures entire stdout

# ✅ Option 2: Fix script to match pattern
- type: script
  id: calculate
  script: echo "result=42"
  output:
      value: { type: string, pattern: 'result=(.*)' } # Now matches!
```

### Mistake #3: Using Wrong Workspace Mode

**Problem**: Using `shared` mode for flows that modify code.

```yaml
# ❌ Wrong: shared mode for code modifications
workspace:
    mode: shared # Shared doesn't allow git changes!
    gitStrategy: feature-branch # This will fail
```

**Solution**: Use correct mode for your task:

```yaml
# ✅ Correct: isolated mode for code modifications
workspace:
    mode: isolated # Allows git changes
    gitStrategy: main-only
    reusePolicy: always
```

**Rule of Thumb**:

- Code changes → `isolated`
- Read-only (Q&A, analysis) → `shared`
- Local debugging → `manual`

### Mistake #4: Missing Output Declarations

**Problem**: Using step output that wasn't declared.

```yaml
# ❌ Wrong: using undeclared output
steps:
    - type: script
      id: build
      script: npm run build
      output:
          status: { type: string }
      # Note: 'exitCode' not declared

    - type: script
      id: check
      depends: [build]
      script: |
          if [ ${{ steps.build.outputs.exitCode }} -eq 0 ]; then
              echo "Success"
          fi
      # ❌ ERROR: exitCode not declared in step 'build'
```

**Solution**: Declare all outputs you plan to use:

```yaml
# ✅ Correct: declare all outputs
steps:
    - type: script
      id: build
      script: npm run build
      output:
          status: { type: string }
          exitCode: { type: number } # ✅ Now declared

    - type: script
      id: check
      depends: [build]
      script: |
          if [ ${{ steps.build.outputs.exitCode }} -eq 0 ]; then
              echo "Success"
          fi
```

### Mistake #5: Invalid Template Syntax

**Problem**: Using wrong variable reference format.

```yaml
# ❌ Wrong: missing context prefix
prompt: 'Analyze: ${{ task }}'  # Should be inputs.task or task.id

# ❌ Wrong: missing 'outputs' in step reference
prompt: 'Result: ${{ steps.analyze.result }}'  # Should be steps.analyze.outputs.result

# ❌ Wrong: trying to do arithmetic in template
script: echo ${{ inputs.count + 1 }}  # Templates don't evaluate expressions
```

**Solution**: Use correct template syntax:

```yaml
# ✅ Correct: proper context prefixes
prompt: 'Analyze: ${{ inputs.task }}'  # inputs.task
prompt: 'Priority: ${{ task.priority }}'  # task.priority
prompt: 'Result: ${{ steps.analyze.outputs.result }}'  # steps.X.outputs.Y

# ✅ Correct: do arithmetic in script, not template
script: |
    count=${{ inputs.count }}
    next=$((count + 1))
    echo "next=$next"
```

## Complete Example: Build and Test Flow

Here's a complete working flow that demonstrates all concepts:

```yaml
build-and-test:
    version: '1.0.0'
    name: 'Build and Test Application'
    description: 'Build the application, run tests, and report results'

    workspace:
        mode: isolated
        gitStrategy: main-only
        reusePolicy: always

    statusTransitions:
        onSuccess: review
        onFailure: changes_requested

    inputs:
        component:
            type: string
            required: true
            description: 'Component to build (frontend, backend, etc.)'

        runTests:
            type: boolean
            required: false
            default: true
            description: 'Whether to run tests after build'

    steps:
        # Step 1: Build the component
        - type: script
          id: build
          name: 'Build Component'
          script: npm run build --workspace=${{ inputs.component }}
          output:
              exitCode: { type: number }
              buildTime: { type: string, pattern: 'Build completed in (.*)' }

        # Step 2: Run tests (conditional)
        - type: script
          id: test
          name: 'Run Tests'
          depends: [build]
          when: '${{ inputs.runTests === true }}'
          script: npm test --workspace=${{ inputs.component }}
          output:
              passed: { type: number, pattern: 'Tests passed: (\d+)' }
              failed: { type: number, pattern: 'Tests failed: (\d+)' }
              coverage: { type: number, pattern: 'Coverage: (\d+)%' }

        # Step 3: Generate report
        - type: model
          id: report
          name: 'Generate Build Report'
          depends: [build, test]
          model: haiku
          prompt: |
              Generate a build report:

              Component: ${{ inputs.component }}
              Build time: ${{ steps.build.outputs.buildTime }}
              Build status: ${{ steps.build.outputs.exitCode === 0 ? 'Success' : 'Failed' }}

              Tests passed: ${{ steps.test.outputs.passed }}
              Tests failed: ${{ steps.test.outputs.failed }}
              Coverage: ${{ steps.test.outputs.coverage }}%

              Provide a summary and recommendations.
          output:
              summary: { type: string }
              recommendations: { type: object, transform: parseJSON }
```

## Next Steps

**You've completed the quick start!** 🎉

### What to do next:

1. **Create your own flow** using the template you copied
2. **Test it** with simple inputs
3. **Review validation errors** if any occur
4. **Explore advanced features**:
    - [Schema Reference](./schema-reference.md) - Complete field documentation
    - [Pattern Catalog](./pattern-catalog.md) - More complex patterns
    - [Best Practices](./best-practices.md) - Optimization tips

### When you need help:

- **Validation errors**: [Troubleshooting Guide](./troubleshooting.md)
- **Pattern selection**: [Pattern Catalog](./pattern-catalog.md)
- **Advanced features**: [Schema Reference](./schema-reference.md)

---

**Time to complete**: ~15 minutes
**Difficulty**: Beginner
**Next**: [Schema Reference](./schema-reference.md) or [Pattern Catalog](./pattern-catalog.md)
