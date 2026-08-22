# Flow Input Types Guide

Complete guide to flow input types in the Agent Fleet system, including the 17 new types added in the hybrid implicit/explicit input system.

## Table of Contents

1. [Overview](#overview)
2. [Input Declaration Modes](#input-declaration-modes)
3. [All Input Types](#all-input-types)
4. [Type-Specific Options](#type-specific-options)
5. [Examples](#examples)
6. [Best Practices](#best-practices)

## Overview

The Agent Fleet flow system supports **21 input types** organized into 8 categories:

- **Base Types** (4): string, number, boolean, object
- **Text Types** (3): text, url, markdown
- **Number Types** (3): integer, percentage, duration
- **Selection Types** (3): enum, multi-enum, priority
- **File Types** (2): file, folder
- **Date Types** (2): date, datetime
- **Code Types** (1): regex
- **Structure Types** (2): array, keyvalue
- **Security Types** (1): password

## Input Declaration Modes

You can declare inputs in three ways:

### 1. Auto-Discovery (No Declaration)

Inputs are automatically detected from template references:

```yaml
my-flow:
    # No inputs section needed!
    steps:
        - type: model
          prompt: 'Implement: ${{ inputs.task }}'
```

→ `task` is auto-discovered as `string`, optional

### 2. Shorthand Format

Simple type declaration:

```yaml
my-flow:
    inputs:
        task: string
        count: number
        enabled: boolean
```

→ All inputs are optional by default

### 3. Extended Format

Full metadata with constraints:

```yaml
my-flow:
    inputs:
        task:
            type: string
            required: true
            description: 'Task description'
            default: 'Default task'
```

## All Input Types

### Base Types

#### `string`

Simple text string.

```yaml
inputs:
    name: string
    # or extended
    name:
        type: string
        required: true
        description: 'User name'
        default: 'Anonymous'
```

**Use case**: Names, identifiers, short text

#### `number`

Numeric value (integer or decimal).

```yaml
inputs:
    score: number
    # or extended
    score:
        type: number
        required: true
        default: 0
        options:
            min: 0
            max: 100
```

**Use case**: Counts, measurements, any numeric value

#### `boolean`

True/false value.

```yaml
inputs:
    enabled: boolean
    # or extended
    enabled:
        type: boolean
        required: false
        default: false
```

**Use case**: Feature flags, toggles, yes/no questions

#### `object`

Complex JSON object.

```yaml
inputs:
    config: object
    # or extended
    config:
        type: object
        required: false
        default: {}
```

**Use case**: Configuration objects, nested data

---

### Text Types

#### `text`

Multi-line text (rendered as textarea).

```yaml
inputs:
    description:
        type: text
        required: true
        description: 'Detailed project description'
        options:
            minLength: 10
            maxLength: 5000
```

**Use case**: Long descriptions, multi-paragraph text, articles

**UI**: Multi-line textarea with optional character counter

#### `url`

URL string with validation.

```yaml
inputs:
    website:
        type: url
        required: false
        description: 'Project website URL'
        options:
            protocols: ['http', 'https']
```

**Use case**: Website links, API endpoints, documentation URLs

**UI**: Text input with URL validation and protocol icon

#### `markdown`

Markdown-formatted text.

```yaml
inputs:
    readme:
        type: markdown
        required: true
        description: 'README content in markdown format'
```

**Use case**: Documentation, formatted text, README files

**UI**: Markdown editor with edit/preview tabs

---

### Number Types

#### `integer`

Whole number (auto-rounded).

```yaml
inputs:
    team_size:
        type: integer
        required: true
        default: 5
        description: 'Number of team members'
        options:
            min: 1
            max: 100
```

**Use case**: Counts, iterations, team sizes

**UI**: Number input with spinner, integer validation

#### `percentage`

Percentage value (0-100).

```yaml
inputs:
    success_rate:
        type: percentage
        required: true
        default: 95
        description: 'Required success rate'
        options:
            min: 0
            max: 100
```

**Use case**: Progress, success rates, thresholds

**UI**: Number input with "%" suffix

#### `duration`

Time duration in seconds.

```yaml
inputs:
    timeout:
        type: duration
        required: true
        default: 300
        description: 'Timeout in seconds'
        options:
            min: 0
            max: 3600
```

**Use case**: Timeouts, delays, durations

**UI**: Number input with "s" suffix, optional unit selector (s/ms/m)

---

### Selection Types

#### `enum`

Single-select dropdown.

```yaml
inputs:
    environment:
        type: enum
        required: true
        description: 'Deployment environment'
        options:
            options:
                - { value: 'dev', label: 'Development' }
                - { value: 'staging', label: 'Staging' }
                - { value: 'production', label: 'Production' }
            searchable: true
```

**Use case**: Fixed set of options, environment selection

**UI**: Dropdown select (Radix Select)

#### `multi-enum`

Multiple-select dropdown.

```yaml
inputs:
    technologies:
        type: multi-enum
        required: true
        description: 'Technologies used'
        options:
            options:
                - { value: 'react', label: 'React' }
                - { value: 'node', label: 'Node.js' }
                - { value: 'python', label: 'Python' }
                - { value: 'go', label: 'Go' }
```

**Use case**: Multiple selections from fixed set

**UI**: Checkbox list with selected count badge

#### `priority`

Priority level selector.

```yaml
inputs:
    priority:
        type: priority
        required: true
        default: 'medium'
        description: 'Task priority'
```

**Use case**: Task priorities, urgency levels

**UI**: Select with color-coded options (low=gray, medium=yellow, high=orange, urgent=red)

**Options**: `low`, `medium`, `high`, `urgent`

---

### File Types

#### `file`

File path input.

```yaml
inputs:
    config_file:
        type: file
        required: true
        description: 'Configuration file'
        options:
            extensions: ['.json', '.yaml', '.yml']
```

**Use case**: File uploads, file processing

**UI**: File input with drag-and-drop, extension validation

#### `folder`

Directory path input.

```yaml
inputs:
    output_dir:
        type: folder
        required: true
        description: 'Output directory'
```

**Use case**: Directory selection, output paths

**UI**: Text input with folder icon

---

### Date Types

#### `date`

Date value (YYYY-MM-DD).

```yaml
inputs:
    deadline:
        type: date
        required: true
        description: 'Project deadline'
```

**Use case**: Deadlines, birth dates, event dates

**UI**: HTML5 date picker

**Format**: ISO 8601 date (YYYY-MM-DD)

#### `datetime`

Date and time value.

```yaml
inputs:
    start_time:
        type: datetime
        required: true
        description: 'Event start time'
```

**Use case**: Timestamps, event scheduling

**UI**: HTML5 datetime-local picker

**Format**: ISO 8601 datetime (YYYY-MM-DDTHH:MM:SSZ)

---

### Code Types

#### `regex`

Regular expression pattern.

```yaml
inputs:
    log_pattern:
        type: regex
        required: true
        default: 'ERROR|WARN'
        description: 'Log pattern to match'
```

**Use case**: Pattern matching, log filtering

**UI**: Monospace text input with regex validation, optional test string

---

### Structure Types

#### `array`

List of string values.

```yaml
inputs:
    dependencies:
        type: array
        required: false
        description: 'List of dependencies'
        options:
            minItems: 1
            maxItems: 50
```

**Use case**: Lists, multiple values

**UI**: Dynamic list with add/remove buttons

**Output**: JSON array (e.g., `["item1", "item2"]`)

#### `keyvalue`

Key-value pairs (object).

```yaml
inputs:
    environment_vars:
        type: keyvalue
        required: false
        description: 'Environment variables'
```

**Use case**: Configuration, environment variables

**UI**: Dynamic key-value pair editor with add/remove buttons

**Output**: JSON object (e.g., `{"KEY": "value"}`)

---

### Security Types

#### `password`

Secure password input.

```yaml
inputs:
    api_key:
        type: password
        required: true
        description: 'API key'
```

**Use case**: Passwords, API keys, secrets

**UI**: Password input (masked) with toggle visibility button

**Security Note**: Use secure vault storage in production

---

## Type-Specific Options

### StringOptions

```typescript
{
  minLength?: number;
  maxLength?: number;
  pattern?: string; // regex pattern
}
```

### UrlOptions

```typescript
{
  protocols?: string[]; // ['http', 'https']
}
```

### NumberOptions

```typescript
{
  min?: number;
  max?: number;
  step?: number;
}
```

### EnumOptions

```typescript
{
  options: Array<{ value: string; label: string }>;
  searchable?: boolean;
}
```

### FileOptions

```typescript
{
  extensions?: string[]; // ['.json', '.yaml']
  maxSize?: number; // bytes
}
```

### ArrayOptions

```typescript
{
  minItems?: number;
  maxItems?: number;
}
```

---

## Examples

### Example 1: Simple Blog Post Generator

```yaml
example-blog-post:
    version: '1.0.0'
    name: 'Blog Post Generator'
    inputs:
        topic:
            type: text
            required: true
            description: 'Blog post topic'
        reference_url:
            type: url
            required: false
            description: 'Reference URL'
        content:
            type: markdown
            required: false
            description: 'Existing content'
    steps:
        - type: model
          id: generate
          prompt: |
              Create a blog post about: ${{ inputs.topic }}
              Reference: ${{ inputs.reference_url || 'None' }}
```

### Example 2: Performance Test Configuration

```yaml
example-performance:
    version: '1.0.0'
    name: 'Performance Tests'
    inputs:
        iterations:
            type: integer
            required: true
            default: 10
            options:
                min: 1
                max: 100
        success_threshold:
            type: percentage
            required: true
            default: 95
        timeout:
            type: duration
            required: true
            default: 300
    steps:
        - type: script
          script: |
              echo "Running ${{ inputs.iterations }} iterations"
              echo "Success: ${{ inputs.success_threshold }}%"
              echo "Timeout: ${{ inputs.timeout }}s"
```

### Example 3: Deployment Workflow

```yaml
example-deployment:
    version: '1.0.0'
    name: 'Deployment'
    inputs:
        environment:
            type: enum
            required: true
            options:
                options:
                    - { value: 'dev', label: 'Development' }
                    - { value: 'prod', label: 'Production' }
        channels:
            type: multi-enum
            required: false
            options:
                options:
                    - { value: 'email', label: 'Email' }
                    - { value: 'slack', label: 'Slack' }
        priority:
            type: priority
            required: true
            default: 'medium'
    steps:
        - type: model
          prompt: |
              Deploy to: ${{ inputs.environment }}
              Priority: ${{ inputs.priority }}
              Notify: ${{ inputs.channels || 'None' }}
```

### Example 4: Configuration Generator

```yaml
example-config:
    version: '1.0.0'
    name: 'Config Generator'
    inputs:
        env_vars:
            type: keyvalue
            required: true
            description: 'Environment variables'
        dependencies:
            type: array
            required: false
            description: 'Dependencies'
    steps:
        - type: script
          script: |
              echo "Env: ${{ inputs.env_vars }}"
              echo "Deps: ${{ inputs.dependencies || '[]' }}"
```

---

## Best Practices

### 1. Use Appropriate Types

- Use `text` for multi-line content, not `string`
- Use `integer` for counts, not `number`
- Use `enum` for fixed options, not free-text `string`
- Use `password` for secrets, never plain `string`

### 2. Provide Descriptions

Always include clear descriptions:

```yaml
inputs:
    timeout:
        type: duration
        required: true
        description: 'Maximum execution time in seconds'
```

### 3. Set Sensible Defaults

```yaml
inputs:
    priority:
        type: priority
        required: true
        default: 'medium' # Good default
```

### 4. Use Validation Options

```yaml
inputs:
    team_size:
        type: integer
        options:
            min: 1
            max: 100
```

### 5. Mark Required Fields

```yaml
inputs:
    api_key:
        type: password
        required: true # Explicit
```

### 6. Group Related Inputs

```yaml
inputs:
    # Deployment settings
    environment: enum
    region: string

    # Notification settings
    notify_email: boolean
    notify_slack: boolean
```

### 7. Use Auto-Discovery for Simple Flows

For single-input flows, skip the `inputs` section:

```yaml
simple-flow:
    steps:
        - type: model
          prompt: '${{ inputs.task }}'
```

### 8. Leverage Type-Specific UI

- `enum` → Better UX than free-text
- `array` → Better than comma-separated string
- `keyvalue` → Better than JSON string

---

## Migration Guide

### From Old System (4 types)

**Old:**

```yaml
inputs:
    task: string
    count: number
    enabled: boolean
```

**New (backward compatible):**

```yaml
inputs:
    task: string # Still works!
    count: number
    enabled: boolean
```

**New (enhanced):**

```yaml
inputs:
    task:
        type: text # Better for long text
        required: true
        description: 'Task description'
    count:
        type: integer # Better for whole numbers
        options:
            min: 1
            max: 100
    enabled:
        type: boolean
        default: false
```

### Adding Metadata

**Before:**

```yaml
inputs:
    environment: string
```

**After:**

```yaml
inputs:
    environment:
        type: enum
        required: true
        description: 'Target environment'
        options:
            options:
                - { value: 'dev', label: 'Development' }
                - { value: 'prod', label: 'Production' }
```

---

## Troubleshooting

### Input Not Showing in UI

- Check that flow is loaded (check worker logs)
- Verify type is one of the 21 supported types
- Check for YAML syntax errors

### Validation Failing

- Check `required` fields are provided
- Verify type matches (e.g., integer not float)
- Check `options` constraints (min/max, extensions)

### Auto-Discovery Not Working

- Ensure template uses `${{ inputs.xxx }}` syntax
- Check TemplateValidator for errors
- Look for validation INFO messages

---

## See Also

- [Flow Engine Usage Guide](./FLOW_ENGINE_USAGE.md)
- [Example Flows](./../flows.yml) - Search for "example-" prefix
- [Flow Validation Guide](./FLOW_VALIDATION.md)
