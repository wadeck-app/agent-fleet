# Flow Composition Best Practices

## Overview

Flow composition using SubFlowSteps enables you to build complex, maintainable workflows from smaller, reusable building blocks. This guide covers patterns, best practices, and common pitfalls.

## When to Use SubFlowSteps

### ✅ Use SubFlowSteps When:

**1. Reusing Common Workflows**

```yaml
# Atomic flow used by multiple workflows
code-quality-check:
    steps:
        - type: script
          id: lint
          script: 'npm run lint'
        - type: script
          id: test
          script: 'npm test'

# Multiple workflows reuse it
pr-validation:
    steps:
        - type: subflow
          flowId: code-quality-check

release-pipeline:
    steps:
        - type: subflow
          flowId: code-quality-check
        - type: script
          id: deploy
          script: 'npm run deploy'
```

**2. Composing Multi-Phase Workflows**

```yaml
# Separate concerns into distinct flows
full-feature-development:
    steps:
        - type: subflow
          id: analysis
          flowId: analyze-requirements
        - type: subflow
          id: implementation
          flowId: implement-feature
          depends: [analysis]
        - type: subflow
          id: testing
          flowId: run-test-suite
          depends: [implementation]
```

**3. Conditional Execution Paths**

```yaml
adaptive-deployment:
    steps:
        - type: model
          id: detect-changes
          prompt: 'Analyze git diff'
          output:
              frontendChanged: { type: boolean }
              backendChanged: { type: boolean }

        - type: subflow
          id: deploy-frontend
          flowId: frontend-deployment
          when: '${{ steps.detect-changes.outputs.frontendChanged }}'

        - type: subflow
          id: deploy-backend
          flowId: backend-deployment
          when: '${{ steps.detect-changes.outputs.backendChanged }}'
```

**4. Organizing Large Workflows**

```yaml
# Instead of 20 steps in one flow
# Break into logical sub-workflows
enterprise-onboarding:
    steps:
        - type: subflow
          flowId: provision-infrastructure
        - type: subflow
          flowId: configure-services
        - type: subflow
          flowId: deploy-applications
        - type: subflow
          flowId: setup-monitoring
```

### ❌ Don't Use SubFlowSteps When:

**1. Single-Use, Simple Steps**

```yaml
# ❌ Unnecessary abstraction
echo-hello:
    steps:
        - type: script
          script: 'echo Hello'

my-workflow:
    steps:
        - type: subflow
          flowId: echo-hello # Just use a script step!
```

**2. Over-Fragmenting Logic**

```yaml
# ❌ Too granular - hard to understand
step1: { ... }
step2: { ... }
step3: { ... }

combine-steps:
    steps:
        - type: subflow
          flowId: step1
        - type: subflow
          flowId: step2
        - type: subflow
          flowId: step3

# ✅ Better - keep related steps together
combined-workflow:
    steps:
        - type: script
          id: step1
          script: '...'
        - type: script
          id: step2
          script: '...'
        - type: script
          id: step3
          script: '...'
```

**3. Avoiding Responsibility**

```yaml
# ❌ Don't use SubFlows just to hide complexity
# If a flow is too complex, refactor it properly
```

## Design Patterns

### Pattern 1: Pipeline Composition

Break a linear workflow into stages:

```yaml
# Stage 1: Preparation
prepare-environment:
    workspace: { mode: manual }
    steps:
        - type: script
          id: install-deps
          script: 'npm install'
        - type: script
          id: setup-config
          script: 'cp .env.example .env'

# Stage 2: Build
build-application:
    workspace: { mode: manual }
    steps:
        - type: script
          id: compile
          script: 'npm run build'
        - type: script
          id: optimize
          script: 'npm run optimize'

# Stage 3: Test
test-application:
    workspace: { mode: manual }
    steps:
        - type: script
          id: unit-tests
          script: 'npm test'
        - type: script
          id: integration-tests
          script: 'npm run test:integration'

# Main Pipeline
ci-pipeline:
    workspace: { mode: manual }
    steps:
        - type: subflow
          id: prepare
          flowId: prepare-environment

        - type: subflow
          id: build
          flowId: build-application
          depends: [prepare]

        - type: subflow
          id: test
          flowId: test-application
          depends: [build]
```

**Benefits:**

- Clear separation of stages
- Easy to test each stage independently
- Can reuse stages in different pipelines

### Pattern 2: Branching Workflows

Execute different subflows based on conditions:

```yaml
# Specialized flows for different project types
nodejs-build:
    workspace: { mode: manual }
    steps:
        - type: script
          script: 'npm run build'

python-build:
    workspace: { mode: manual }
    steps:
        - type: script
          script: 'python setup.py build'

rust-build:
    workspace: { mode: manual }
    steps:
        - type: script
          script: 'cargo build --release'

# Smart build dispatcher
smart-build:
    workspace: { mode: manual }
    inputs:
        projectPath: string
    steps:
        - type: model
          id: detect
          prompt: 'Detect project type in ${{ inputs.projectPath }}'
          output:
              isNodejs: { type: boolean }
              isPython: { type: boolean }
              isRust: { type: boolean }

        - type: subflow
          id: build-nodejs
          flowId: nodejs-build
          when: '${{ steps.detect.outputs.isNodejs }}'

        - type: subflow
          id: build-python
          flowId: python-build
          when: '${{ steps.detect.outputs.isPython }}'

        - type: subflow
          id: build-rust
          flowId: rust-build
          when: '${{ steps.detect.outputs.isRust }}'
```

**Benefits:**

- Polymorphic workflow behavior
- Easy to add new project types
- Type-specific logic isolated

### Pattern 3: Retry with Fallback

Attempt primary flow, fallback to alternative:

```yaml
# Primary deployment strategy
deploy-zero-downtime:
    workspace: { mode: manual }
    steps:
        - type: script
          script: 'kubectl apply -f k8s/rolling-update.yaml'

# Fallback deployment strategy
deploy-simple:
    workspace: { mode: manual }
    steps:
        - type: script
          script: 'kubectl apply -f k8s/recreate.yaml'

# Smart deployment with retry and fallback
resilient-deployment:
    workspace: { mode: manual }
    steps:
        - type: subflow
          id: primary
          flowId: deploy-zero-downtime
          retry:
              maxAttempts: 3
              backoff: exponential
          onFailure:
              goto: fallback

        - type: subflow
          id: fallback
          flowId: deploy-simple
```

**Benefits:**

- Resilient workflows
- Graceful degradation
- Clear fallback paths

### Pattern 4: Parallel Execution

Execute independent subflows concurrently:

```yaml
# Independent validation flows
lint-code:
    workspace: { mode: manual }
    steps:
        - type: script
          script: 'npm run lint'

security-scan:
    workspace: { mode: manual }
    steps:
        - type: script
          script: 'npm audit'

license-check:
    workspace: { mode: manual }
    steps:
        - type: script
          script: 'license-checker'

# Parallel validation
pre-commit-checks:
    workspace: { mode: manual }
    steps:
        # All three execute in parallel (no dependencies)
        - type: subflow
          id: lint
          flowId: lint-code

        - type: subflow
          id: security
          flowId: security-scan

        - type: subflow
          id: licenses
          flowId: license-check

        # Final step waits for all
        - type: script
          id: report
          depends: [lint, security, licenses]
          script: "echo 'All checks passed'"
```

**Benefits:**

- Faster execution
- Independent validation
- Clear parallelism

### Pattern 5: Data Transformation Pipeline

Chain subflows that transform data:

```yaml
# Extract data
extract-data:
    workspace: { mode: manual }
    inputs:
        source: string
    steps:
        - type: script
          id: fetch
          script: 'curl ${{ inputs.source }}'
          output:
              rawData: { type: string }

# Transform data
transform-data:
    workspace: { mode: manual }
    inputs:
        data: string
    steps:
        - type: model
          id: transform
          prompt: 'Transform: ${{ inputs.data }}'
          output:
              transformedData: { type: string }

# Load data
load-data:
    workspace: { mode: manual }
    inputs:
        data: string
    steps:
        - type: script
          id: save
          script: "echo '${{ inputs.data }}' > output.json"

# ETL Pipeline
etl-pipeline:
    workspace: { mode: manual }
    inputs:
        dataSource: string
    steps:
        - type: subflow
          id: extract
          flowId: extract-data
          inputs:
              source: '${{ inputs.dataSource }}'

        - type: subflow
          id: transform
          flowId: transform-data
          depends: [extract]
          inputs:
              data: '${{ steps.extract.outputs.rawData }}'

        - type: subflow
          id: load
          flowId: load-data
          depends: [transform]
          inputs:
              data: '${{ steps.transform.outputs.transformedData }}'
```

**Benefits:**

- Testable stages
- Reusable transformations
- Clear data flow

## Architecture Guidelines

### Hierarchy Principles

```
✅ Good Hierarchy:
Main Workflow (3-4 subflows)
  └─ Feature Workflows (2-3 subflows each)
     └─ Atomic Tasks (direct steps)

❌ Bad Hierarchy:
Main → Sub1 → Sub2 → Sub3 → Sub4 → Sub5 → Sub6 → Sub7
(Too deep, hard to debug)
```

**Recommended Nesting Levels:**

- **0-2 levels:** Ideal - easy to understand
- **3-4 levels:** Acceptable - document well
- **5-6 levels:** Warning - consider refactoring
- **7+ levels:** Bad - definitely refactor

### Naming Conventions

```yaml
# ✅ Good Names - Clear Purpose
user-registration-flow
order-processing-pipeline
database-migration-executor
frontend-build-and-test

# ❌ Bad Names - Vague
flow1
helper-flow
do-stuff
process
```

**Naming Pattern:** `<domain>-<action>-<type>`

- **domain:** What area (user, order, database)
- **action:** What it does (registration, processing, migration)
- **type:** Optional (flow, pipeline, task)

### Input/Output Design

```yaml
# ✅ Good - Explicit contracts
analyze-code:
    inputs:
        repositoryPath: string
        language: string
    steps:
        - type: model
          id: analyze
          output:
              # Declare what this flow produces
              issues: { type: array }
              score: { type: number }
              suggestions: { type: string }

# Consumers know what to expect
review-flow:
    steps:
        - type: subflow
          id: analysis
          flowId: analyze-code
          inputs: { ... }
        # Can confidently use these outputs:
        # - steps.analysis.outputs.issues
        # - steps.analysis.outputs.score
        # - steps.analysis.outputs.suggestions
```

## Performance Considerations

### 1. Minimize Nesting Depth

```yaml
# ❌ Poor Performance - 10 nested calls
# Each level adds overhead
main → a → b → c → d → e → f → g → h → i → j

# ✅ Better - Flatten when possible
main:
  steps:
    - type: subflow
      flowId: a
    - type: subflow
      flowId: b
    - type: subflow
      flowId: c
    # Parallel execution, less overhead
```

### 2. Avoid Unnecessary SubFlows

```yaml
# ❌ Wasteful
trivial-wrapper:
  steps:
    - type: script
      script: "echo hello"

main:
  steps:
    - type: subflow
      flowId: trivial-wrapper  # Overhead for no benefit

# ✅ Efficient
main:
  steps:
    - type: script
      script: "echo hello"  # Direct execution
```

### 3. Use Parallel Execution

```yaml
# ✅ Fast - Independent subflows run concurrently
fast-validation:
    steps:
        - type: subflow
          id: check1
          flowId: validation1 # No depends

        - type: subflow
          id: check2
          flowId: validation2 # No depends

        - type: subflow
          id: check3
          flowId: validation3 # No depends


        # All 3 run in parallel!
```

## Error Handling Strategies

### Strategy 1: Fail Fast

```yaml
critical-deployment:
    steps:
        - type: subflow
          id: validate
          flowId: pre-deploy-validation
          # No retry, no fallback - fail immediately

        - type: subflow
          id: deploy
          flowId: production-deployment
          depends: [validate]
          # Only runs if validation succeeds
```

**Use when:** Errors are unrecoverable, continuing is dangerous.

### Strategy 2: Retry with Backoff

```yaml
resilient-api-call:
    steps:
        - type: subflow
          id: api
          flowId: call-external-api
          retry:
              maxAttempts: 5
              backoff: exponential
              # Retries: 1s, 2s, 4s, 8s, 16s
```

**Use when:** Transient failures expected (network issues, rate limits).

### Strategy 3: Fallback Strategy

```yaml
deployment-with-fallback:
    steps:
        - type: subflow
          id: modern-deploy
          flowId: kubernetes-deployment
          onFailure:
              goto: legacy-deploy

        - type: subflow
          id: legacy-deploy
          flowId: vm-deployment
```

**Use when:** Alternative approaches available.

### Strategy 4: Continue on Error

```yaml
best-effort-notifications:
    steps:
        - type: subflow
          id: email
          flowId: send-email-notification
          onFailure:
              continueOnError: true # Don't fail entire workflow

        - type: subflow
          id: slack
          flowId: send-slack-notification
          onFailure:
              continueOnError: true # Optional notification

        - type: script
          id: core-work
          depends: [] # Runs regardless of notifications
          script: 'perform-critical-task'
```

**Use when:** SubFlow failure shouldn't block main workflow.

## Testing Composed Flows

### 1. Test Atomic Flows First

```bash
# Test building blocks independently
npm run test-flow -- analyze-code
npm run test-flow -- implement-feature
npm run test-flow -- run-tests

# Then test composition
npm run test-flow -- full-dev-cycle
```

### 2. Validate Flow Definitions

```bash
# Check for circular dependencies, missing flows
npm run validate-flows
```

### 3. Use Test Flows

```yaml
# In .agent-fleet/flows.yml
test-subflow-composition:
    description: 'Integration test for SubFlowStep feature'
    workspace: { mode: manual }
    steps:
        - type: subflow
          id: test1
          flowId: atomic-test-flow
        - type: subflow
          id: test2
          flowId: another-atomic-flow
          depends: [test1]
```

## Common Pitfalls

### Pitfall 1: Circular Dependencies

```yaml
# ❌ Will fail validation
flow-a:
    steps:
        - type: subflow
          flowId: flow-b

flow-b:
    steps:
        - type: subflow
          flowId: flow-a # Circular!
```

**Solution:** Restructure flows to have clear hierarchy.

### Pitfall 2: Missing Error Handling

```yaml
# ❌ No error handling - brittle
deployment:
  steps:
    - type: subflow
      flowId: risky-operation  # What if this fails?
    - type: subflow
      flowId: critical-step  # Never runs if above fails

# ✅ Explicit error handling
deployment:
  steps:
    - type: subflow
      id: risky
      flowId: risky-operation
      retry:
        maxAttempts: 3
      onFailure:
        goto: cleanup

    - type: subflow
      id: critical
      flowId: critical-step
      depends: [risky]

    - type: subflow
      id: cleanup
      flowId: cleanup-on-failure
```

### Pitfall 3: Tight Coupling

```yaml
# ❌ Tightly coupled - hard to reuse
specialized-flow:
  steps:
    - type: subflow
      flowId: generic-task
      inputs:
        # Assumes parent has specific step names
        data: "${{ steps.parent-specific-step.outputs.value }}"

# ✅ Loosely coupled - reusable
specialized-flow:
  inputs:
    inputData: string  # Generic input
  steps:
    - type: subflow
      flowId: generic-task
      inputs:
        data: "${{ inputs.inputData }}"
```

### Pitfall 4: Over-Engineering

```yaml
# ❌ Unnecessary complexity
greet-user:
  steps:
    - type: script
      script: "echo Hello"

add-name:
  steps:
    - type: script
      script: "echo World"

compose-greeting:
  steps:
    - type: subflow
      flowId: greet-user
    - type: subflow
      flowId: add-name

# ✅ Simple and clear
greet-user:
  steps:
    - type: script
      script: "echo Hello World"
```

## Migration Guide

### Converting Monolithic Flows

**Before:**

```yaml
huge-workflow:
    steps:
        # 30 steps all in one flow
        - type: script
          id: step1
          script: '...'
        - type: script
          id: step2
          script: '...'
        # ... 28 more steps
```

**After:**

```yaml
# Extract logical groups
phase1:
    steps:
        - type: script
          id: step1
          script: '...'
        - type: script
          id: step2
          script: '...'

phase2:
    steps:
        - type: script
          id: step3
          script: '...'

phase3:
    steps:
        - type: script
          id: step4
          script: '...'

# Main workflow orchestrates
organized-workflow:
    steps:
        - type: subflow
          flowId: phase1
        - type: subflow
          flowId: phase2
          depends: [phase1]
        - type: subflow
          flowId: phase3
          depends: [phase2]
```

## Quick Reference

### SubFlowStep Syntax

```yaml
- type: subflow
  id: unique-id # Required
  flowId: target-flow-name # Required
  inputs: # Required (can be empty {})
      param1: '${{ inputs.value }}'
      param2: '${{ steps.prev.outputs.data }}'
  workspaceStrategy: inherit # Optional: 'inherit' | 'separate'
  depends: [other-step-ids] # Optional
  when: '${{ condition }}' # Optional
  retry: # Optional
      maxAttempts: 3
      backoff: exponential
  onFailure: # Optional
      goto: fallback-step
      continueOnError: true
      propagate: true
```

### Validation Rules

- ✅ Referenced flow must exist
- ✅ No circular dependencies (direct or indirect)
- ✅ Max 10 nesting levels
- ⚠️ Warning if required inputs missing

### Best Practices Checklist

- [ ] Each flow has single, clear responsibility
- [ ] Flow names are descriptive (not flow1, flow2)
- [ ] Nesting depth ≤ 4 levels
- [ ] Error handling defined for critical subflows
- [ ] Inputs/outputs documented
- [ ] Tested atomic flows before composition
- [ ] No circular dependencies
- [ ] Considered alternatives before creating subflow

## Additional Resources

- **Flow Development Guide:** `.agent-fleet/.claude/docs/flow-development.md`
- **SubFlowStep Implementation Plan:** `.claude/temp/subflow-implementation-plan-FINAL.md`
- **Example Flows:** `.agent-fleet/flows.yml`

---

**Last Updated:** 2025-12-08
**Feature Status:** Phase 1 Complete (`workspaceStrategy: inherit` only)
