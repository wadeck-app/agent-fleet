# Flow Engine Usage Guide

## Overview

The Flow Engine provides a powerful workflow execution system with variable interpolation using GitHub Actions syntax (`${{ }}`). This guide shows how to create and use flows effectively.

## Variable Interpolation Syntax

The Flow Engine uses **GitHub Actions syntax** for variable interpolation:

```
${{ expression }}
```

### Available Contexts

#### 1. Input Variables: `${{ inputs.varName }}`

Access flow input parameters:

```yaml
inputs:
  question: string
  priority: number

steps:
  - type: script
    id: process
    script: echo "Question: ${{ inputs.question }}"
```

#### 2. Step Outputs: `${{ steps.stepId.outputs.varName }}`

Access outputs from previous steps:

```yaml
steps:
  - type: script
    id: generate
    script: echo "42"
    output:
      count:
        type: number
        transform: parseInt

  - type: script
    id: use-output
    script: echo "Count was: ${{ steps.generate.outputs.count }}"
```

#### 3. Task Metadata: `${{ task.property }}`

Access task metadata (priority, createdAt, etc.):

```yaml
steps:
  - type: script
    id: check-priority
    script: echo "Priority: ${{ task.priority }}"
```

## Complete Flow Example

Here's a complete flow showing all features:

```yaml
id: data-processing-flow
name: Data Processing Flow
description: Process data with conditional logic

workspace:
  mode: isolated
  gitStrategy: feature-branch
  reusePolicy: never

inputs:
  dataFile: string
  threshold: number

steps:
  # Step 1: Extract data from file
  - type: script
    id: extract-data
    name: Extract Data
    script: cat ${{ inputs.dataFile }}
    output:
      content:
        type: string
      lineCount:
        type: number
        pattern: "Lines: (\\d+)"
        transform: parseInt
    next:
      default: analyze

  # Step 2: Analyze with AI model
  - type: model
    id: analyze
    name: Analyze Data
    model: sonnet
    prompt: |
      Analyze this data:
      ${{ steps.extract-data.outputs.content }}

      Line count: ${{ steps.extract-data.outputs.lineCount }}
      Threshold: ${{ inputs.threshold }}
      Priority: ${{ task.priority }}
    output:
      score:
        type: number
        transform: parseInt
      recommendation:
        type: string
    next:
      conditions:
        - when: "output.score > inputs.threshold"
          goto: high-score-action
        - when: "output.score < inputs.threshold"
          goto: low-score-action
      default: normal-action

  # Step 3a: High score path
  - type: script
    id: high-score-action
    name: Handle High Score
    script: |
      echo "High score detected: ${{ steps.analyze.outputs.score }}"
      echo "Recommendation: ${{ steps.analyze.outputs.recommendation }}"

  # Step 3b: Low score path
  - type: script
    id: low-score-action
    name: Handle Low Score
    script: echo "Low score: ${{ steps.analyze.outputs.score }}"

  # Step 3c: Normal path
  - type: script
    id: normal-action
    name: Handle Normal Score
    script: echo "Normal score: ${{ steps.analyze.outputs.score }}"
```

## Using the Flow Engine Programmatically

### Basic Execution

```typescript
import { FlowExecutor } from './flow/flow-executor.js';
import type { FlowDefinition, Workspace } from './flow/types.js';

// Create executor
const executor = new FlowExecutor();

// Define workspace
const workspace: Workspace = {
	id: 'workspace-1',
	path: '/path/to/workspace',
	mode: 'isolated',
	createdAt: new Date().toISOString(),
	lastUsedAt: new Date().toISOString(),
	usageCount: 1,
};

// Define flow (or load from FlowRegistry)
const flow: FlowDefinition = {
	id: 'simple-qa',
	name: 'Simple Q&A',
	workspace: {
		mode: 'shared',
		gitStrategy: 'main-only',
		reusePolicy: 'always',
	},
	inputs: {
		question: 'string',
	},
	steps: [
		{
			type: 'script',
			id: 'answer',
			name: 'Answer Question',
			script: 'echo "Processing: ${{ inputs.question }}"',
		},
	],
};

// Execute flow
const result = await executor.execute({
	taskId: 'task-123',
	flow,
	workspace,
	inputs: {
		question: 'What is the meaning of life?',
	},
	taskMetadata: {
		priority: 'high',
		createdAt: new Date().toISOString(),
	},
});

// Check results
if (result.success) {
	console.log('Flow completed successfully');
	console.log('Outputs:', result.outputs);
	console.log('Trace:', result.trace);
} else {
	console.error('Flow failed:', result.error);
}
```

## Output Extraction Features

### Pattern Matching with Regex

Extract specific values from script output:

```yaml
steps:
    - type: script
      id: get-version
      script: npm version
      output:
          version:
              type: string
              pattern: "v(\\d+\\.\\d+\\.\\d+)" # Captures "1.2.3" from "v1.2.3"
```

### Type Conversion

Convert extracted strings to typed values:

```yaml
output:
    count:
        type: number
        pattern: "Count: (\\d+)"
        transform: parseInt

    enabled:
        type: boolean
        pattern: 'Enabled: (true|false)'
        transform: parseBoolean

    config:
        type: object
        transform: parseJSON
```

### Available Transforms

- `parseInt` - Parse string to integer
- `parseFloat` - Parse string to float
- `parseBoolean` - Parse "true"/"false" to boolean
- `parseJSON` - Parse JSON string to object
- `toLowerCase` - Convert to lowercase
- `toUpperCase` - Convert to uppercase
- `trim` - Trim whitespace

### Default Values

Provide fallback values when extraction fails:

```yaml
output:
    optional:
        type: string
        pattern: 'Optional: (.*)'
        required: false
        default: 'not-provided'
```

### Stdout/Stderr Auto-Capture

Script steps automatically capture stdout and stderr:

```yaml
steps:
  - type: script
    id: run-tests
    script: npm test

  - type: script
    id: check-output
    script: echo "Output: ${{ steps.run-tests.outputs.stdout }}"
```

## Conditional Transitions

### Simple Conditions

```yaml
next:
    conditions:
        - when: 'output.exitCode === 0'
          goto: success-step
        - when: 'output.exitCode !== 0'
          goto: error-step
    default: fallback-step
```

### Comparing with Inputs

```yaml
next:
    conditions:
        - when: 'output.count > inputs.threshold'
          goto: high-path
        - when: 'output.count < inputs.threshold'
          goto: low-path
    default: equal-path
```

### Complex Expressions

```yaml
next:
    conditions:
        - when: "task.priority === 'high' && output.severity > 7"
          goto: urgent-action
        - when: "output.status === 'failed' || output.errorCount > 0"
          goto: handle-errors
```

## Retry Logic

Configure automatic retries with backoff:

```yaml
steps:
    - type: script
      id: flaky-operation
      script: ./run-flaky-test.sh
      retry:
          maxAttempts: 3
          backoff: exponential # or 'linear'
          initialDelayMs: 1000
          maxDelayMs: 10000
```

Retry strategies:

- **linear**: Retry with fixed delay between attempts
- **exponential**: Double delay after each failure (1s, 2s, 4s, 8s, ...)

## Model Steps

### Basic Model Step

```yaml
steps:
    - type: model
      id: analyze
      name: Analyze Code
      model: sonnet # or 'haiku' or 'opus'
      prompt: |
          Review this code for bugs:
          ${{ inputs.codeSnippet }}
```

### With Context Files

```yaml
steps:
    - type: model
      id: answer
      model: haiku
      prompt: 'Explain: ${{ inputs.question }}'
      context:
          files:
              - '**/*.md'
              - '**/*.ts'
```

### With Previous Outputs

```yaml
steps:
    - type: model
      id: implement
      model: sonnet
      prompt: 'Implement: ${{ steps.analyze.outputs.approach }}'
      context:
          previousOutputs:
              - analyze
```

## Script Steps

### Working Directory

```yaml
steps:
    - type: script
      id: build
      script: npm run build
      workingDir: ./packages/frontend
```

### Environment Variables

```yaml
steps:
    - type: script
      id: deploy
      script: ./deploy.sh
      env:
          ENVIRONMENT: production
          API_KEY: ${{ inputs.apiKey }}
```

### Capture Control

```yaml
steps:
    - type: script
      id: silent-task
      script: some-command
      captureOutput: false # Don't capture stdout/stderr
```

## Complete Examples

### Example 1: Simple Test Runner

```yaml
id: test-runner
name: Test Runner
inputs:
    testPattern: string

steps:
    - type: script
      id: run-tests
      script: npm test -- ${{ inputs.testPattern }}
      output:
          exitCode:
              type: number
          passed:
              type: boolean
      next:
          conditions:
              - when: 'output.exitCode !== 0'
                goto: notify-failure
          default: notify-success

    - type: script
      id: notify-success
      script: echo "Tests passed!"

    - type: script
      id: notify-failure
      script: echo "Tests failed with code ${{ steps.run-tests.outputs.exitCode }}"
```

### Example 2: Data Processing Pipeline

```yaml
id: data-pipeline
name: Data Processing Pipeline
inputs:
    inputFile: string

steps:
    - type: script
      id: extract
      script: cat ${{ inputs.inputFile }} | wc -l
      output:
          lineCount:
              type: number
              transform: parseInt
      next:
          default: process

    - type: model
      id: process
      model: sonnet
      prompt: 'Process ${{ steps.extract.outputs.lineCount }} lines'
      next:
          default: save

    - type: script
      id: save
      script: echo "${{ steps.process.outputs.result }}" > output.txt
```

## Best Practices

### 1. Use Explicit Contexts

✅ Good:

```yaml
script: echo "${{ inputs.name }}"
script: echo "${{ steps.build.outputs.version }}"
script: echo "${{ task.priority }}"
```

❌ Bad (won't work):

```yaml
script: echo "${{ name }}"          # Missing context
script: echo "${{ build.version }}" # Missing 'steps' and 'outputs'
```

### 2. Shell Escaping

The `${{ }}` syntax prevents conflicts with shell variables:

```yaml
# Flow variable (interpolated before execution)
script: echo "${{ inputs.message }}"

# Shell variable (evaluated by shell)
script: echo "$HOME"

# Both together
script: echo "${{ inputs.prefix }}: $HOME"
```

### 3. Type Safety with Output Extraction

Always specify types and transforms:

```yaml
output:
    count:
        type: number # Declare type
        transform: parseInt # Convert from string

    data:
        type: object
        transform: parseJSON
```

### 4. Conditional Logic

Use conditions for branching logic:

```yaml
next:
    conditions:
        - when: "output.status === 'success'"
          goto: continue
        - when: 'output.retry === true'
          goto: retry-step
    default: error-handler
```

### 5. Error Handling

Always provide error paths:

```yaml
steps:
    - type: script
      id: risky-operation
      script: ./might-fail.sh
      retry:
          maxAttempts: 3
      next:
          conditions:
              - when: 'output.exitCode !== 0'
                goto: handle-error
          default: success

    - type: script
      id: handle-error
      script: echo "Operation failed, cleaning up..."
```

## Troubleshooting

### Variable Not Found

**Error**: `Template render error: Property 'xyz' not found`

**Solution**: Check that:

1. The variable exists in the correct context
2. You're using the right syntax (`inputs`, `steps`, or `task`)
3. For step outputs, the step has completed and defined the output

### Pattern Not Matching

**Error**: `Pattern 'xxx' did not match in output`

**Solution**:

1. Check your regex pattern
2. Verify the actual script output
3. Use `required: false` for optional fields

### Type Conversion Failed

**Error**: `Failed to parse value`

**Solution**:

1. Ensure the output format matches the transform
2. Use appropriate regex to extract clean values
3. Check for extra whitespace or quotes

## Next Steps

- Review [WORKFLOW_SYSTEM_DESIGN.md](WORKFLOW_SYSTEM_DESIGN.md) for architecture details
- See [integration.test.ts](../src/flow/integration.test.ts) for complex examples
- Check [flow-registry.ts](../src/flow/flow-registry.ts) for default flows
