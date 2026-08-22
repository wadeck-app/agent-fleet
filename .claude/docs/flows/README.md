# Flow Creation Documentation

This directory contains comprehensive documentation for creating and managing flows in the Agent Fleet system.

## Quick Navigation

**New to flows?** Start here: [Quick Start Guide](./quick-start-guide.md) (15 minutes)

## Documentation Index

### Getting Started

- **[Quick Start Guide](./quick-start-guide.md)** - Create your first flow in 15 minutes
    - Decision tree for choosing patterns
    - Step-by-step tutorial
    - Common first-time mistakes and solutions

### Reference Documentation

- **[Schema Reference](./schema-reference.md)** - Complete field-by-field documentation
    - All flow properties explained
    - Type definitions and examples
    - Validation rules

- **[Pattern Catalog](./pattern-catalog.md)** - Annotated examples organized by use case
    - Linear pipelines
    - Diamond patterns (fork-join)
    - Fan-out patterns
    - Conditional routing
    - Retry loops
    - SubFlow composition
    - And more...

### Guides

- **[Best Practices](./best-practices.md)** - Optimization and design patterns
    - Workspace strategy selection
    - Step design patterns
    - Data flow patterns
    - Error handling strategies
    - Performance optimization
    - Testing workflows

- **[Troubleshooting](./troubleshooting.md)** - Error reference and debugging
    - Validation errors by code
    - Runtime errors
    - Common issues and solutions
    - Debugging workflow

## Learning Path

### For Beginners

1. Read the [Quick Start Guide](./quick-start-guide.md)
2. Try creating a simple flow using one of the templates
3. Review [Common Mistakes](./quick-start-guide.md#common-first-time-mistakes) section
4. Explore the [Pattern Catalog](./pattern-catalog.md) for your use case

### For Intermediate Users

1. Study the [Schema Reference](./schema-reference.md) for advanced features
2. Read [Best Practices](./best-practices.md) for optimization tips
3. Explore complex patterns in the [Pattern Catalog](./pattern-catalog.md)
4. Review [Troubleshooting](./troubleshooting.md) for debugging techniques

### For Advanced Users

1. Dive deep into the [Schema Reference](./schema-reference.md)
2. Study all patterns in the [Pattern Catalog](./pattern-catalog.md)
3. Review validation error codes in [Troubleshooting](./troubleshooting.md)
4. Contribute new patterns and best practices

## Additional Resources

- **[FLOW_ENGINE_USAGE.md](../../../docs/FLOW_ENGINE_USAGE.md)** - Programmatic usage guide
- **[WORKFLOW_SYSTEM_DESIGN.md](../../../docs/WORKFLOW_SYSTEM_DESIGN.md)** - Architecture details
- **[flows.yml](../../../.agent-fleet/flows.yml)** - Source of truth for all example flows

## Quick Reference

### Basic Flow Structure

```yaml
flow-id:
    version: '1.0.0'
    name: 'Flow Name'
    description: 'What this flow does'
    workspace:
        mode: isolated|shared|manual
        gitStrategy: main-only|feature-branch|any|worktree
        reusePolicy: never|if-available|always
    inputs:
        inputName: type # shorthand
        # or
        inputName: # extended
            type: string|number|boolean|object
            required: true|false
            default: value
            description: 'Input description'
    steps:
        - type: model|script|subflow|user_intervention
          id: unique-step-id
          name: 'Human-Readable Name'
          # ... step-specific configuration
```

### Variable Interpolation

```yaml
# Access input variables
${{ inputs.variableName }}

# Access step outputs
${{ steps.stepId.outputs.variableName }}

# Access task metadata
${{ task.property }}
```

### Common Step Types

```yaml
# Model step (AI execution)
- type: model
  id: step-id
  name: 'Step Name'
  model: sonnet|haiku|opus
  prompt: 'Prompt with ${{ inputs.var }}'

# Script step (command execution)
- type: script
  id: step-id
  name: 'Step Name'
  script: 'command with ${{ inputs.var }}'
  output:
      varName: { type: string, pattern: 'regex(capture)' }

# SubFlow step (flow composition)
- type: subflow
  id: step-id
  name: 'Step Name'
  flowId: other-flow-id
  inputs:
      param: '${{ inputs.var }}'

# User Intervention step (approval/question/choice)
- type: user_intervention
  id: step-id
  name: 'Step Name'
  interventionType: approval|question|choice
  approval:
      title: 'Approval Title'
      description: 'Details'
```

## Need Help?

- **Validation Errors**: See [Troubleshooting Guide](./troubleshooting.md)
- **Pattern Selection**: See [Pattern Catalog](./pattern-catalog.md) decision tree
- **Advanced Features**: See [Schema Reference](./schema-reference.md)
- **Performance Issues**: See [Best Practices](./best-practices.md) optimization section

---

**Last Updated**: 2026-01-23
**Version**: 1.0.0
