# Flow Development Guide

## Overview

Flows are defined in `.agent-fleet/flows.yaml` and executed as Directed Acyclic Graphs (DAGs) by the FlowExecutor.

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

## Example: Complete Flow

See `.agent-fleet/flows.yaml` for real examples from the codebase. Key flows:
- `code-review` - Multi-step code review with dependency handling
- `test-and-deploy` - Parallel testing with sequential deployment
