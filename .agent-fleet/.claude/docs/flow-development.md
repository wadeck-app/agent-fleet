# Flow Development Guide

## Overview

Flows are defined in `.agent-fleet/flows.yml` and executed as Directed Acyclic Graphs (DAGs) by the FlowExecutor.

## External Flow Files

For better organization and reusability, flows can be defined in separate files instead of being embedded directly in `flows.yml`.

### Basic Usage

Reference an external file using the `source` field:

```yaml
# .agent-fleet/flows.yml
my-flow:
  source: my-flow.yml
```

```yaml
# .agent-fleet/my-flow.yml
my-flow:
  name: My Reusable Flow
  description: Flow defined in external file
  workspace:
    mode: isolated
    gitStrategy: main-only
    reusePolicy: never
  inputs:
    task: string
  steps:
    - id: step1
      type: model
      model: sonnet
      prompt: "${{ inputs.task }}"
```

### External File Requirements

1. **Location**: External files must be in the same directory as `flows.yml` (the `.agent-fleet/` directory)
2. **Format**: External files must use the `.yml` extension
3. **Structure**: External files contain the complete flow definition with the flow ID as the root key
4. **Multiple Flows**: External files can contain multiple flow definitions for reusability

### Local Overrides

You can override specific fields from the external file in `flows.yml`:

```yaml
# .agent-fleet/flows.yml
my-flow:
  source: my-flow.yml
  name: Custom Name  # Overrides the name from external file
  workspace:
    reusePolicy: always  # Merges with workspace config from external file
```

**Merge behavior**:
- Scalar fields (name, description): Local completely replaces external
- Object fields (workspace, inputs, hooks): Deep merge (local fields override matching external fields)
- Array fields (steps): Local completely replaces external

### Security Constraints

For security, external flow files have the following restrictions:
- Must be in `.agent-fleet/` directory (no subdirectories)
- Only `.yml` extension allowed
- Path traversal (`../`) is blocked
- Absolute paths are rejected

### Hot-Reload

External files are automatically watched for changes. When an external file is modified, the affected flows are reloaded without restarting the orchestrator.

## Flow Structure

```yaml
flows:
  example-flow:
    description: "Brief description of what this flow does"
    inputs:
      inputName:
        description: "What this input is for"
        type: string
        required: true
    steps:
      step-id:
        worker: worker-name
        prompt: "Template with ${{ inputs.inputName }}"
        depends: []  # List of step IDs this depends on
```

## Step Types

Flows support three types of steps:

### 1. Model Steps
Execute AI model prompts:
```yaml
- type: model
  id: analyze
  model: sonnet  # or haiku, opus
  prompt: "Analyze this code: ${{ inputs.code }}"
  output:
    analysis: { type: string }
```

### 2. Script Steps
Execute shell commands:
```yaml
- type: script
  id: test
  script: "npm test"
  output:
    exitCode: { type: number }
```

#### Multiline Scripts

Scripts support multiline syntax for better readability:

```yaml
- type: script
  id: setup-and-test
  script: |
    # Install dependencies
    npm install

    # Run tests
    npm test

    # Generate coverage report
    npm run coverage
  output:
    result: { type: string }
```

**Windows Support:** On Windows, multiline scripts are automatically written to temporary `.bat` files for proper execution. This allows you to write readable scripts with comments instead of unreadable one-liners with `&&`.

```yaml
# ✅ Good - Readable multiline script
- type: script
  id: calculate
  script: |
    set /a result=%input%*2 >nul
    echo result=%result%
    if %result% GTR 10 (echo status=high) else (echo status=low)

# ❌ Avoid - Hard to read one-liner
- type: script
  id: calculate
  script: 'set /a result=%input%*2 >nul && echo result=%result% && if %result% GTR 10 (echo status=high) else (echo status=low)'
```

### 3. SubFlow Steps (NEW)
Call other flows as steps, enabling flow composition and reusability:

```yaml
- type: subflow
  id: implementation
  flowId: implement-feature  # Flow to call
  inputs:
    feature: "${{ inputs.featureName }}"
  workspaceStrategy: inherit  # Optional: 'inherit' (default) or 'separate'
  depends: [analyze]
```

## Flow Composition with SubFlowSteps

SubFlowSteps allow you to compose complex workflows from smaller, reusable flows.

### Basic Example

```yaml
# Atomic flow - reusable building block
echo-message:
  workspace: { mode: manual }
  inputs:
    message: string
  steps:
    - type: script
      id: echo
      script: 'echo "${{ inputs.message }}"'
      output:
        result: { type: string }

# Composed flow - calls echo-message twice
greet-twice:
  workspace: { mode: manual }
  inputs:
    name: string
  steps:
    - type: subflow
      id: first-greeting
      flowId: echo-message
      inputs:
        message: "Hello, ${{ inputs.name }}!"

    - type: subflow
      id: second-greeting
      flowId: echo-message
      depends: [first-greeting]
      inputs:
        message: "Welcome, ${{ inputs.name }}!"
```

### Nested SubFlows

SubFlows can call other SubFlows, enabling hierarchical workflows:

```yaml
# Level 1: Atomic
run-tests:
  workspace: { mode: manual }
  steps:
    - type: script
      id: test
      script: "npm test"

# Level 2: Composed
build-and-test:
  workspace: { mode: manual }
  steps:
    - type: script
      id: build
      script: "npm run build"

    - type: subflow
      id: test
      flowId: run-tests
      depends: [build]

# Level 3: Nested composition
full-ci:
  workspace: { mode: manual }
  steps:
    - type: subflow
      id: build-test
      flowId: build-and-test

    - type: script
      id: deploy
      depends: [build-test]
      script: "npm run deploy"
```

**Nesting Limit:** Maximum 10 levels of nesting to prevent infinite recursion.

### Conditional SubFlows

Use `when` conditions to execute SubFlows conditionally (see [Conditional Step Execution](#conditional-step-execution) for full documentation):

```yaml
adaptive-workflow:
  workspace: { mode: manual }
  inputs:
    taskType: string
  steps:
    - type: script
      id: classify
      script: |
        # Determine task type
        if echo "${{ inputs.taskType }}" | grep -i "frontend" >nul; then
          echo isFrontend=true
        else
          echo isFrontend=false
        fi
      output:
        isFrontend: { type: string, pattern: "isFrontend=(.*)" }

    - type: subflow
      id: frontend-impl
      flowId: frontend-implementation
      when: "${{ steps.classify.outputs.isFrontend === 'true' }}"
      depends: [classify]
      inputs:
        task: "${{ inputs.taskType }}"

    - type: subflow
      id: backend-impl
      flowId: backend-implementation
      when: "${{ steps.classify.outputs.isFrontend === 'false' }}"
      depends: [classify]
      inputs:
        task: "${{ inputs.taskType }}"
```

**Note:** The `when` clause works the same for all step types (model, script, subflow). See the dedicated section below for complete `when` syntax and examples.

### Workspace Strategy

SubFlowSteps support two workspace strategies:

#### `inherit` (default)
The subflow executes in the same workspace as the parent flow:
```yaml
- type: subflow
  id: local-task
  flowId: some-flow
  workspaceStrategy: inherit  # Same workspace as parent
```

**Use when:**
- SubFlow needs access to parent's files
- Working on the same codebase
- No isolation needed

#### `separate` (Phase 2 - Not Yet Implemented)
The subflow creates a separate task assigned by the orchestrator:
```yaml
- type: subflow
  id: isolated-task
  flowId: some-flow
  workspaceStrategy: separate  # New workspace, distributed execution
```

**Will be used when:**
- SubFlow needs workspace isolation
- Parallel execution on different codebases
- Distributed task processing

**Current Status:** Attempting to use `separate` will throw an error with a clear message.

### SubFlowStep Output Passing

SubFlow outputs are available to subsequent steps:

```yaml
analyze-and-implement:
  workspace: { mode: manual }
  inputs:
    task: string
  steps:
    - type: subflow
      id: analysis
      flowId: analyze-code
      inputs:
        code: "${{ inputs.task }}"
      # analysis flow outputs: { recommendations: string }

    - type: subflow
      id: implementation
      flowId: implement-feature
      depends: [analysis]
      inputs:
        # Use output from previous subflow
        plan: "${{ steps.analysis.outputs.recommendations }}"
```

### SubFlowStep Validation Rules

The validator enforces these rules:

1. **Flow Reference Exists**
   ```yaml
   # ❌ Bad - flow doesn't exist
   - type: subflow
     id: bad
     flowId: non-existent-flow
   ```
   Error: `SubFlowStep 'bad' references unknown flow 'non-existent-flow'`

2. **No Direct Circular Reference (unless explicitly allowed)**
   ```yaml
   # ❌ Bad - flow calls itself without permission
   my-flow:
     steps:
       - type: subflow
         id: recursive
         flowId: my-flow  # Calls itself without allowRecursion!
   ```
   Error: `SubFlowStep 'recursive' creates circular reference (flow calls itself). Use allowRecursion: true if intentional.`

   **To allow recursion:** Add `allowRecursion: true` and a `when` condition:
   ```yaml
   # ✅ Good - explicit recursion with exit condition
   countdown:
     steps:
       - type: subflow
         id: recurse
         flowId: countdown
         allowRecursion: true
         when: "${{ inputs.count > 0 }}"
         inputs:
           count: "${{ inputs.count - 1 }}"
   ```

3. **No Indirect Circular Dependencies**
   ```yaml
   # ❌ Bad - circular chain
   flow-a:
     steps:
       - type: subflow
         flowId: flow-b  # A → B

   flow-b:
     steps:
       - type: subflow
         flowId: flow-c  # B → C

   flow-c:
     steps:
       - type: subflow
         flowId: flow-a  # C → A (circular!)
   ```
   Error: `SubFlowStep creates circular dependency chain`

4. **Required Inputs Provided**
   ```yaml
   # ⚠️ Warning - missing required input
   target-flow:
     inputs:
       required-param: string

   calling-flow:
     steps:
       - type: subflow
         flowId: target-flow
         inputs: {}  # Missing required-param
   ```
   Warning: `SubFlowStep missing input 'required-param' required by flow 'target-flow'`

### SubFlowStep Best Practices

#### 1. Keep Flows Focused (Single Responsibility)
```yaml
# ✅ Good - Each flow has one clear purpose
analyze-code: { ... }      # Only analyzes
implement-feature: { ... } # Only implements
run-tests: { ... }         # Only tests

# Compose them in a workflow
full-dev-cycle:
  steps:
    - type: subflow
      flowId: analyze-code
    - type: subflow
      flowId: implement-feature
    - type: subflow
      flowId: run-tests
```

#### 2. Use Descriptive Flow Names
```yaml
# ✅ Good
frontend-component-development
backend-api-implementation
database-migration-runner

# ❌ Bad
flow1
do-stuff
helper
```

#### 3. Document Flow Dependencies
```yaml
# ✅ Good - Clear what the flow depends on
integration-test:
  description: "Runs integration tests. Requires build artifacts."
  # Caller should run 'build' flow first
```

#### 4. Limit Nesting Depth
```yaml
# ✅ Good - 2-3 levels max for maintainability
main-workflow → sub-workflow → atomic-task

# ⚠️ Acceptable but harder to debug - 4-5 levels
# ❌ Bad - 6+ levels (hard to understand and debug)
```

## Template Variable Syntax

### Valid Patterns

```yaml
# Input variables
${{ inputs.variableName }}

# Previous step outputs
${{ steps.stepId.outputs.fieldName }}

# Task metadata
${{ task.priority }}
${{ task.id }}
```

### Invalid Patterns

```yaml
# ❌ Complex expressions not supported
${{ inputs.var || 'default' }}
${{ inputs.x + inputs.y }}
${{ steps.foo.outputs.bar ?? 'fallback' }}
```

**Workaround:** Declare optional inputs in the flow definition and handle missing values at runtime in worker code.

## Validation

### Automatic Validation

The FlowValidator runs automatically when:
- Server starts and loads flows
- Flow file is modified (in watch mode)

### Success Indicator

Check server logs for:
```
✓ Loaded flow: your-flow-name
```

### Error Handling

If validation fails:
```
Validation failed for flow 'your-flow':
  [ERROR] Step 'step-b' depends on undefined step 'step-a'
  [ERROR] Template variable ${{ inputs.unknown }} not declared
```

**STOP and fix errors immediately before continuing.**

## Common Validation Errors

### Undefined Step Reference
```yaml
# ❌ Bad
steps:
  step-b:
    depends: [step-a]  # step-a doesn't exist
```

### Circular Dependencies
```yaml
# ❌ Bad
steps:
  step-a:
    depends: [step-b]
  step-b:
    depends: [step-a]  # Circular!
```

### Undeclared Template Variables
```yaml
# ❌ Bad - 'username' not declared in inputs
steps:
  greet:
    prompt: "Hello ${{ inputs.username }}"
```

### Invalid Step Output Reference
```yaml
# ❌ Bad - step-a might not produce 'result'
steps:
  step-b:
    prompt: "Use ${{ steps.step-a.outputs.result }}"
    depends: [step-a]
```

## Testing Checklist

Before marking a flow as complete:

- [ ] Flow validates without errors on server start
- [ ] All `depends` references point to existing step IDs
- [ ] All template variables are declared in `inputs` or reference valid `steps.*.outputs`
- [ ] Test actual task creation: `npm run add-task`
- [ ] Verify DAG execution order in logs
- [ ] Check for warnings about optional fields
- [ ] Test with edge cases (empty inputs, missing optional fields)
- [ ] Verify worker can process all steps

## DAG Execution Order

Steps execute based on dependency graph:

```yaml
steps:
  init:
    depends: []         # Runs first (no dependencies)

  parallel-a:
    depends: [init]     # Runs after init

  parallel-b:
    depends: [init]     # Runs concurrently with parallel-a

  finalize:
    depends: [parallel-a, parallel-b]  # Runs after both complete
```

**Execution order:** `init` → (`parallel-a` + `parallel-b`) → `finalize`

## Conditional Step Execution

Use the `when` clause to execute steps conditionally based on runtime data:

```yaml
steps:
  # First step produces an output
  - type: script
    id: check-status
    script: "echo status=ready"
    output:
      status: { type: string, pattern: "status=(.*)" }

  # Second step only runs if status is "ready"
  - type: script
    id: deploy
    depends: [check-status]
    when: "${{ steps['check-status'].outputs.status === 'ready' }}"
    script: "npm run deploy"
```

### When Clause Syntax

The `when` clause evaluates JavaScript expressions with access to:
- `steps` - Outputs from previous steps
- `inputs` - Flow input values
- `task` - Task metadata

```yaml
# Boolean comparison
when: "${{ steps.validate.outputs.isValid === true }}"

# String comparison
when: "${{ steps.check.outputs.result === 'success' }}"

# Numeric comparison
when: "${{ steps.analyze.outputs.score > 80 }}"

# Using inputs
when: "${{ inputs.environment === 'production' }}"

# Complex expressions
when: "${{ steps.test.outputs.exitCode === 0 && inputs.deploy === true }}"
```

### Accessing Step Outputs

Step outputs follow the syntax: `steps.stepId.outputs.fieldName` or `steps['step-id'].outputs.fieldName` (use bracket notation for IDs with hyphens):

```yaml
steps:
  - type: script
    id: calculate-metrics
    script: |
      echo errors=5
      echo warnings=12
    output:
      errors: { type: string, pattern: "errors=(.*)" }
      warnings: { type: string, pattern: "warnings=(.*)" }

  - type: model
    id: report
    depends: [calculate-metrics]
    when: "${{ steps['calculate-metrics'].outputs.errors !== '0' }}"
    prompt: "Generate error report"
```

### Recursive Flows with When Conditions

Combine `when` conditions with `allowRecursion` to create loops with exit conditions:

```yaml
countdown:
  inputs:
    count: string
  steps:
    - type: script
      id: calculate
      script: |
        set /a next=${{ inputs.count }}-1 >nul
        echo next=%next%
        if %next% GEQ 0 (echo continue=true) else (echo continue=false)
      output:
        next: { type: string, pattern: "next=(.*)" }
        continue: { type: string, pattern: "continue=(.*)" }

    - type: subflow
      id: recurse
      flowId: countdown
      allowRecursion: true
      depends: [calculate]
      when: "${{ steps.calculate.outputs.continue === 'true' }}"
      inputs:
        count: "${{ steps.calculate.outputs.next }}"
```

**Validation:** The validator warns about recursive SubFlows and reminds you to add a `when` condition to prevent infinite loops.

### When Clause Behavior

- **Skipped steps are marked as completed** - Dependencies are satisfied even if the step didn't run
- **Downstream steps can still execute** - Skipped steps don't block the DAG
- **No outputs from skipped steps** - Accessing `steps.skipped-step.outputs` will be undefined
- **Evaluation errors skip the step** - If condition evaluation fails, the step is safely skipped

```yaml
steps:
  - type: script
    id: optional-step
    when: "${{ inputs.runOptional === true }}"
    script: "echo optional"

  # This runs even if optional-step was skipped
  - type: script
    id: always-runs
    depends: [optional-step]
    script: "echo final"
```

## Best Practices

### 1. Clear Step IDs
Use descriptive kebab-case IDs:
```yaml
# ✅ Good
validate-input
fetch-data
transform-results

# ❌ Bad
step1
s2
do-stuff
```

### 2. Explicit Dependencies
Always declare dependencies, even if they seem obvious:
```yaml
# ✅ Good
steps:
  parse:
    depends: [fetch]
```

### 3. Input Validation
Declare all required inputs with clear descriptions:
```yaml
inputs:
  apiKey:
    description: "API key for external service authentication"
    type: string
    required: true
```

### 4. Output Documentation
Document expected outputs in step descriptions:
```yaml
steps:
  analyze:
    description: "Analyzes code and outputs 'issues' array and 'score' number"
```

## Debugging Flows

### Enable Debug Logging
```bash
DEBUG=flow:* npm run orch:ui
```

### Check Execution Trace
View step execution in orchestrator logs:
```
[FlowExecutor] Executing step: init
[FlowExecutor] Step 'init' completed successfully
[FlowExecutor] Executing parallel steps: parallel-a, parallel-b
```

### Common Issues

**Steps not executing:**
- Check `depends` array for typos
- Verify all dependencies completed successfully
- Check worker availability

**Template variables not resolving:**
- Verify input names match exactly (case-sensitive)
- Check step output fields exist
- Review validator warnings

**Unexpected execution order:**
- Review dependency graph
- Check for unintentional dependencies
- Use debug logging to trace execution

### SubFlowStep Troubleshooting

**Error: "Flow 'xyz' not found"**
- Verify the flow is defined in `.agent-fleet/flows.yml`
- Check spelling of `flowId` (case-sensitive)
- Restart the orchestrator to reload flows

**Error: "workspaceStrategy 'separate' not yet implemented"**
- Phase 2 feature not available yet
- Remove `workspaceStrategy: separate` or change to `inherit`
- Use `inherit` strategy (default) for now

**Error: "Maximum nesting depth (10) exceeded"**
- You have too many nested SubFlowSteps (A → B → C → ... → K)
- Refactor to reduce nesting levels
- Consider flattening the flow hierarchy

**Error: "Circular reference" or "circular dependency chain"**
- Flow A calls Flow B which calls Flow A (direct or indirect)
- Review your flow call chain
- Remove the circular dependency

**Warning: "Missing input 'xyz' required by flow"**
- SubFlowStep is not providing a required input
- Add the missing input to the SubFlowStep's `inputs` map
- Or make the input optional in the target flow definition

**SubFlow outputs not available in next step:**
- Check that SubFlow's last step declares `output` fields
- Verify you're referencing the correct step ID
- Use syntax: `${{ steps.subflow-id.outputs.field-name }}`

**SubFlow executing in wrong workspace:**
- Check `workspaceStrategy` is set to `inherit`
- Verify parent flow's workspace configuration
- Check logs for workspace path being used

## Example: Complete Flow

See `.agent-fleet/flows.yml` for real examples from the codebase. Key flows:
- `code-review` - Multi-step code review with dependency handling
- `test-and-deploy` - Parallel testing with sequential deployment
