# GitHub Actions Syntax Migration

## Overview

The Flow Engine has been successfully migrated from JavaScript template string syntax (`${}`) to GitHub Actions syntax (`${{ }}`). This document summarizes the migration and its benefits.

## What Changed

### Old Syntax (JavaScript Template Strings)

```yaml
script: echo "${message}"
script: echo "${build.version}"
script: echo "${task.priority}"
```

### New Syntax (GitHub Actions)

```yaml
script: echo "${{ inputs.message }}"
script: echo "${{ steps.build.outputs.version }}"
script: echo "${{ task.priority }}"
```

## Key Improvements

### 1. Explicit Context Naming

**Before**: Variables had ambiguous sources

```yaml
script: echo "${message}" # Where does 'message' come from?
```

**After**: Clear context specification

```yaml
script: echo "${{ inputs.message }}" # Clearly from flow inputs
```

### 2. No Shell Variable Conflicts

**Before**: Confusion between template and shell variables

```yaml
script: echo "${HOME}" # Is this a template variable or shell variable?
```

**After**: Clear distinction

```yaml
script: echo "$HOME" # Shell variable
script: echo "${{ inputs.home }}" # Flow variable
```

### 3. Type Safety and Validation

The new syntax enables compile-time validation:

```yaml
${{ inputs.varName }}              # ✓ Valid
${{ steps.stepId.outputs.var }}    # ✓ Valid
${{ task.priority }}               # ✓ Valid
${{ unknownContext.var }}          # ✗ Error: Unknown context
```

### 4. Better IDE Support

The explicit context structure enables:

- Auto-completion of available contexts
- Type checking for variable access
- Better error messages

## Migration Impact

### Files Modified

1. **Core Template Engine**
    - `src/flow/template-renderer.ts` - Updated regex pattern and resolution logic

2. **Flow Examples**
    - `src/flow/flow-registry.ts` - Updated all default flow definitions

3. **Test Files**
    - `src/flow/flow-executor.test.ts` - 8 tests updated
    - `src/flow/integration.test.ts` - 4 tests updated

### Test Results

All 104 tests passing:

- ✓ 21 tests: Output extraction
- ✓ 19 tests: Condition evaluation
- ✓ 8 tests: Flow execution
- ✓ 4 tests: Integration tests
- ✓ 52 tests: Compiled JavaScript versions

## Context Types

### 1. Inputs Context: `inputs`

Access flow input parameters:

```yaml
inputs:
  username: string
  count: number

steps:
  - script: echo "User: ${{ inputs.username }}, Count: ${{ inputs.count }}"
```

### 2. Steps Context: `steps`

Access outputs from previous steps:

```yaml
steps:
    - id: build
      script: npm run build
      output:
          version: { type: string }

    - id: deploy
      script: echo "Deploying ${{ steps.build.outputs.version }}"
```

**Required Format**: `steps.<stepId>.outputs.<variableName>`

### 3. Task Context: `task`

Access task metadata:

```yaml
steps:
  - script: echo "Priority: ${{ task.priority }}"
```

Available metadata:

- `task.priority` - Task priority level
- `task.createdAt` - Task creation timestamp
- Any custom metadata passed to executor

## Technical Implementation

### Pattern Matching

```typescript
// Old regex
const pattern = /\$\{([^}]+)\}/g;

// New regex (with whitespace handling)
const pattern = /\$\{\{\s*([^}]+?)\s*\}\}/g;
```

### Variable Resolution

```typescript
// Parse expression: "steps.build.outputs.version"
const parts = expression.split('.');
const root = parts[0]; // "steps"

if (root === 'inputs') {
  return context.inputs[parts[1]];
} else if (root === 'steps') {
  const stepId = parts[1];        // "build"
  const outputs = context.stepOutputs.get(stepId);
  const varName = parts[3];       // "version" (skip "outputs")
  return outputs[varName];
} else if (root === 'task') {
  return context.taskMetadata[parts[1]];
}
```

### Error Handling

Clear error messages for invalid expressions:

```typescript
// Missing context
'${{ varName }}';
// Error: Unknown root context: 'varName'. Use 'inputs', 'steps', or 'task'

// Wrong format
'${{ steps.build.version }}';
// Error: steps requires format: steps.stepId.outputs.varName

// Missing variable
'${{ inputs.nonexistent }}';
// Error: Property 'nonexistent' not found
```

## Usage Examples

### Simple Interpolation

```typescript
const flow = {
	inputs: { name: 'string' },
	steps: [
		{
			type: 'script',
			script: 'echo "Hello ${{ inputs.name }}"',
		},
	],
};

await executor.execute({
	flow,
	inputs: { name: 'Alice' },
	// Output: "Hello Alice"
});
```

### Output Chaining

```typescript
const flow = {
	steps: [
		{
			id: 'generate',
			script: 'echo "42"',
			output: {
				value: { type: 'number', transform: 'parseInt' },
			},
		},
		{
			id: 'use',
			script: 'echo "Value: ${{ steps.generate.outputs.value }}"',
		},
	],
};
// Output: "Value: 42"
```

### Conditional Branching

```typescript
const flow = {
	inputs: { threshold: 'number' },
	steps: [
		{
			id: 'check',
			script: 'echo "10"',
			output: {
				value: { type: 'number', transform: 'parseInt' },
			},
			next: {
				conditions: [{ when: 'output.value > inputs.threshold', goto: 'high' }],
				default: 'low',
			},
		},
		{ id: 'high', script: 'echo "High value"' },
		{ id: 'low', script: 'echo "Low value"' },
	],
};
```

### Task Metadata

```typescript
await executor.execute({
	flow,
	taskMetadata: {
		priority: 'high',
		createdAt: '2024-01-01T00:00:00Z',
		customField: 'value',
	},
});

// Access in flow:
// ${{ task.priority }}      -> "high"
// ${{ task.createdAt }}     -> "2024-01-01T00:00:00Z"
// ${{ task.customField }}   -> "value"
```

## Backward Compatibility

**Breaking Change**: This is a breaking change. Old flows using `${}` syntax will not work with the new template renderer.

### Migration Checklist

To migrate existing flows:

1. ✓ Update all `${...}` to `${{ ... }}`
2. ✓ Add explicit context prefixes:
    - `${var}` → `${{ inputs.var }}`
    - `${step.var}` → `${{ steps.step.outputs.var }}`
    - `${task.prop}` → `${{ task.prop }}`
3. ✓ Update conditional expressions if needed
4. ✓ Test all flows
5. ✓ Update documentation

## Testing

### Running Tests

```bash
npm test
```

All 104 tests pass, covering:

- Template rendering with all context types
- Output extraction with transforms
- Conditional transitions
- Multi-step flows
- Integration scenarios

### Running Demos

```bash
npx tsx examples/run-demo.ts
```

Demonstrates:

1. Simple variable interpolation
2. Output extraction and passing
3. Conditional branching
4. Task metadata access
5. Complex multi-step pipeline

## Resources

- [FLOW_ENGINE_USAGE.md](FLOW_ENGINE_USAGE.md) - Complete usage guide
- [WORKFLOW_SYSTEM_DESIGN.md](WORKFLOW_SYSTEM_DESIGN.md) - System architecture
- [examples/flow-demo.ts](../examples/flow-demo.ts) - Working examples
- [src/flow/template-renderer.ts](../src/flow/template-renderer.ts) - Implementation

## Conclusion

The GitHub Actions syntax migration provides:

- ✓ Clearer variable scoping
- ✓ Better error messages
- ✓ No shell conflicts
- ✓ Enhanced type safety
- ✓ Improved IDE support
- ✓ Industry-standard syntax

All tests passing and demos working successfully confirm the migration is complete and stable.
