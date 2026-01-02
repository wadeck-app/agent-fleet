# User Intervention Step Outputs

## Overview

User intervention steps follow the same **declarative, no-magic** pattern as all other step types (script, model, subflow). Outputs must be explicitly declared in the step configuration using the `output:` field.

## Available Output Variables

When a user responds to an intervention, the following variables are available in the step's context:

### Raw Values

| Variable     | Type                 | Description                                                |
| ------------ | -------------------- | ---------------------------------------------------------- |
| `value`      | boolean/string/array | The raw response value (type depends on intervention type) |
| `comment`    | string \| undefined  | Optional comment provided by the user                      |
| `answeredBy` | string               | Username/ID of the person who answered                     |
| `answeredAt` | string               | ISO timestamp when the intervention was answered           |

### Type-Specific Aliases

| Variable       | Type    | Best For          | Description                             |
| -------------- | ------- | ----------------- | --------------------------------------- |
| `userResponse` | any     | All types         | Generic alias for `value`               |
| `approved`     | boolean | Approval          | `true` if approved, `false` if rejected |
| `rejected`     | boolean | Approval          | `true` if rejected, `false` if approved |
| `answer`       | any     | Question          | The answer provided by the user         |
| `choice`       | any     | Choice (single)   | The selected choice ID                  |
| `choice`       | array   | Choice (multiple) | Array of selected choice IDs            |

## How to Use

### Declarative Output Mapping

Unlike magic "auto-generated" outputs, you **must explicitly declare** which outputs you want to expose:

```yaml
- type: user_intervention
  id: approval
  interventionType: approval
  approval:
      title: 'Approve Deployment'
      description: 'Review and approve this deployment'
  output:
      # Declare which outputs you want
      approved: { type: boolean }
      comment: { type: string }
      answeredBy: { type: string }
```

### Using Outputs in Subsequent Steps

Reference the declared outputs using the standard template syntax:

```yaml
- type: script
  id: deploy
  depends: [approval]
  script: |
      echo "User decision: ${{ steps.approval.outputs.userResponse }}"
      echo "Comment: ${{ steps.approval.outputs.comment }}"
      echo "Answered by: ${{ steps.approval.outputs.answeredBy }}"
```

## Examples

### Example 1: Approval Step (Minimal)

```yaml
- type: user_intervention
  id: approval
  interventionType: approval
  approval:
      title: 'Approve Changes'
  output:
      approved: { type: boolean } # Only expose what you need
```

### Example 2: Approval Step (Complete)

```yaml
- type: user_intervention
  id: approval
  interventionType: approval
  approval:
      title: 'Approve Deployment'
      description: 'Deploy version ${{ inputs.version }} to production?'
      allowReject: true
  output:
      approved: { type: boolean } # true if approved, false if rejected
      rejected: { type: boolean } # opposite of approved
      userResponse: { type: string } # "true" or "false" as string
      comment: { type: string } # optional user comment
      answeredBy: { type: string } # who answered
      answeredAt: { type: string } # ISO timestamp
```

### Example 3: Question Step

```yaml
- type: user_intervention
  id: ask_environment
  interventionType: question
  question:
      question: 'Which environment should we deploy to?'
      responseType: 'text'
  output:
      answer: { type: string } # The text answer
      comment: { type: string } # Optional additional notes
```

### Example 4: Choice Step (Single)

```yaml
- type: user_intervention
  id: select_region
  interventionType: choice
  choice:
      question: 'Select deployment region'
      options:
          - { id: 'us-east', label: 'US East' }
          - { id: 'eu-west', label: 'EU West' }
          - { id: 'ap-south', label: 'Asia Pacific' }
      allowMultiple: false
  output:
      choice: { type: string } # The selected option ID
      comment: { type: string }
```

### Example 5: Choice Step (Multiple)

```yaml
- type: user_intervention
  id: select_features
  interventionType: choice
  choice:
      question: 'Select features to enable'
      options:
          - { id: 'analytics', label: 'Analytics' }
          - { id: 'logging', label: 'Logging' }
          - { id: 'monitoring', label: 'Monitoring' }
      allowMultiple: true
  output:
      choice: { type: object } # Array of selected option IDs (as object for type safety)
```

## Design Principles

### 1. **No Magic, Fully Declarative**

Outputs are **never** auto-generated. You must explicitly declare them in the `output:` field.

**Why?** This makes the flow definition self-documenting and prevents surprises. The FlowBuilder UI doesn't need to know implementation details of each step type.

### 2. **Consistent with Other Steps**

User intervention steps follow the exact same pattern as script/model/subflow steps:

- Script step: extracts outputs from stdout using regex patterns
- Model step: extracts outputs from AI response using patterns
- User intervention: extracts outputs from intervention response using variable names

### 3. **Type-Safe**

All outputs must specify a type (`boolean`, `string`, `number`, `object`) for proper type checking and conversion.

### 4. **Flexible Naming**

You can name your outputs anything you want:

```yaml
output:
    isApproved: { type: boolean } # Uses 'approved' alias
    userComment: { type: string } # Uses 'comment' alias
    whoAnswered: { type: string } # Uses 'answeredBy' alias
```

The output name (left side) becomes the variable name in `steps.{stepId}.outputs.*`.
The value comes from the aliased variable in the step context.

## Implementation Details (for FlowBuilder developers)

### How It Works Under the Hood

1. **StepRunner** executes the intervention and receives a response
2. **StepRunner** builds an `additionalContext` object with all available variables:
    ```typescript
    const additionalContext = {
    	value: response.value,
    	comment: response.comment,
    	answeredBy: response.answeredBy,
    	answeredAt: response.answeredAt,
    	userResponse: response.value,
    	approved: response.value === true,
    	rejected: response.value === false,
    	answer: response.value,
    	choice: response.value,
    };
    ```
3. **OutputExtractor** maps the declared outputs to values from `additionalContext`
4. If an output name matches a key in `additionalContext`, it uses that value directly
5. No regex patterns needed (unlike script steps)

### FlowBuilder Integration

The FlowBuilder UI should:

1. **Show available variables** in autocomplete when editing `output:` for user_intervention steps
2. **Suggest common output names** based on intervention type:
    - Approval: `approved`, `rejected`, `comment`
    - Question: `answer`, `comment`
    - Choice: `choice`, `comment`
3. **Validate output types** match the intervention type
4. **Not hardcode** any special logic per step type (follow the declarative pattern)

## Testing

The flow `test-user-intervention` in `.agent-fleet/flows.yml` demonstrates this pattern in action.

To test:

1. Load the flow in FlowBuilder: http://localhost:5030/flows/test-user-intervention/edit
2. Execute the flow
3. The `approval` step declares 4 outputs: `approved`, `userResponse`, `comment`, `answeredBy`
4. The `deploy` step references `${{ steps.approval.outputs.userResponse }}`
