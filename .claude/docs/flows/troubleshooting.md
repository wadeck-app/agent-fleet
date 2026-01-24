# Flow Troubleshooting Guide

Comprehensive guide to diagnosing and fixing flow validation and runtime errors.

## Quick Navigation

- [Validation Errors Reference](#validation-errors-reference) - Error codes with examples
- [Runtime Errors](#runtime-errors) - Execution failures and fixes
- [Common Issues](#common-issues) - Frequently encountered problems
- [Debugging Workflow](#debugging-workflow) - Step-by-step debugging process
- [FAQ](#faq) - Quick answers to common questions

---

## Validation Errors Reference

All validation errors are categorized by `ValidationCode` from the flow engine. Each error includes severity, causes, fixes, and examples.

### Error Code Quick Reference

| Code                         | Severity      | Category     | Description                                 |
| ---------------------------- | ------------- | ------------ | ------------------------------------------- |
| `MISSING_FIELD`              | Error/Warning | Schema       | Required field is missing                   |
| `INVALID_TYPE`               | Error         | Schema       | Field has wrong data type                   |
| `INVALID_VALUE`              | Error         | Schema       | Field value is not valid                    |
| `DUPLICATE_ID`               | Error         | Schema       | Step ID is used more than once              |
| `EMPTY_COLLECTION`           | Error         | Schema       | Required array/object is empty              |
| `UNDEFINED_STEP`             | Error         | Reference    | Referenced step does not exist              |
| `UNDEFINED_INPUT`            | Error         | Reference    | Referenced input not declared               |
| `UNDEFINED_OUTPUT`           | Warning       | Reference    | Referenced output not defined in step       |
| `UNDEFINED_VARIABLE`         | Warning       | Reference    | Variable reference may be invalid           |
| `UNDEFINED_FLOW`             | Error         | Reference    | SubFlow references non-existent flow        |
| `CIRCULAR_DEPENDENCY`        | Error         | Semantic     | Step dependencies form a cycle              |
| `CIRCULAR_SUBFLOW_REFERENCE` | Error         | Semantic     | SubFlow chain creates circular reference    |
| `UNREACHABLE_STEP`           | Warning       | Semantic     | Step has no path from root nodes            |
| `NO_TERMINAL_STEP`           | Error         | Semantic     | Flow has no ending step                     |
| `TYPE_MISMATCH`              | Warning       | Semantic     | Value type doesn't match declaration        |
| `INVALID_TEMPLATE_SYNTAX`    | Error         | Template     | Template expression syntax error            |
| `MALFORMED_EXPRESSION`       | Error         | Template     | Variable expression is malformed            |
| `UNUSED_INPUT`               | Warning       | Optimization | Input declared but never used               |
| `UNUSED_OUTPUT`              | Warning       | Optimization | Output defined but never referenced         |
| `MISSING_OUTPUT`             | Warning       | Template     | Step has no output config but is referenced |
| `AUTO_DISCOVERED_INPUT`      | Info          | Template     | Input auto-discovered from template         |

---

## Schema Validation Errors

### MISSING_FIELD

**What it means**: A required field is missing from the flow or step configuration.

**Common causes**:

- Flow missing `id`, `name`, or `workspace` configuration
- Step missing `id`, `name`, or type-specific fields (e.g., `prompt` for model steps)
- Workspace missing `mode`, `gitStrategy`, or `reusePolicy`

**How to fix**:

1. Check the error message for which field is missing
2. Refer to [Schema Reference](./schema-reference.md) for required fields
3. Add the missing field with appropriate value

**Example (before)**:

```yaml
my-flow:
    name: 'My Flow'
    # ❌ Missing 'id' field
    workspace:
        mode: isolated
        # ❌ Missing gitStrategy and reusePolicy
    steps:
        - type: model
          # ❌ Missing 'id' and 'prompt'
          model: haiku
```

**Example (after)**:

```yaml
my-flow:
    id: my-flow # ✓ Added
    name: 'My Flow'
    workspace:
        mode: isolated
        gitStrategy: main-only # ✓ Added
        reusePolicy: always # ✓ Added
    steps:
        - type: model
          id: analyze # ✓ Added
          name: 'Analyze'
          prompt: 'Analyze the input' # ✓ Added
          model: haiku
```

---

### INVALID_TYPE

**What it means**: A field has the wrong data type.

**Common causes**:

- `concurrencyKey` is not a string
- `workingDir` is not a string
- `env` is not an object
- `blocking` (user_intervention) is not a boolean

**How to fix**:

1. Check the error message for expected vs actual type
2. Convert the value to the correct type

**Example (before)**:

```yaml
- type: script
  id: build
  script: 'npm run build'
  workingDir: ['src'] # ❌ Array instead of string
  env: 'NODE_ENV=production' # ❌ String instead of object
```

**Example (after)**:

```yaml
- type: script
  id: build
  script: 'npm run build'
  workingDir: 'src' # ✓ String
  env: # ✓ Object
      NODE_ENV: production
```

---

### INVALID_VALUE

**What it means**: A field value is not from the allowed set of values.

**Common causes**:

- Invalid `mode`: must be `isolated`, `shared`, or `manual`
- Invalid `gitStrategy`: must be `main-only`, `feature-branch`, `any`, or `worktree`
- Invalid `reusePolicy`: must be `never`, `if-available`, or `always`
- Invalid `model`: must be `sonnet`, `haiku`, or `opus`
- Invalid input `type`: must be `string`, `number`, `boolean`, or `object`

**How to fix**:

1. Check the error message for valid values
2. Replace with a valid value from the list

**Example (before)**:

```yaml
workspace:
    mode: dedicated # ❌ Not valid
    gitStrategy: trunk-based # ❌ Not valid
    reusePolicy: cached # ❌ Not valid

steps:
    - type: model
      id: analyze
      model: gpt4 # ❌ Not valid
      prompt: 'Analyze'
```

**Example (after)**:

```yaml
workspace:
    mode: isolated # ✓ Valid
    gitStrategy: main-only # ✓ Valid
    reusePolicy: always # ✓ Valid

steps:
    - type: model
      id: analyze
      model: sonnet # ✓ Valid
      prompt: 'Analyze'
```

---

### DUPLICATE_ID

**What it means**: Multiple steps have the same ID.

**Common causes**:

- Copy-pasting steps without changing IDs
- Typos in step IDs

**How to fix**:

1. Find all steps with the duplicate ID
2. Rename each to be unique

**Example (before)**:

```yaml
steps:
    - type: script
      id: process # ❌ Duplicate
      script: 'echo "first"'

    - type: script
      id: process # ❌ Duplicate
      script: 'echo "second"'
```

**Example (after)**:

```yaml
steps:
    - type: script
      id: process-first # ✓ Unique
      script: 'echo "first"'

    - type: script
      id: process-second # ✓ Unique
      script: 'echo "second"'
```

---

### EMPTY_COLLECTION

**What it means**: A required array or collection is empty.

**Common causes**:

- No steps defined in flow
- User intervention choice step has no options

**How to fix**:

1. Add at least one element to the collection

**Example (before)**:

```yaml
my-flow:
    name: 'Empty Flow'
    workspace:
        mode: isolated
        gitStrategy: main-only
        reusePolicy: always
    steps: [] # ❌ Empty
```

**Example (after)**:

```yaml
my-flow:
    name: 'Valid Flow'
    workspace:
        mode: isolated
        gitStrategy: main-only
        reusePolicy: always
    steps: # ✓ At least one step
        - type: script
          id: hello
          name: 'Say Hello'
          script: 'echo "Hello"'
```

---

## Reference Validation Errors

### UNDEFINED_STEP

**What it means**: A step references another step that doesn't exist.

**Common causes**:

- Typo in step ID in `depends` field
- Typo in step ID in template expression `steps.stepId.outputs.var`
- Typo in step ID in `onFailure.goto`
- Step ID was changed but references weren't updated

**How to fix**:

1. Check the error message for which step is referenced
2. Verify the step ID exists
3. Fix the typo or add the missing step

**Example (before)**:

```yaml
steps:
    - type: script
      id: fetch-data
      script: 'curl https://api.example.com/data'
      output:
          data: { type: string, pattern: '(.*)' }

    - type: model
      id: analyze
      depends: [fetch_data] # ❌ Underscore instead of hyphen
      prompt: 'Analyze: ${{ steps.fetchData.outputs.data }}' # ❌ camelCase instead of kebab-case
      model: haiku
```

**Example (after)**:

```yaml
steps:
    - type: script
      id: fetch-data
      script: 'curl https://api.example.com/data'
      output:
          data: { type: string, pattern: '(.*)' }

    - type: model
      id: analyze
      depends: [fetch-data] # ✓ Correct ID
      prompt: 'Analyze: ${{ steps.fetch-data.outputs.data }}' # ✓ Correct ID
      model: haiku
```

---

### UNDEFINED_INPUT

**What it means**: Template references an input that isn't declared in the flow's `inputs` section.

**Common causes**:

- Typo in input name in template
- Input declaration is missing
- Auto-discovery is disabled (strict mode)

**How to fix**:

1. Add the input to the `inputs` section, or
2. Fix the typo in the template

**Example (before)**:

```yaml
my-flow:
    name: 'Process File'
    workspace:
        mode: isolated
        gitStrategy: main-only
        reusePolicy: always
    inputs:
        file_path: string # Note: underscore
    steps:
        - type: script
          id: process
          script: 'cat ${{ inputs.filePath }}' # ❌ camelCase doesn't match
```

**Example (after - Option 1: Fix template)**:

```yaml
my-flow:
    name: 'Process File'
    workspace:
        mode: isolated
        gitStrategy: main-only
        reusePolicy: always
    inputs:
        file_path: string
    steps:
        - type: script
          id: process
          script: 'cat ${{ inputs.file_path }}' # ✓ Matches input name
```

**Example (after - Option 2: Add input)**:

```yaml
my-flow:
    name: 'Process File'
    workspace:
        mode: isolated
        gitStrategy: main-only
        reusePolicy: always
    inputs:
        file_path: string
        filePath: string # ✓ Added
    steps:
        - type: script
          id: process
          script: 'cat ${{ inputs.filePath }}' # ✓ Now valid
```

---

### UNDEFINED_OUTPUT

**What it means**: Template references a step output that isn't defined in the step's `output` configuration.

**Severity**: Warning (won't prevent execution, but output may not be available)

**Common causes**:

- Forgot to add output definition to step
- Typo in output variable name
- Output pattern doesn't capture the expected value

**How to fix**:

1. Add the output definition to the source step's `output` section
2. Verify the pattern correctly captures the value
3. Fix any typos in the output name

**Example (before)**:

```yaml
steps:
    - type: script
      id: get-version
      script: |
          VERSION="1.2.3"
          echo "version=$VERSION"
          echo "build=123"
      output:
          version: { type: string, pattern: 'version=(.*)' }
          # ❌ Missing 'build' output definition

    - type: script
      id: tag
      depends: [get-version]
      script: |
          echo "Tagging version ${{ steps.get-version.outputs.version }}"
          echo "Build number ${{ steps.get-version.outputs.build }}"  # ⚠️ Warning: undefined
```

**Example (after)**:

```yaml
steps:
    - type: script
      id: get-version
      script: |
          VERSION="1.2.3"
          echo "version=$VERSION"
          echo "build=123"
      output:
          version: { type: string, pattern: 'version=(.*)' }
          build: { type: string, pattern: 'build=(.*)' } # ✓ Added

    - type: script
      id: tag
      depends: [get-version]
      script: |
          echo "Tagging version ${{ steps.get-version.outputs.version }}"
          echo "Build number ${{ steps.get-version.outputs.build }}"  # ✓ Now defined
```

**See also**: [validation-error-undefined-output](../../../.agent-fleet/flows.yml) in flows.yml

---

### UNDEFINED_FLOW

**What it means**: SubFlow step references a flow that doesn't exist in the registry.

**Common causes**:

- Flow ID doesn't match any registered flow
- Flow file not loaded/parsed
- Typo in flowId

**How to fix**:

1. Check available flows in registry
2. Fix the flowId or add the missing flow
3. Ensure flow file is loaded before execution

**Example (before)**:

```yaml
steps:
    - type: subflow
      id: validate
      flowId: validation-flow # ❌ Flow doesn't exist
      inputs:
          data: '${{ inputs.data }}'
```

**Example (after)**:

```yaml
steps:
    - type: subflow
      id: validate
      flowId: data-validator # ✓ Correct flow ID
      inputs:
          data: '${{ inputs.data }}'
```

---

## Semantic Validation Errors

### CIRCULAR_DEPENDENCY

**What it means**: Step dependencies form a cycle, making execution impossible.

**Common causes**:

- Step A depends on B, B depends on C, C depends on A
- Incorrect dependency declaration
- Using `depends` when you meant to use `onFailure.goto`

**How to fix**:

1. Identify the cycle in the error message
2. Remove or modify dependencies to break the cycle
3. Consider if a feedback loop (`onFailure.goto`) is what you need

**Example (before)**:

```yaml
steps:
    - type: script
      id: step-a
      depends: [step-c] # ❌ Cycle: A → C → B → A
      script: 'echo "A"'

    - type: script
      id: step-b
      depends: [step-a] # ❌ Part of cycle
      script: 'echo "B"'

    - type: script
      id: step-c
      depends: [step-b] # ❌ Part of cycle
      script: 'echo "C"'
```

**Example (after - Linear flow)**:

```yaml
steps:
    - type: script
      id: step-a
      # ✓ No dependency (root step)
      script: 'echo "A"'

    - type: script
      id: step-b
      depends: [step-a] # ✓ Linear: A → B → C
      script: 'echo "B"'

    - type: script
      id: step-c
      depends: [step-b] # ✓ Linear: A → B → C
      script: 'echo "C"'
```

**Example (after - Feedback loop)**:

```yaml
steps:
    - type: model
      id: generate
      name: 'Generate Code'
      model: sonnet
      prompt: 'Generate code for: ${{ inputs.task }}'
      output:
          code: { type: string }

    - type: model
      id: validate
      name: 'Validate Code'
      depends: [generate]
      model: haiku
      prompt: 'Validate this code: ${{ steps.generate.outputs.code }}'
      output:
          valid: { type: string }
      onFailure:
          goto: generate # ✓ Feedback loop (not circular dependency)
          maxIterations: 3
```

---

### CIRCULAR_SUBFLOW_REFERENCE

**What it means**: SubFlow chain creates a circular reference (Flow A calls Flow B, which calls Flow A).

**Common causes**:

- Direct recursion without `allowRecursion: true`
- Deep circular chain (A → B → C → A)

**How to fix**:

1. For intentional recursion: Add `allowRecursion: true` and ensure proper exit condition via `when` clause
2. For unintentional: Break the circular chain by restructuring flows

**Example (before - Direct recursion)**:

```yaml
recursive-flow:
    name: 'Recursive Flow'
    workspace:
        mode: isolated
        gitStrategy: main-only
        reusePolicy: always
    inputs:
        count: number
    steps:
        - type: subflow
          id: recurse
          flowId: recursive-flow # ❌ Calls itself without allowRecursion
          inputs:
              count: '${{ inputs.count }}'
```

**Example (after - Allowed recursion)**:

```yaml
recursive-flow:
    name: 'Recursive Flow'
    workspace:
        mode: isolated
        gitStrategy: main-only
        reusePolicy: always
    inputs:
        count: number
    steps:
        - type: subflow
          id: recurse
          flowId: recursive-flow # ✓ Allowed
          allowRecursion: true # ✓ Explicitly allowed
          when: '${{ inputs.count > 0 }}' # ✓ Exit condition
          inputs:
              count: '${{ inputs.count - 1 }}'
```

---

### UNREACHABLE_STEP

**What it means**: A step has no dependency path from any root node (steps with no dependencies).

**Severity**: Warning (won't prevent execution, but step will never run)

**Common causes**:

- Copy-pasted step without connecting dependencies
- Removed dependency without adding alternative path
- Isolated step that should be deleted

**How to fix**:

1. Add dependency from an existing step, or
2. Remove the unreachable step if not needed

**Example (before)**:

```yaml
steps:
    - type: script
      id: fetch
      script: 'curl https://api.example.com/data'

    - type: script
      id: process
      depends: [fetch]
      script: 'process data'

    - type: script
      id: archive # ⚠️ Unreachable - no dependency path
      script: 'archive old data'
```

**Example (after)**:

```yaml
steps:
    - type: script
      id: fetch
      script: 'curl https://api.example.com/data'

    - type: script
      id: process
      depends: [fetch]
      script: 'process data'

    - type: script
      id: archive
      depends: [process] # ✓ Now reachable
      script: 'archive old data'
```

---

## Template Validation Errors

### INVALID_TEMPLATE_SYNTAX

**What it means**: Template expression has syntax errors.

**Common causes**:

- Missing closing braces `}}`
- Mismatched braces
- Invalid characters in expression

**How to fix**:

1. Check template syntax: `${{ expression }}`
2. Ensure braces are balanced
3. Verify expression uses valid characters

**Example (before)**:

```yaml
prompt: 'Process ${{ inputs.data }  # ❌ Missing closing braces
prompt: 'Process ${ inputs.data }}'  # ❌ Only one brace instead of two
prompt: 'Process ${{ inputs.data }'  # ❌ Missing closing brace
```

**Example (after)**:

```yaml
prompt: 'Process ${{ inputs.data }}' # ✓ Correct syntax
```

---

### MALFORMED_EXPRESSION

**What it means**: Variable expression is malformed.

**Common causes**:

- Incorrect variable path format
- Missing required parts (e.g., `steps.` without step ID)
- Invalid characters in path

**How to fix**:

1. Use correct format: `inputs.name`, `steps.stepId.outputs.name`, `task.property`
2. Verify all path components are present

**Example (before)**:

```yaml
# ❌ Various malformed expressions
prompt: 'Data: ${{ .data }}'  # Missing prefix
prompt: 'Data: ${{ steps..outputs.data }}'  # Double dot
prompt: 'Data: ${{ steps.fetch }}'  # Missing .outputs
```

**Example (after)**:

```yaml
# ✓ Correct expressions
prompt: 'Data: ${{ inputs.data }}'
prompt: 'Data: ${{ steps.fetch.outputs.data }}'
```

---

## Runtime Errors

These errors occur during flow execution, not during validation.

### Template Rendering Errors

**What it means**: Template cannot be rendered at runtime (e.g., variable is null/undefined).

**Common causes**:

- Output pattern didn't match (value is null)
- Optional input not provided
- Conditional step skipped, output unavailable

**Error message examples**:

```
Failed to render input 'prompt': Cannot read property 'data' of undefined
Failed to render output 'result': null value for required output
```

**How to fix**:

1. **Verify output patterns**: Ensure pattern matches actual output
2. **Check dependencies**: Ensure step producing output ran successfully
3. **Use conditional logic**: Add `when` clause to skip if value unavailable
4. **Provide default values**: Use input defaults for optional inputs

**Example (before)**:

```yaml
steps:
    - type: script
      id: fetch
      script: 'curl https://api.example.com/data'
      output:
          data: { type: string, pattern: 'DATA: (.*)' } # Pattern might not match

    - type: model
      id: process
      depends: [fetch]
      prompt: 'Process: ${{ steps.fetch.outputs.data }}' # ❌ Might be null
      model: haiku
```

**Example (after)**:

```yaml
steps:
    - type: script
      id: fetch
      script: 'curl https://api.example.com/data'
      output:
          data: { type: string, pattern: 'DATA: (.*)' }
          raw: { type: string, pattern: '(.*)' } # ✓ Fallback: capture everything

    - type: model
      id: process
      depends: [fetch]
      when: '${{ steps.fetch.outputs.data != null }}' # ✓ Only run if data available
      prompt: 'Process: ${{ steps.fetch.outputs.data }}'
      model: haiku
```

---

### Script Execution Failures

**What it means**: Script step exited with non-zero exit code.

**Common causes**:

- Command not found
- File not found
- Permission denied
- Script logic error

**Error message examples**:

```
Script exited with code 127  # Command not found
Script exited with code 1    # General error
Script exited with code 126  # Permission denied
```

**How to fix**:

1. **Check command availability**: Verify command exists in workspace
2. **Verify paths**: Use absolute paths or correct relative paths
3. **Check permissions**: Ensure script/files have execute permissions
4. **Add error handling**: Use `set -e` in bash scripts
5. **Add retry logic**: Configure `retry` on step
6. **Add feedback loop**: Use `onFailure.goto` to retry with corrections

**Example (before)**:

```yaml
- type: script
  id: build
  script: 'npm run build' # ❌ Might fail if dependencies not installed
```

**Example (after - With retry)**:

```yaml
- type: script
  id: build
  script: 'npm run build'
  retry:
      maxAttempts: 3
      backoff: exponential
```

**Example (after - With feedback loop)**:

```yaml
- type: script
  id: build
  script: 'npm run build'
  output:
      success: { type: string, pattern: 'Build complete' }
      error: { type: string, pattern: 'ERROR: (.*)' }
  onFailure:
      goto: fix-build
      maxIterations: 3

- type: model
  id: fix-build
  depends: [build]
  model: sonnet
  prompt: |
      Build failed with error: ${{ steps.build.outputs.error }}
      Fix the issue and output corrected code.
```

---

### Model Step Failures

**What it means**: Claude execution failed or produced invalid output.

**Common causes**:

- Claude crashed or was killed
- Output parsing failed
- Rate limiting or API errors
- Prompt too large

**Error message examples**:

```
Claude exited with code 1
Failed to extract output from Claude response
Model API error: Rate limit exceeded
```

**How to fix**:

1. **Check Claude logs**: Review stderr output for details
2. **Simplify prompt**: Reduce prompt size if too large
3. **Add retry logic**: Configure `retry` on step
4. **Use smaller model**: Try `haiku` instead of `sonnet` for simple tasks
5. **Check output extraction**: Verify output patterns match Claude response format

**Example (before)**:

```yaml
- type: model
  id: generate
  model: opus
  prompt: |
      Generate a complete application with 50 files...  # ❌ Too large
  output:
      result: { type: string }
```

**Example (after)**:

```yaml
- type: model
  id: generate
  model: haiku # ✓ Smaller model for simpler task
  prompt: |
      Generate the main application file only
  output:
      result: { type: string }
  retry: # ✓ Retry on failure
      maxAttempts: 3
      backoff: exponential
```

---

### SubFlow Errors

**What it means**: SubFlow execution failed.

**Common causes**:

- Input mapping incorrect
- SubFlow itself has errors
- Maximum nesting depth exceeded (default: 10)
- WorkspaceStrategy configuration issue

**Error message examples**:

```
Flow 'validation-flow' not found
Maximum nesting depth (10) exceeded
SubFlow execution failed: [error details]
workspaceStrategy "separate" is not yet implemented
```

**How to fix**:

1. **Verify flow exists**: Check flow ID is correct
2. **Check input mapping**: Ensure all required inputs provided
3. **Reduce nesting**: Flatten deeply nested subflows
4. **Use 'inherit' workspace**: Default workspaceStrategy is more stable

**Example (before)**:

```yaml
- type: subflow
  id: validate
  flowId: validator # ❌ Flow doesn't exist
  workspaceStrategy: separate # ❌ Not implemented
  inputs:
      data: '${{ inputs.dataValue }}' # ❌ Input name mismatch
```

**Example (after)**:

```yaml
- type: subflow
  id: validate
  flowId: data-validator # ✓ Correct flow ID
  workspaceStrategy: inherit # ✓ Supported
  inputs:
      data: '${{ inputs.data }}' # ✓ Correct input name
```

---

## Common Issues

Frequently encountered problems with solutions.

### "My step outputs aren't available"

**Symptoms**:

- Template rendering fails with "undefined" error
- Downstream steps can't access output values

**Root causes**:

1. **Output pattern doesn't match**: Pattern regex doesn't capture output
2. **Step failed**: Step didn't run successfully
3. **Missing dependency**: Downstream step missing `depends` on output-producing step
4. **Output not defined**: Step's `output` section missing the variable

**Solution checklist**:

```yaml
✓ Verify step ran successfully (check trace)
✓ Verify output pattern matches actual stdout
✓ Verify downstream step has correct dependency
✓ Verify output is defined in step's output section
✓ Verify template uses correct path: steps.stepId.outputs.varName
```

**Debugging example**:

```yaml
- type: script
  id: fetch
  script: |
      echo "Fetching data..."
      DATA="value123"
      echo "result=$DATA"  # ← Verify this format
  output:
      result: { type: string, pattern: 'result=(.*)' } # ← Pattern must match

- type: script
  id: use-result
  depends: [fetch] # ← Must depend on fetch
  script: 'echo "Result: ${{ steps.fetch.outputs.result }}"' # ← Correct path
```

**See also**: [validation-error-undefined-output](../../../.agent-fleet/flows.yml) in flows.yml

---

### "Pattern doesn't match output"

**Symptoms**:

- Output variable is null or undefined
- Warning: "output not captured"

**Root causes**:

1. **Incorrect regex**: Pattern doesn't match stdout format
2. **Multiline output**: Pattern only matches single line
3. **Extra whitespace**: Pattern too strict about whitespace
4. **Wrong capture group**: Using wrong parentheses in regex

**Solution checklist**:

```yaml
✓ Test pattern with actual output using regex tester
✓ Use .* for flexible matching
✓ Use \s+ for flexible whitespace matching
✓ Ensure pattern has capture group: (...)
✓ Consider capturing entire output as fallback: (.*)
```

**Example patterns**:

```yaml
# Exact match
pattern: 'result=(.+)'  # Matches: result=value123

# Flexible whitespace
pattern: 'result\s*=\s*(.+)'  # Matches: result = value123

# Multiline (use raw: true)
pattern: 'BEGIN\n(.*)\nEND'

# Capture everything as fallback
pattern: '(.*)'
```

---

### "Circular dependency detected"

**Symptoms**:

- Validation error with cycle path (A → B → C → A)
- Flow won't execute

**Root causes**:

1. **True circular dependency**: Steps depend on each other in a cycle
2. **Confused with feedback loops**: Should use `onFailure.goto` instead

**Solutions**:

**Option 1: Fix dependency order**

```yaml
# ❌ Before (circular)
- id: step-a
  depends: [step-c] # Cycle: A → C → B → A
- id: step-b
  depends: [step-a]
- id: step-c
  depends: [step-b]

# ✓ After (linear)
- id: step-a
  # No dependency
- id: step-b
  depends: [step-a] # Linear: A → B → C
- id: step-c
  depends: [step-b]
```

**Option 2: Use feedback loop**

```yaml
# For retry/correction patterns
- id: generate
  model: sonnet
  prompt: 'Generate code'
  onFailure:
      goto: validate # Not a circular dependency

- id: validate
  depends: [generate]
  model: haiku
  prompt: 'Validate code'
  onFailure:
      goto: generate # Feedback loop
      maxIterations: 3
```

---

### "Flow validation passes but execution fails"

**Symptoms**:

- Flow passes validation
- Runtime error during execution

**Root causes**:

1. **Template rendering fails**: Variables null/undefined at runtime
2. **Script fails**: Command exits with error code
3. **Output pattern mismatch**: Pattern doesn't match actual output
4. **File/command not found**: Resource doesn't exist in workspace

**Solution checklist**:

```yaml
✓ Test flow with real inputs
✓ Check trace logs for error details
✓ Verify output patterns match actual stdout
✓ Add retry logic for flaky steps
✓ Add error handling in scripts
✓ Use feedback loops for self-correction
```

---

## Debugging Workflow

Step-by-step process for debugging flow issues.

### Step 1: Check Validation Results

**Before running the flow**:

1. Review validation panel in UI
2. Look for errors (red) and warnings (yellow)
3. Address all errors first (flow won't run with errors)
4. Review warnings (may cause runtime issues)

**Validation severity**:

- **Error (red)**: Must fix before execution
- **Warning (yellow)**: Should fix, may cause runtime issues
- **Info (blue)**: Informational, safe to ignore

---

### Step 2: Review Flow Dependencies

**Check step dependency graph**:

1. Identify root steps (no dependencies)
2. Verify all steps are reachable from root
3. Check for circular dependencies
4. Verify `depends` declarations match variable usage

**Dependency rules**:

```yaml
# If step B uses step A's output, B must depend on A
- id: step-a
  output:
      result: { type: string, pattern: 'result=(.*)' }

- id: step-b
  depends: [step-a] # ← Required
  script: 'echo ${{ steps.step-a.outputs.result }}'
```

---

### Step 3: Verify Step Outputs

**For each step that produces outputs**:

1. Check output definitions exist
2. Verify patterns match expected stdout format
3. Test patterns with sample output
4. Add fallback patterns for flexibility

**Output verification checklist**:

```yaml
✓ output section exists
✓ Each output has pattern (script) or from (user_intervention)
✓ Pattern has capture group: (...)
✓ Pattern matches actual output format
✓ Consider adding raw: true for multiline
```

---

### Step 4: Test in Isolation

**To isolate the issue**:

1. Create minimal reproduction flow
2. Test single step in isolation
3. Verify inputs/outputs work correctly
4. Gradually add complexity

**Minimal test example**:

```yaml
test-step-isolation:
    name: 'Test Step Isolation'
    workspace:
        mode: isolated
        gitStrategy: main-only
        reusePolicy: never
    inputs:
        test_input: string
    steps:
        - type: script
          id: test
          script: 'echo "result=${{ inputs.test_input }}"'
          output:
              result: { type: string, pattern: 'result=(.*)' }
```

---

### Step 5: Check Trace Logs

**Flow execution trace shows**:

1. Which steps ran successfully
2. Which steps failed and why
3. Step outputs captured
4. Execution timeline

**How to read trace**:

```json
{
	"stepId": "fetch-data",
	"stepType": "script",
	"status": "error",
	"error": "Script exited with code 127",
	"stdout": "bash: curl: command not found",
	"startTime": 1234567890,
	"endTime": 1234567891
}
```

**Key fields**:

- `status`: "success" or "error"
- `error`: Error message if failed
- `stdout`: Script output
- `stderr`: Error output
- `outputs`: Captured output values

---

### Step 6: Review Common Patterns

**Compare your flow with working examples**:

1. Check [Pattern Catalog](./pattern-catalog.md) for similar use cases
2. Review [flows.yml](../../../.agent-fleet/flows.yml) for examples
3. Look for validation-error-\* flows showing fixes

---

### Step 7: Enable Verbose Logging

**For deeper debugging**:

1. Check worker logs for detailed execution info
2. Review Claude stdout/stderr for model steps
3. Check script execution logs

---

## FAQ

Quick answers to common questions.

### When to use SubFlow vs single flow?

**Use SubFlow when**:

- Logic is reusable across multiple flows
- Complex flow becomes too large (>20 steps)
- Different workspace requirements
- Logical separation of concerns

**Use single flow when**:

- Simple, linear workflow (<10 steps)
- Steps are tightly coupled
- No reusability needed
- All steps share same context

**Example (SubFlow)**:

```yaml
# Main flow
main-workflow:
    steps:
        - type: subflow
          id: validate
          flowId: data-validator # Reusable validator
          inputs:
              data: '${{ inputs.data }}'

# Reusable validator (separate flow)
data-validator:
    inputs:
        data: string
    steps:
        - type: model
          id: validate
          prompt: 'Validate: ${{ inputs.data }}'
          model: haiku
```

---

### How to pass data between steps?

**Using output + depends**:

```yaml
- type: script
  id: produce
  script: 'echo "data=value123"'
  output:
      data: { type: string, pattern: 'data=(.*)' } # ← Capture output

- type: script
  id: consume
  depends: [produce] # ← Declare dependency
  script: 'echo "Using: ${{ steps.produce.outputs.data }}"' # ← Use output
```

**Using flow inputs**:

```yaml
inputs:
    shared_value: string # ← Flow-level input

steps:
    - type: script
      id: step1
      script: 'echo ${{ inputs.shared_value }}' # ← All steps can access

    - type: script
      id: step2
      script: 'echo ${{ inputs.shared_value }}' # ← All steps can access
```

---

### How to use environment variables in templates?

**Environment variables are not directly accessible in templates**. Use inputs instead:

```yaml
# ❌ Won't work
script: 'echo ${{ env.MY_VAR }}'

# ✓ Use inputs
inputs:
    my_var:
        type: string
        default: 'default-value'

steps:
    - type: script
      id: use-var
      script: 'echo ${{ inputs.my_var }}'
```

**For script steps, use env field**:

```yaml
- type: script
  id: build
  script: 'npm run build'
  env:
      NODE_ENV: production
      BUILD_ID: '${{ task.id }}'
```

---

### How to test flow without creating tasks?

**Option 1: Use CLI (if available)**:

```bash
flow-engine run my-flow --input data=test
```

**Option 2: Create test task in UI**:

1. Create task with "Test" in title
2. Assign flow
3. Execute and review results
4. Delete task when done

**Option 3: Create isolated test flow**:

```yaml
test-my-flow:
    name: 'Test My Flow'
    workspace:
        mode: isolated
        gitStrategy: main-only
        reusePolicy: never # Always fresh
    inputs:
        test_data: string
    steps:
        - type: subflow
          id: test
          flowId: my-flow # Your actual flow
          inputs:
              data: '${{ inputs.test_data }}'
```

---

### How to handle step failures?

**Option 1: Retry logic**:

```yaml
- type: script
  id: flaky-step
  script: 'curl https://api.example.com'
  retry:
      maxAttempts: 3
      backoff: exponential # 1s, 2s, 4s
```

**Option 2: Feedback loop (self-correction)**:

```yaml
- type: model
  id: generate
  model: sonnet
  prompt: 'Generate code'
  output:
      code: { type: string }
  onFailure:
      goto: validate
      maxIterations: 3

- type: model
  id: validate
  depends: [generate]
  model: haiku
  prompt: 'Validate: ${{ steps.generate.outputs.code }}'
  onFailure:
      goto: generate # Try again with corrections
```

**Option 3: Graceful degradation**:

```yaml
- type: script
  id: fetch-data
  script: 'curl https://api.example.com || echo "default_data"'
  # Won't fail, falls back to default
```

---

### How to debug template interpolation?

**Add debug steps to print values**:

```yaml
- type: script
  id: debug-values
  depends: [previous-step]
  script: |
      echo "=== Debug Values ==="
      echo "Input: ${{ inputs.data }}"
      echo "Step output: ${{ steps.previous-step.outputs.result }}"
      echo "Task ID: ${{ task.id }}"
      echo "==================="
```

**Check trace logs for rendered values**:

- Trace shows final rendered templates
- Look for "null" or "undefined" in rendered output

---

### How to use dynamic step IDs?

**You can't**. Step IDs must be static, known at definition time.

**Alternative: Use conditional steps**:

```yaml
- type: script
  id: process-dev
  when: '${{ task.environment == "dev" }}'
  script: 'dev-specific-command'

- type: script
  id: process-prod
  when: '${{ task.environment == "prod" }}'
  script: 'prod-specific-command'
```

---

### How to handle optional inputs?

**Use default values**:

```yaml
inputs:
    required_input: string
    optional_input:
        type: string
        required: false
        default: 'default-value'

steps:
    - type: script
      id: use-input
      script: 'echo "Value: ${{ inputs.optional_input }}"'
      # Will use "default-value" if not provided
```

**Use conditional steps**:

```yaml
- type: script
  id: use-optional
  when: '${{ inputs.optional_input != null }}'
  script: 'echo ${{ inputs.optional_input }}'
```

---

## Additional Resources

- **[Quick Start Guide](./quick-start-guide.md)** - Create your first flow
- **[Schema Reference](./schema-reference.md)** - Complete field documentation
- **[Pattern Catalog](./pattern-catalog.md)** - Annotated examples
- **[Best Practices](./best-practices.md)** - Optimization and design patterns
- **[flows.yml](../../../.agent-fleet/flows.yml)** - All example flows

---

**Last Updated**: 2026-01-23
**Version**: 1.0.0
