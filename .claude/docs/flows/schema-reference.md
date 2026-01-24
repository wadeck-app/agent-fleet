# Flow Schema Reference

Complete field-by-field documentation for Flow definitions, based on the TypeScript types in `packages/flow-engine/src/types.ts`.

**Table of Contents**

1. [Flow-Level Properties](#flow-level-properties)
2. [Workspace Configuration](#workspace-configuration)
3. [Input Definitions](#input-definitions)
4. [Step Types Overview](#step-types-overview)
5. [Model Steps](#model-steps)
6. [Script Steps](#script-steps)
7. [SubFlow Steps](#subflow-steps)
8. [User Intervention Steps](#user-intervention-steps)
9. [Common Step Properties](#common-step-properties)
10. [Output Extraction](#output-extraction)
11. [Template Syntax](#template-syntax)
12. [Conditional Execution](#conditional-execution)
13. [Feedback Loops](#feedback-loops)
14. [Status Transitions](#status-transitions)
15. [Lifecycle Hooks](#lifecycle-hooks)

---

## Flow-Level Properties

### FlowDefinition

The root object that defines a complete flow.

#### `id`

- **Type**: `string`
- **Required**: Yes
- **Description**: Unique identifier for the flow across the entire system
- **Validation**: Must be unique, kebab-case recommended
- **Example**: `"simple-implement"`, `"test-diamond"`
- **Common Mistakes**: Using duplicate IDs across flows
- **Related Fields**: Referenced by `SubFlowStep.flowId`

#### `version`

- **Type**: `string`
- **Required**: Yes
- **Description**: Semantic version for the flow definition
- **Format**: `"major.minor.patch"` (e.g., `"1.0.0"`)
- **Example**: `"1.0.0"`, `"2.1.3"`
- **Common Mistakes**: Not updating version when changing flow logic
- **Related Fields**: Used for flow metadata and tracking

#### `name`

- **Type**: `string`
- **Required**: Yes
- **Description**: Human-readable display name for the flow
- **Example**: `"Simple Implementation"`, `"Test: Diamond Pattern"`
- **Common Mistakes**: Using technical IDs instead of descriptive names
- **Related Fields**: Displayed in UI alongside `description`

#### `description`

- **Type**: `string`
- **Required**: Yes
- **Description**: Brief explanation of what the flow does
- **Example**: `"Ask Claude to implement something"`, `"Tests fork-join with diamond shape"`
- **Common Mistakes**: Leaving empty or too vague descriptions
- **Related Fields**: Displayed in flow selection UI

#### `workspace`

- **Type**: [`WorkspaceConfig`](#workspace-configuration)
- **Required**: Yes
- **Description**: Workspace requirements and isolation strategy
- **Example**: See [Workspace Configuration](#workspace-configuration)
- **Common Mistakes**: Using `isolated` mode when `shared` would be more efficient
- **Related Fields**: Affects `SubFlowStep.workspaceStrategy`

#### `inputs`

- **Type**: `Record<string, InputSpec>`
- **Required**: Yes (can be empty object `{}`)
- **Description**: Input variables expected from tasks, either shorthand (type string) or extended format
- **Example**:
    ```yaml
    inputs:
        task: string
        number: { type: number, required: true, description: 'Input value' }
        optional: { type: string, default: 'default-value' }
    ```
- **Common Mistakes**: Not declaring inputs used in templates, missing required flags
- **Related Fields**: Referenced via `${{ inputs.variableName }}` in templates

#### `steps`

- **Type**: `FlowStep[]`
- **Required**: Yes (minimum 1 step)
- **Description**: Array of steps to execute in the flow
- **Example**: See [Step Types Overview](#step-types-overview)
- **Common Mistakes**: Circular dependencies, missing `depends` declarations
- **Related Fields**: Steps reference each other via `depends` and `onFailure.goto`

#### `statusTransitions`

- **Type**: [`StatusTransitions`](#status-transitions) (optional)
- **Required**: No
- **Default**: `{ onSuccess: "review", onFailure: "changes_requested" }`
- **Description**: Task status to set when flow completes
- **Example**:
    ```yaml
    statusTransitions:
        onSuccess: approved
        onFailure: todo
    ```
- **Common Mistakes**: Not setting appropriate status for automated flows
- **Related Fields**: Uses `TaskStatus` enum values

#### `hooks`

- **Type**: [`FlowHooks`](#lifecycle-hooks) (optional)
- **Required**: No
- **Description**: Lifecycle commands to execute at flow start/complete/error
- **Example**: See [Lifecycle Hooks](#lifecycle-hooks)
- **Common Mistakes**: Using blocking commands that never complete
- **Related Fields**: All hooks receive flow execution context

---

## Workspace Configuration

### WorkspaceConfig

Defines workspace isolation and Git strategy for flow execution.

#### `mode`

- **Type**: `WorkspaceMode` (`'isolated'` | `'shared'` | `'manual'`)
- **Required**: Yes
- **Description**: Determines workspace isolation and concurrency behavior
- **Valid Values**:
    - `isolated`: Each task gets a fresh workspace, destroyed after completion
    - `shared`: Multiple compatible tasks can share a workspace
    - `manual`: Uses current working directory (for local development/debugging)
- **Example**:
    ```yaml
    workspace:
        mode: isolated # Fresh workspace per task
    ```
- **Common Mistakes**: Using `manual` in production flows, `isolated` when `shared` would be faster
- **Related Fields**: Affects `reusePolicy` behavior

#### `gitStrategy`

- **Type**: `GitStrategy` (`'main-only'` | `'feature-branch'` | `'any'` | `'worktree'`)
- **Required**: Yes
- **Description**: Defines which Git branches can be used for execution
- **Valid Values**:
    - `main-only`: Only execute on main/master branch
    - `feature-branch`: Create and use feature branches
    - `any`: Any branch allowed (for debugging)
    - `worktree`: Use Git worktrees for isolation
- **Example**:
    ```yaml
    workspace:
        mode: isolated
        gitStrategy: feature-branch # Use feature branches
    ```
- **Common Mistakes**: Using `any` in production, not matching strategy to workflow needs
- **Related Fields**: Validated against current Git branch state

#### `reusePolicy`

- **Type**: `ReusePolicy` (`'never'` | `'if-available'` | `'always'`)
- **Required**: Yes
- **Description**: Determines when workspaces can be reused
- **Valid Values**:
    - `never`: Always create new workspace
    - `if-available`: Reuse if compatible workspace exists
    - `always`: Always reuse (for development)
- **Example**:
    ```yaml
    workspace:
        mode: shared
        gitStrategy: main-only
        reusePolicy: if-available # Reuse when possible
    ```
- **Common Mistakes**: Using `never` for all flows (inefficient), `always` in production
- **Related Fields**: Interacts with `mode` and `concurrencyKey`

#### `concurrencyKey`

- **Type**: `string` (optional)
- **Required**: No
- **Description**: Groups compatible workspaces for sharing (when `mode: shared`)
- **Example**:
    ```yaml
    workspace:
        mode: shared
        gitStrategy: main-only
        reusePolicy: if-available
        concurrencyKey: 'frontend-builds' # Group related flows
    ```
- **Common Mistakes**: Not using concurrency keys for resource-intensive flows
- **Related Fields**: Only relevant when `mode: shared`

---

## Input Definitions

### InputSpec

Inputs can be declared in two formats: shorthand (type string) or extended (object with metadata).

#### Shorthand Format

- **Type**: `VariableType` (`'string'` | `'number'` | `'boolean'` | `'object'`)
- **Description**: Simple type-only declaration, input is optional with no default
- **Example**:
    ```yaml
    inputs:
        message: string
        count: number
    ```
- **Default Behavior**: `required: false`, no default value

#### Extended Format (InputDefinition)

##### `type`

- **Type**: `VariableType`
- **Required**: Yes
- **Description**: Type of the input variable
- **Valid Values**: `string`, `number`, `boolean`, `object`
- **Example**: `{ type: string }`

##### `required`

- **Type**: `boolean`
- **Required**: No
- **Default**: `false`
- **Description**: Whether this input must be provided
- **Example**:
    ```yaml
    inputs:
        taskId: { type: string, required: true }
    ```
- **Common Mistakes**: Not marking critical inputs as required

##### `default`

- **Type**: `any`
- **Required**: No
- **Description**: Default value if input is not provided
- **Example**:
    ```yaml
    inputs:
        timeout: { type: number, default: 30 }
        mode: { type: string, default: 'production' }
    ```
- **Common Mistakes**: Providing defaults for required inputs (makes `required` meaningless)

##### `description`

- **Type**: `string`
- **Required**: No
- **Description**: User-facing description for UI tooltips and documentation
- **Example**:
    ```yaml
    inputs:
        feature: { type: string, description: 'Name of the feature to implement' }
    ```
- **Common Mistakes**: Not documenting complex or ambiguous inputs

### Auto-Discovered Inputs

Inputs are automatically discovered from template usage in `prompt`, `script`, `when`, and `output` fields. Both explicit and auto-discovered inputs are merged with source tracking.

**Example**:

```yaml
# This flow will auto-discover 'userName' input
inputs:
    task: string # Explicit
steps:
    - type: model
      id: greet
      name: 'Greet User'
      model: haiku
      prompt: 'Hello ${{ inputs.userName }}, please complete: ${{ inputs.task }}'
      # 'userName' is auto-discovered with source: 'auto-discovered'
```

---

## Step Types Overview

All steps extend `BaseFlowStep` with common properties. Steps are discriminated by the `type` field.

### Step Type Summary

| Type                | Description                  | Use Case                                   |
| ------------------- | ---------------------------- | ------------------------------------------ |
| `model`             | Execute using an AI model    | Code generation, analysis, decision-making |
| `script`            | Execute shell script/command | Build tasks, testing, file operations      |
| `subflow`           | Execute another flow         | Composition, reusable workflows            |
| `user_intervention` | Require user approval/input  | Manual gates, approval workflows           |

---

## Model Steps

### ModelFlowStep

Executes a task using an AI model (Claude).

#### `type`

- **Value**: `'model'`
- **Required**: Yes
- **Description**: Discriminator for model step type

#### `id`

- **Type**: `string`
- **Required**: Yes
- **Description**: Unique step identifier within the flow
- **See**: [Common Step Properties](#common-step-properties)

#### `name`

- **Type**: `string`
- **Required**: Yes
- **Description**: Human-readable step name
- **See**: [Common Step Properties](#common-step-properties)

#### `model`

- **Type**: `ModelType` (`'sonnet'` | `'haiku'` | `'opus'`)
- **Required**: Yes
- **Description**: Which Claude model to use
- **Valid Values**:
    - `haiku`: Fast, cost-effective for simple tasks
    - `sonnet`: Balanced performance and capability
    - `opus`: Most capable, for complex reasoning
- **Example**:
    ```yaml
    - type: model
      id: implement
      name: 'Implement Feature'
      model: sonnet # Use Sonnet for implementation
      prompt: 'Implement the following: ${{ inputs.task }}'
    ```
- **Common Mistakes**: Using Opus for simple tasks, Haiku for complex reasoning

#### `prompt`

- **Type**: `string` (template string)
- **Required**: Yes
- **Description**: Prompt template with variable interpolation support
- **Template Syntax**: Supports `${{ inputs.varName }}`, `${{ steps.stepId.outputs.varName }}`, `${{ task.metadata.key }}`
- **Example**:

    ```yaml
    prompt: |
        Analyze the following task: ${{ inputs.task }}

        Previous analysis: ${{ steps.analyze.outputs.summary }}

        Task Priority: ${{ task.priority }}
    ```

- **Common Mistakes**: Not providing enough context, forgetting to declare dependencies
- **Related Fields**: Variables used must match `depends` declarations

#### Other Properties

See [Common Step Properties](#common-step-properties) for `context`, `output`, `depends`, `when`, `skipOnLoop`, `retry`, `onFailure`, `contract`.

**Complete Example**:

```yaml
- type: model
  id: code-review
  name: 'Review Generated Code'
  model: opus
  depends: [generate-code]
  prompt: |
      Review the following code implementation:
      ${{ steps.generate-code.outputs.implementation }}

      Check for:
      - Correctness
      - Performance
      - Security issues
  output:
      approved: { type: boolean }
      issues: { type: string }
      recommendations: { type: string }
```

---

## Script Steps

### ScriptFlowStep

Executes a shell script or command in the workspace.

#### `type`

- **Value**: `'script'`
- **Required**: Yes
- **Description**: Discriminator for script step type

#### `id`

- **Type**: `string`
- **Required**: Yes
- **Description**: Unique step identifier
- **See**: [Common Step Properties](#common-step-properties)

#### `name`

- **Type**: `string`
- **Required**: Yes
- **Description**: Human-readable step name
- **See**: [Common Step Properties](#common-step-properties)

#### `script`

- **Type**: `string` (template string)
- **Required**: Yes
- **Description**: Shell script or command to execute, supports variable interpolation
- **Template Syntax**: Same as `prompt` (supports `${{ }}` interpolation)
- **Example**:
    ```yaml
    - type: script
      id: build
      name: 'Build Project'
      script: |
          echo "Building version ${{ inputs.version }}"
          npm install
          npm run build
          echo "build_hash=$(git rev-parse HEAD)"
    ```
- **Common Mistakes**: Not handling errors, forgetting to echo output variables
- **Related Fields**: Use `output` to extract values from script output

#### `workingDir`

- **Type**: `string` (optional)
- **Required**: No
- **Default**: Workspace root directory
- **Description**: Working directory for script execution (relative to workspace root)
- **Example**:
    ```yaml
    - type: script
      id: test-frontend
      name: 'Test Frontend'
      script: npm test
      workingDir: packages/web-frontend
    ```
- **Common Mistakes**: Using absolute paths instead of relative paths

#### `env`

- **Type**: `Record<string, string>` (optional)
- **Required**: No
- **Description**: Environment variables to pass to the script
- **Example**:
    ```yaml
    - type: script
      id: deploy
      name: 'Deploy to Production'
      script: ./deploy.sh
      env:
          ENVIRONMENT: production
          API_KEY: ${{ inputs.apiKey }}
          VERSION: ${{ steps.build.outputs.version }}
    ```
- **Common Mistakes**: Hardcoding secrets instead of using inputs

#### `captureOutput`

- **Type**: `boolean` (optional)
- **Required**: No
- **Default**: `true`
- **Description**: Whether to capture stdout/stderr for output extraction
- **Example**:
    ```yaml
    - type: script
      id: log-only
      name: 'Log Message'
      script: echo "Deployment started"
      captureOutput: false # Don't capture, just log
    ```
- **Common Mistakes**: Setting to false when output extraction is needed

#### Other Properties

See [Common Step Properties](#common-step-properties) for `context`, `output`, `depends`, `when`, `skipOnLoop`, `retry`, `onFailure`, `contract`.

**Complete Example**:

```yaml
- type: script
  id: run-tests
  name: 'Run Test Suite'
  depends: [build]
  script: |
      echo "Running tests on build ${{ steps.build.outputs.hash }}"
      npm test -- --coverage
      echo "tests_passed=$(jq -r '.numPassedTests' coverage/summary.json)"
      echo "coverage=$(jq -r '.total.lines.pct' coverage/summary.json)"
  output:
      tests_passed: { type: number, pattern: 'tests_passed=(.*)' }
      coverage: { type: number, pattern: 'coverage=(.*)' }
  onFailure:
      goto: build
      maxIterations: 2
```

---

## SubFlow Steps

### SubFlowStep

Executes another flow as a sub-workflow (flow composition).

#### `type`

- **Value**: `'subflow'`
- **Required**: Yes
- **Description**: Discriminator for subflow step type

#### `id`

- **Type**: `string`
- **Required**: Yes
- **Description**: Unique step identifier
- **See**: [Common Step Properties](#common-step-properties)

#### `name`

- **Type**: `string`
- **Required**: Yes
- **Description**: Human-readable step name
- **See**: [Common Step Properties](#common-step-properties)

#### `flowId`

- **Type**: `string`
- **Required**: Yes
- **Description**: ID of the flow to execute (must exist in registry)
- **Example**:
    ```yaml
    - type: subflow
      id: run-tests
      name: 'Run Test Flow'
      flowId: test-suite # References another flow
      inputs:
          target: ${{ inputs.component }}
    ```
- **Common Mistakes**: Referencing non-existent flows, circular dependencies
- **Related Fields**: Must match a valid `FlowDefinition.id`

#### `inputs`

- **Type**: `Record<string, string>` (template strings)
- **Required**: Yes (can be empty object `{}`)
- **Description**: Template inputs to pass to the subflow
- **Template Syntax**: Same as other templates, supports `${{ }}` interpolation
- **Example**:
    ```yaml
    inputs:
        message: '${{ inputs.greeting }}'
        count: '${{ steps.calculate.outputs.value }}'
        metadata: '${{ task.projectName }}'
    ```
- **Common Mistakes**: Not matching subflow's required inputs, type mismatches

#### `workspaceStrategy`

- **Type**: `WorkspaceStrategy` (`'inherit'` | `'separate'`)
- **Required**: No
- **Default**: `'inherit'`
- **Description**: Whether subflow uses parent's workspace or creates separate one
- **Valid Values**:
    - `inherit`: Use parent flow's workspace (default, most efficient)
    - `separate`: Create isolated workspace for subflow
- **Example**:
    ```yaml
    - type: subflow
      id: dangerous-operation
      name: 'Run in Isolated Workspace'
      flowId: experimental-task
      workspaceStrategy: separate # Isolate potential damage
      inputs:
          task: ${{ inputs.experimentalFeature }}
    ```
- **Common Mistakes**: Using `separate` unnecessarily (slower)

#### `output`

- **Type**: `SubFlowStepOutput` (template mapping)
- **Required**: No
- **Description**: Maps subflow outputs to parent flow variables using template syntax
- **Template Syntax**: Extract using `${{ steps.substepId.outputs.varName }}`
- **Example**:
    ```yaml
    output:
        result: '${{ steps.echo.outputs.result }}'
        status: '${{ steps.validate.outputs.status }}'
        # Can also use OutputVariableConfig format:
        parsed: { type: number, from: '${{ steps.calc.outputs.value }}', transform: 'parseInt' }
    ```
- **Common Mistakes**: Referencing non-existent subflow step outputs

#### `allowRecursion`

- **Type**: `boolean` (optional)
- **Required**: No
- **Default**: `false`
- **Description**: Allow flow to call itself recursively (must be explicit for safety)
- **Example**:
    ```yaml
    - type: subflow
      id: recurse
      name: 'Recursive Call'
      flowId: test-recursive-countdown # Same flow
      allowRecursion: true # MUST be explicit
      when: "${{ steps.calculate.outputs.continue === 'true' }}"
      inputs:
          count: '${{ steps.calculate.outputs.next }}'
    ```
- **Common Mistakes**: Forgetting exit condition (`when` clause), infinite recursion

#### Other Properties

See [Common Step Properties](#common-step-properties) for `context`, `depends`, `when`, `skipOnLoop`, `retry`, `onFailure`, `contract`.

**Complete Example**:

```yaml
- type: subflow
  id: deploy-component
  name: 'Deploy Using Standard Flow'
  flowId: standard-deploy
  depends: [build, test]
  workspaceStrategy: inherit
  inputs:
      component: '${{ inputs.componentName }}'
      version: '${{ steps.build.outputs.version }}'
      testResults: '${{ steps.test.outputs.summary }}'
  output:
      deploymentUrl: '${{ steps.publish.outputs.url }}'
      deploymentStatus: '${{ steps.publish.outputs.status }}'
```

---

## User Intervention Steps

### UserInterventionStep

Pauses flow execution to request user approval, input, or choice.

#### `type`

- **Value**: `'user_intervention'`
- **Required**: Yes
- **Description**: Discriminator for user intervention step type

#### `id`

- **Type**: `string`
- **Required**: Yes
- **Description**: Unique step identifier
- **See**: [Common Step Properties](#common-step-properties)

#### `name`

- **Type**: `string`
- **Required**: Yes
- **Description**: Human-readable step name
- **See**: [Common Step Properties](#common-step-properties)

#### `interventionType`

- **Type**: `'approval'` | `'question'` | `'choice'`
- **Required**: Yes
- **Description**: Type of user intervention required
- **Valid Values**:
    - `approval`: Binary approve/reject decision
    - `question`: Free-form or typed user input
    - `choice`: Select from predefined options
- **Example**: See type-specific configurations below

#### `blocking`

- **Type**: `boolean` (optional)
- **Required**: No
- **Default**: `true`
- **Description**: Whether to block flow execution until user responds
- **Example**:
    ```yaml
    - type: user_intervention
      id: notify
      name: 'Notify Admin'
      interventionType: approval
      blocking: false # Don't wait for response
      approval:
          title: 'Review deployment logs'
    ```
- **Common Mistakes**: Using `blocking: false` for critical approvals

#### `timeout`

- **Type**: Object (optional)
- **Required**: No
- **Description**: Timeout configuration for intervention
- **Properties**:
    - `minutes` (number, required): Timeout duration
    - `onTimeout` (`'fail'` | `'continue'` | `'default'`, required): Action on timeout
    - `defaultValue` (any, optional): Value to use when `onTimeout: 'default'`
- **Example**:
    ```yaml
    timeout:
        minutes: 60
        onTimeout: default
        defaultValue: false # Auto-reject after 1 hour
    ```
- **Common Mistakes**: Not providing `defaultValue` when `onTimeout: 'default'`

#### `approval` (for `interventionType: approval`)

- **Type**: Object (required when `interventionType: approval`)
- **Properties**:
    - `title` (string, required): Title shown to user
    - `description` (string, optional): Detailed description/context
    - `allowReject` (boolean, optional, default: `false`): Whether user can reject
- **Example**:
    ```yaml
    - type: user_intervention
      id: approve-deploy
      name: 'Approve Production Deployment'
      interventionType: approval
      approval:
          title: 'Approve Deployment to Production'
          description: 'Data hash: ${{ steps.prepare.outputs.hash }}. Review and approve.'
          allowReject: true
    ```

#### `question` (for `interventionType: question`)

- **Type**: Object (required when `interventionType: question`)
- **Properties**:
    - `question` (string, required): Question to ask user
    - `responseType` (`'text'` | `'number'` | `'boolean'`, required): Expected response type
    - `validation` (ValidationRule[], optional): Validation rules for response
- **Example**:
    ```yaml
    - type: user_intervention
      id: ask-version
      name: 'Ask Target Version'
      interventionType: question
      question:
          question: 'What version should we deploy?'
          responseType: text
          validation:
              - type: pattern
                value: '^[0-9]+\.[0-9]+\.[0-9]+$'
                message: 'Must be semantic version (e.g., 1.2.3)'
    ```

#### `choice` (for `interventionType: choice`)

- **Type**: Object (required when `interventionType: choice`)
- **Properties**:
    - `question` (string, required): Question/prompt for choice
    - `options` (array of objects, required): Available choices
        - `id` (string): Option identifier
        - `label` (string): Display label
        - `description` (string, optional): Option description
    - `allowMultiple` (boolean, optional, default: `false`): Allow multiple selections
- **Example**:
    ```yaml
    - type: user_intervention
      id: select-env
      name: 'Select Deployment Environment'
      interventionType: choice
      choice:
          question: 'Which environment should we deploy to?'
          options:
              - id: staging
                label: 'Staging'
                description: 'Deploy to staging environment'
              - id: production
                label: 'Production'
                description: 'Deploy to production (requires approval)'
          allowMultiple: false
    ```

#### `output`

- **Type**: `StepOutput`
- **Required**: Recommended (to capture user response)
- **Description**: Extract values from intervention response using `from` field
- **Available Fields**:
    - `intervention.approved` (boolean): Whether approved (approval type)
    - `intervention.userResponse` (string): User's raw response
    - `intervention.comment` (string): Optional comment from user
    - `intervention.answeredBy` (string): User ID who answered
    - `intervention.answeredAt` (string): Timestamp of response
- **Example**:
    ```yaml
    output:
        approved: { type: boolean, from: 'intervention.approved' }
        userResponse: { type: string, from: 'intervention.userResponse' }
        comment: { type: string, from: 'intervention.comment' }
        answeredBy: { type: string, from: 'intervention.answeredBy' }
    ```
- **Common Mistakes**: Not using `from` field for extraction, using `pattern` instead

#### Other Properties

See [Common Step Properties](#common-step-properties) for `context`, `depends`, `when`, `skipOnLoop`, `retry`, `onFailure`, `contract`.

**Complete Example**:

```yaml
- type: user_intervention
  id: approval
  name: 'Approve Deployment'
  interventionType: approval
  blocking: true
  depends: [prepare]
  timeout:
      minutes: 120
      onTimeout: fail
  approval:
      title: 'Approve Deployment to Production'
      description: 'Version: ${{ steps.prepare.outputs.version }}. Please review.'
      allowReject: true
  output:
      approved: { type: boolean, from: 'intervention.approved' }
      comment: { type: string, from: 'intervention.comment', required: false }
      answeredBy: { type: string, from: 'intervention.answeredBy' }
  onFailure:
      goto: prepare
      maxIterations: 3
```

---

## Common Step Properties

Properties shared by all step types (part of `BaseFlowStep`).

### `id`

- **Type**: `string`
- **Required**: Yes
- **Description**: Unique identifier within the flow
- **Validation**: Must be unique within flow, kebab-case recommended
- **Example**: `"implement"`, `"run-tests"`, `"deploy-prod"`
- **Common Mistakes**: Duplicate IDs, generic names like `"step1"`
- **Related Fields**: Referenced by `depends`, `onFailure.goto`, output templates

### `name`

- **Type**: `string`
- **Required**: Yes
- **Description**: Human-readable name for UI display and logs
- **Example**: `"Implement Feature"`, `"Run Test Suite"`
- **Common Mistakes**: Using same as ID instead of descriptive name

### `depends`

- **Type**: `string[]` (array of step IDs, optional)
- **Required**: No
- **Default**: `[]` (no dependencies)
- **Description**: Step IDs that must complete successfully before this step runs
- **Example**:
    ```yaml
    - type: script
      id: deploy
      name: 'Deploy'
      depends: [build, test] # Wait for both
      script: ./deploy.sh
    ```
- **Common Mistakes**: Forgetting to declare dependencies when using step outputs
- **Related Fields**: Must match valid step IDs, creates DAG edges

### `when`

- **Type**: `string` (JavaScript expression, optional)
- **Required**: No
- **Description**: Conditional expression evaluated to boolean; step skips if false
- **Template Syntax**: Supports `${{ }}` interpolation for context access
- **Available Context**: `inputs.*`, `steps.*.outputs.*`, `task.*`
- **Example**:
    ```yaml
    - type: script
      id: deploy-prod
      name: 'Deploy to Production'
      when: '${{ steps.approval.outputs.approved === true }}'
      depends: [approval]
      script: ./deploy-prod.sh
    ```
- **Common Mistakes**: Syntax errors, referencing undefined variables
- **Related Fields**: Evaluated after `depends` completion

### `skipOnLoop`

- **Type**: `boolean` (optional)
- **Required**: No
- **Default**: `false`
- **Description**: Skip this step when flow loops back (via `onFailure.goto`)
- **Use Case**: One-time setup steps that shouldn't repeat in feedback loops
- **Example**:

    ```yaml
    - type: script
      id: setup
      name: 'One-Time Setup'
      skipOnLoop: true # Only run first time
      script: ./setup-environment.sh

    - type: script
      id: test
      name: 'Run Tests'
      depends: [setup]
      onFailure:
          goto: implement # Loop back, 'setup' will be skipped
      script: npm test
    ```

- **Common Mistakes**: Skipping critical validation steps
- **Related Fields**: Only relevant when `onFailure.goto` creates loops

### `retry`

- **Type**: [`RetryConfig`](#retryconfig) (optional)
- **Required**: No
- **Description**: Automatic retry configuration for transient failures
- **Example**:
    ```yaml
    retry:
        maxAttempts: 3
        backoff: exponential
    ```
- **Common Mistakes**: Retrying non-idempotent operations
- **Related Fields**: Separate from `onFailure` feedback loops

### `onFailure`

- **Type**: [`FailureConfig`](#failureconfig) (optional)
- **Required**: No
- **Description**: Feedback loop configuration using `goto` to jump back on failure
- **Example**: See [Feedback Loops](#feedback-loops)
- **Common Mistakes**: Infinite loops without proper exit conditions
- **Related Fields**: Creates cycles in DAG, tracks iterations

### `context`

- **Type**: [`StepContext`](#stepcontext) (optional)
- **Required**: No
- **Description**: Additional context to provide to the step (files, previous outputs, task metadata)
- **Example**:
    ```yaml
    context:
        files: ['src/**/*.ts', 'tests/**/*.test.ts']
        previousOutputs: [analyze, lint]
        taskMetadata: [projectName, priority]
    ```
- **Common Mistakes**: Including too much context (token bloat)

### `output`

- **Type**: [`StepOutput`](#output-extraction)
- **Required**: No
- **Description**: Define variables to extract from step execution
- **Example**: See [Output Extraction](#output-extraction)
- **Common Mistakes**: Not defining outputs used by later steps

### `contract`

- **Type**: [`StepContract`](#stepcontract) (optional)
- **Required**: No
- **Description**: Input/output validation rules (pre/post-process contracts)
- **Example**:
    ```yaml
    contract:
        preProcess:
            required: [version, environment]
            validateInputs:
                version:
                    - type: pattern
                      value: '^[0-9]+\.[0-9]+\.[0-9]+$'
        postProcess:
            required: [deploymentUrl]
            validateOutputs:
                deploymentUrl:
                    - type: pattern
                      value: '^https://'
    ```
- **Common Mistakes**: Over-validating, not providing clear error messages

---

## Output Extraction

### StepOutput

Map of variable names to extraction configurations.

**Type**: `Record<string, OutputVariableConfig>`

### OutputVariableConfig

Configuration for extracting a single output variable.

#### `type`

- **Type**: `VariableType` (`'string'` | `'number'` | `'boolean'` | `'object'`)
- **Required**: Yes
- **Description**: Expected type of extracted value
- **Example**: `{ type: string }`

#### `pattern`

- **Type**: `string` (regex pattern, optional)
- **Required**: No (but common for script/model steps)
- **Description**: Regex with capture group for extracting value from text output
- **Format**: Must contain exactly one capture group `(.*)`
- **Example**:
    ```yaml
    output:
        version: { type: string, pattern: 'version=(.*)' }
        count: { type: number, pattern: 'tests_passed=(\d+)' }
        status: { type: boolean, pattern: 'success=(true|false)' }
    ```
- **Common Mistakes**: Missing capture group, multiple capture groups, wrong escaping
- **Related Fields**: Not used with `from` (for user_intervention steps)

#### `from`

- **Type**: `string` (path expression, optional)
- **Required**: No (but required for user_intervention steps)
- **Description**: Source path for extraction from structured data
- **Format**: Dot-notation path (e.g., `'intervention.approved'`)
- **Available Paths** (user_intervention):
    - `intervention.approved` (boolean)
    - `intervention.userResponse` (string)
    - `intervention.comment` (string)
    - `intervention.answeredBy` (string)
    - `intervention.answeredAt` (string)
- **Example**:
    ```yaml
    output:
        approved: { type: boolean, from: 'intervention.approved' }
        comment: { type: string, from: 'intervention.comment' }
    ```
- **Common Mistakes**: Using `pattern` instead of `from` for user_intervention
- **Related Fields**: Mutually exclusive with `pattern`

#### `required`

- **Type**: `boolean` (optional)
- **Required**: No
- **Default**: `false`
- **Description**: Whether extraction must succeed (step fails if missing)
- **Example**:
    ```yaml
    output:
        version: { type: string, pattern: 'version=(.*)', required: true }
        notes: { type: string, pattern: 'notes=(.*)', required: false }
    ```
- **Common Mistakes**: Not marking critical outputs as required

#### `transform`

- **Type**: `TransformFunction` | `string` (optional)
- **Required**: No
- **Description**: Transform function to apply after extraction
- **Valid Values**: `parseJSON`, `parseYAML`, `parseInt`, `parseFloat`, `parseBoolean`, `trim`, `toLowerCase`, `toUpperCase`, `split`
- **Example**:
    ```yaml
    output:
        config: { type: object, pattern: 'config=(.*)', transform: parseJSON }
        count: { type: number, pattern: 'count=(.*)', transform: parseInt }
        tags: { type: string, pattern: 'tags=(.*)', transform: split }
    ```
- **Common Mistakes**: Wrong transform for type, forgetting to transform JSON strings

#### `default`

- **Type**: `any` (optional)
- **Required**: No
- **Description**: Default value if extraction fails (only for non-required fields)
- **Example**:
    ```yaml
    output:
        timeout: { type: number, pattern: 'timeout=(\d+)', default: 30 }
        enabled: { type: boolean, pattern: 'enabled=(.*)', default: true }
    ```
- **Common Mistakes**: Providing default for required fields (conflicts with `required`)

**Complete Example**:

```yaml
output:
    # Script output extraction with pattern
    version: { type: string, pattern: 'version=(.*)', required: true }
    buildHash: { type: string, pattern: 'hash=([a-f0-9]+)', required: true }
    testsPassed: { type: number, pattern: 'tests_passed=(\d+)', transform: parseInt }

    # User intervention extraction with from
    approved: { type: boolean, from: 'intervention.approved', required: true }
    comment: { type: string, from: 'intervention.comment', default: '' }

    # Complex extraction with transform
    metadata: { type: object, pattern: 'metadata=(.*)', transform: parseJSON }
```

---

## Template Syntax

Templates use `${{ }}` syntax for variable interpolation.

### Template Contexts

Templates can access three contexts:

#### 1. Inputs

Access flow inputs declared in `inputs` section.

**Syntax**: `${{ inputs.variableName }}`

**Example**:

```yaml
inputs:
    task: string
    version: { type: string, default: '1.0.0' }

steps:
    - type: model
      id: implement
      name: 'Implement'
      model: sonnet
      prompt: 'Implement ${{ inputs.task }} for version ${{ inputs.version }}'
```

#### 2. Step Outputs

Access outputs from previously completed steps.

**Syntax**: `${{ steps.stepId.outputs.variableName }}`

**Example**:

```yaml
steps:
    - type: script
      id: build
      name: 'Build'
      script: |
          npm run build
          echo "hash=$(git rev-parse HEAD)"
      output:
          hash: { type: string, pattern: 'hash=(.*)' }

    - type: model
      id: document
      name: 'Document Build'
      depends: [build]
      prompt: 'Document build with hash: ${{ steps.build.outputs.hash }}'
```

#### 3. Task Metadata

Access task-level metadata fields.

**Syntax**: `${{ task.metadataKey }}`

**Example**:

```yaml
steps:
    - type: model
      id: prioritize
      name: 'Prioritize'
      model: haiku
      prompt: |
          Task: ${{ inputs.task }}
          Priority: ${{ task.priority }}
          Project: ${{ task.projectName }}
```

### Template Locations

Templates can be used in:

- Step `prompt` (ModelFlowStep)
- Step `script` (ScriptFlowStep)
- Step `inputs` (SubFlowStep)
- Step `env` (ScriptFlowStep)
- Step `when` (conditional execution)
- Step `approval.description` (UserInterventionStep)
- Output `from` paths (when using templates in SubFlowStep)

### Common Mistakes

1. **Missing Dependencies**: Using `${{ steps.stepId.outputs.var }}` without `depends: [stepId]`
2. **Typos**: Misspelling variable names (`${{ intpus.task }}` instead of `${{ inputs.task }}`)
3. **Type Mismatches**: Interpolating objects directly without transforms
4. **Undefined Variables**: Referencing variables not declared in inputs or outputs

---

## Conditional Execution

### The `when` Clause

Steps can be conditionally executed using JavaScript expressions.

#### Syntax

```yaml
when: '${{ expression }}'
```

Expression is evaluated to boolean:

- `true`: Step executes
- `false`: Step is skipped

#### Available Context

Same as templates: `inputs.*`, `steps.*.outputs.*`, `task.*`

#### Expression Language

Standard JavaScript boolean expressions:

- **Equality**: `===`, `!==`
- **Comparison**: `>`, `<`, `>=`, `<=`
- **Logical**: `&&`, `||`, `!`
- **Ternary**: `condition ? true : false`

#### Examples

**Simple Boolean Check**:

```yaml
- type: script
  id: deploy-prod
  name: 'Deploy to Production'
  when: '${{ steps.approval.outputs.approved === true }}'
  depends: [approval]
  script: ./deploy.sh
```

**Numeric Comparison**:

```yaml
- type: model
  id: optimize
  name: 'Optimize Performance'
  when: '${{ steps.test.outputs.coverage < 80 }}'
  depends: [test]
  model: sonnet
  prompt: 'Optimize test coverage (currently ${{ steps.test.outputs.coverage }}%)'
```

**String Comparison**:

```yaml
- type: script
  id: deploy-staging
  name: 'Deploy to Staging'
  when: "${{ inputs.environment === 'staging' }}"
  script: ./deploy-staging.sh
```

**Multiple Conditions**:

```yaml
- type: script
  id: alert-failure
  name: 'Alert on Test Failure'
  when: "${{ steps.test.outputs.passed === false && task.priority === 'high' }}"
  depends: [test]
  script: ./send-alert.sh
```

**Existence Check**:

```yaml
- type: model
  id: handle-error
  name: 'Handle Error Case'
  when: '${{ steps.build.outputs.error !== undefined }}'
  depends: [build]
  model: haiku
  prompt: 'Handle error: ${{ steps.build.outputs.error }}'
```

### Conditional Branching Pattern

Create mutually exclusive paths:

```yaml
steps:
    - type: script
      id: check
      name: 'Check Condition'
      script: |
          if [ ${{ inputs.value }} -gt 50 ]; then
            echo "path=high"
          else
            echo "path=low"
          fi
      output:
          path: { type: string, pattern: 'path=(.*)' }

    - type: script
      id: high-path
      name: 'High Value Path'
      when: "${{ steps.check.outputs.path === 'high' }}"
      depends: [check]
      script: ./handle-high.sh

    - type: script
      id: low-path
      name: 'Low Value Path'
      when: "${{ steps.check.outputs.path === 'low' }}"
      depends: [check]
      script: ./handle-low.sh
```

### Common Mistakes

1. **Missing Quotes**: `when: ${{ expr }}` instead of `when: "${{ expr }}"`
2. **Wrong Operators**: Using `=` instead of `===`
3. **Undefined References**: Checking variables that might not exist
4. **Type Coercion**: Comparing different types without explicit conversion

---

## Feedback Loops

### FailureConfig

Enables feedback loops using `onFailure.goto` to jump back to previous steps.

#### `goto`

- **Type**: `string` (step ID, optional)
- **Required**: No (but required for loops)
- **Description**: Step ID to jump back to when current step fails
- **Creates**: Feedback loop in the flow DAG
- **Example**:

    ```yaml
    - type: script
      id: implement
      name: 'Implement'
      script: ./implement.sh

    - type: script
      id: test
      name: 'Test'
      depends: [implement]
      onFailure:
          goto: implement # Loop back on test failure
      script: npm test
    ```

- **Common Mistakes**: Creating infinite loops, pointing to non-existent steps
- **Related Fields**: Target step must exist and be reachable

#### `maxIterations`

- **Type**: `number` (optional)
- **Required**: No
- **Default**: `3`
- **Description**: Maximum times this step can execute before failing permanently
- **Purpose**: Prevent infinite loops
- **Example**:
    ```yaml
    onFailure:
        goto: implement
        maxIterations: 5 # Allow up to 5 attempts
    ```
- **Common Mistakes**: Setting too low (prevents useful retries), too high (wastes resources)

#### `resetOnSuccess`

- **Type**: `boolean` (optional)
- **Required**: No
- **Default**: `false`
- **Description**: Reset iteration counter when target step succeeds
- **Use Case**: Multi-step loops where intermediate failures should reset count
- **Example**:

    ```yaml
    - type: script
      id: implement
      name: 'Implement'
      script: ./implement.sh

    - type: script
      id: review
      name: 'Review'
      depends: [implement]
      onFailure:
          goto: implement
          maxIterations: 3
          resetOnSuccess: true # Reset count if 'implement' succeeds
      script: ./review.sh
    ```

#### `addComment`

- **Type**: `string` (optional)
- **Required**: No
- **Description**: Auto-comment to add when loop is triggered (Phase 4 feature)
- **Example**:
    ```yaml
    onFailure:
        goto: implement
        addComment: 'Tests failed, looping back for fixes (attempt ${{ meta.iterations.test }})'
    ```

### Loop Metadata

Available in execution context via `meta` object:

- `meta.iterations.stepId`: Number of times each step has executed
- `meta.totalLoops`: Total number of loops triggered
- `meta.inLoop`: Boolean indicating if currently in a loop

**Example Usage**:

```yaml
- type: model
  id: analyze-loop
  name: 'Analyze Loop State'
  model: haiku
  prompt: |
      Current iteration of 'test' step: ${{ meta.iterations.test }}
      Total loops in flow: ${{ meta.totalLoops }}
      Currently in loop: ${{ meta.inLoop }}
```

### Loop Patterns

#### Basic Test-Fix Loop

```yaml
steps:
    - type: script
      id: implement
      name: 'Implement Feature'
      script: ./implement.sh

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
      depends: [test] # Only runs after test passes
      script: ./deploy.sh
```

#### Multi-Review with Selective Skip

```yaml
steps:
    - type: script
      id: implement
      name: 'Implement'
      script: ./implement.sh

    # One-time setup review (skip on loop)
    - type: script
      id: review-quality
      name: 'Quality Review'
      depends: [implement]
      skipOnLoop: true # Only first time
      script: ./review-quality.sh

    # Repeated security review
    - type: script
      id: review-security
      name: 'Security Review'
      depends: [implement]
      onFailure:
          goto: implement
          maxIterations: 2
          resetOnSuccess: true
      script: ./review-security.sh

    - type: script
      id: deploy
      name: 'Deploy'
      depends: [review-quality, review-security]
      script: ./deploy.sh
```

#### Recursive Subflow with Exit Condition

```yaml
steps:
    - type: script
      id: calculate
      name: 'Calculate Next'
      script: |
          next=$(( ${{ inputs.count }} - 1 ))
          if [ $next -ge 0 ]; then
            echo "continue=true"
            echo "next=$next"
          else
            echo "continue=false"
          fi
      output:
          continue: { type: string, pattern: 'continue=(.*)' }
          next: { type: string, pattern: 'next=(.*)' }

    - type: subflow
      id: recurse
      name: 'Recursive Call'
      flowId: countdown # Same flow
      allowRecursion: true
      when: "${{ steps.calculate.outputs.continue === 'true' }}"
      depends: [calculate]
      inputs:
          count: '${{ steps.calculate.outputs.next }}'
```

---

## Status Transitions

### StatusTransitions

Controls task status updates when flow completes.

#### `onSuccess`

- **Type**: `TaskStatus`
- **Required**: Yes
- **Default**: `"review"`
- **Description**: Status to set when flow completes successfully
- **Valid Values**: Any `TaskStatus` enum value (e.g., `approved`, `review`, `done`)
- **Example**:
    ```yaml
    statusTransitions:
        onSuccess: approved # Auto-approve on success
        onFailure: changes_requested
    ```

#### `onFailure`

- **Type**: `TaskStatus`
- **Required**: Yes
- **Default**: `"changes_requested"`
- **Description**: Status to set when flow fails
- **Valid Values**: Any `TaskStatus` enum value (e.g., `todo`, `changes_requested`, `failed`)
- **Example**:
    ```yaml
    statusTransitions:
        onSuccess: review
        onFailure: todo # Return to todo on failure
    ```

### Common Patterns

**Automated Deployment Flow**:

```yaml
statusTransitions:
    onSuccess: approved
    onFailure: changes_requested
```

**Manual Review Flow**:

```yaml
statusTransitions:
    onSuccess: review # Requires manual review
    onFailure: changes_requested
```

**Debug/Test Flow**:

```yaml
statusTransitions:
    onSuccess: approved
    onFailure: todo
```

---

## Lifecycle Hooks

### FlowHooks

Commands to execute at flow lifecycle events.

#### `onStart`

- **Type**: `string` (shell command, optional)
- **Required**: No
- **Description**: Command executed when flow starts (before any steps)
- **Example**:
    ```yaml
    hooks:
        onStart: 'echo "Flow started at $(date)"'
    ```
- **Common Mistakes**: Using blocking commands, commands that might fail

#### `onComplete`

- **Type**: `string` (shell command, optional)
- **Required**: No
- **Description**: Command executed when flow completes successfully (after all steps)
- **Example**:
    ```yaml
    hooks:
        onComplete: |
            echo "Flow completed successfully"
            ./send-notification.sh "Success"
    ```

#### `onError`

- **Type**: `string` (shell command, optional)
- **Required**: No
- **Description**: Command executed when flow encounters an error
- **Example**:
    ```yaml
    hooks:
        onError: |
            echo "Flow failed: $ERROR_MESSAGE"
            ./cleanup.sh
            ./send-alert.sh "Flow failed"
    ```

**Complete Example**:

```yaml
hooks:
    onStart: |
        echo "Starting flow for task: ${{ task.id }}"
        ./setup-logging.sh

    onComplete: |
        echo "Flow completed successfully"
        ./cleanup.sh
        ./notify-success.sh

    onError: |
        echo "Flow failed with error"
        ./rollback.sh
        ./notify-failure.sh
```

### Available Context in Hooks

Hooks have access to:

- Environment variables for task context
- Flow inputs via environment variables
- Step outputs (in `onComplete` and `onError`)

---

## Additional Types

### RetryConfig

Automatic retry configuration for transient failures.

```typescript
{
	maxAttempts: number; // Max retry attempts
	backoff: 'linear' | 'exponential'; // Backoff strategy
}
```

**Example**:

```yaml
retry:
    maxAttempts: 3
    backoff: exponential
```

### StepContext

Additional context to provide to steps.

```typescript
{
  files?: string[];  // Glob patterns for files to include
  previousOutputs?: string[];  // Step IDs whose outputs to include
  taskMetadata?: string[];  // Task metadata keys to include
}
```

**Example**:

```yaml
context:
    files: ['src/**/*.ts', 'tests/**/*.test.ts']
    previousOutputs: [analyze, lint]
    taskMetadata: [projectName, priority, assignee]
```

### StepContract

Input/output validation rules.

```typescript
{
  preProcess?: {
    required?: string[];  // Required input variables
    validateInputs?: Record<string, ValidationRule[]>;
  };
  postProcess?: {
    required?: string[];  // Required output variables
    validateOutputs?: Record<string, ValidationRule[]>;
  };
}
```

**Example**:

```yaml
contract:
    preProcess:
        required: [version, environment]
        validateInputs:
            version:
                - type: pattern
                  value: '^[0-9]+\.[0-9]+\.[0-9]+$'
                  message: 'Must be semantic version'
    postProcess:
        required: [deploymentUrl, status]
        validateOutputs:
            status:
                - type: enum
                  value: ['success', 'failed', 'pending']
```

### ValidationRule

Validation rule configuration.

```typescript
{
  type: 'required' | 'pattern' | 'min' | 'max' | 'minLength' | 'maxLength' | 'enum' | 'custom';
  value?: any;  // Rule-specific value
  message?: string;  // Custom error message
}
```

**Examples**:

```yaml
# Pattern validation
- type: pattern
  value: '^[a-z0-9-]+$'
  message: 'Must be lowercase alphanumeric with hyphens'

# Range validation
- type: min
  value: 1
  message: 'Must be at least 1'
- type: max
  value: 100
  message: 'Must be at most 100'

# Length validation
- type: minLength
  value: 3
- type: maxLength
  value: 50

# Enum validation
- type: enum
  value: ['staging', 'production']
  message: "Must be 'staging' or 'production'"
```

---

## Summary

This reference covers all fields in the Flow schema based on TypeScript types. For practical examples, see:

- **Quick Start**: `.agent-fleet/flows.yml` for real-world flow examples
- **Validation Examples**: Search for `validation-error-*` and `validation-correct-*` flows in `flows.yml`
- **Pattern Examples**: Search for `test-diamond`, `test-fork`, `test-loop`, `data-*` flows

For questions about specific use cases, refer to the Quick Start Guide or examine existing flows in the repository.
