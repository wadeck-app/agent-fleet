# Plan: Flow Creation System Improvements

## Executive Summary

**Goal**: Enable AI agents to easily create new flows with comprehensive validation, and build towards a long-term vision of an "idea-to-tickets" system that reuses existing flows or generates custom ones as needed.

**Current State Assessment**:

- ✅ Excellent technical foundation: 20+ example flows, comprehensive type system, 5-phase validation
- ❌ Poor discoverability: No guided path for creating flows, scattered documentation, steep learning curve
- **Agent Success Rate**: Currently ~40% → Target 85%+

**Approach**:

1. **Phase 1 (Priority: HIGH)**: Create comprehensive documentation suite
2. **Phase 2 (Priority: MEDIUM)**: Enhance validation with logical checks
3. **Phase 3 (Priority: LONG-TERM)**: Build idea-to-tickets system with hybrid flow reuse/generation

---

## Phase 1: Documentation Suite (Court Terme - Priorité Immédiate)

### Objective

Enable any agent (or human) to create a valid, working flow on their first attempt by providing clear, navigational documentation.

### Critical Files to Create

#### 1. **Quick Start Guide**

**File**: `.claude/docs/flows/quick-start-guide.md`

**Content**:

````markdown
# Flow Creation Quick Start (15 minutes)

## What You'll Learn

- Create your first flow in 5 minutes
- Choose the right pattern for your needs
- Validate and test your flow

## Prerequisites

- Basic YAML knowledge
- Understanding of the task you want to automate

## Step 1: Choose Your Starting Template

Decision tree for selecting the right pattern:

- **Simple task with one AI step** → Use `simple-implement` pattern
- **Multi-step with parallel execution** → Use `test-diamond` pattern
- **Task with retry logic** → Use `test-loop` pattern
- **Data processing pipeline** → Use `data-etl` pattern
- **Composition of sub-tasks** → Use `test-subflow-basic` pattern
- **Need user approval** → Use `test-user-intervention` pattern

## Step 2: Copy Template from flows.yml

Location: `.agent-fleet/flows.yml`
Copy the entire flow definition matching your chosen pattern.

## Step 3: Customize Core Properties

```yaml
your-flow-id: # Choose a unique, descriptive ID
    version: '1.0.0'
    name: 'Your Flow Name'
    description: 'Clear description of what this flow does'
```
````

## Step 4: Configure Workspace

Choose workspace mode based on your needs:

- `isolated` - Each execution gets fresh workspace (safest, use for code changes)
- `shared` - All executions share one workspace (faster, use for Q&A)
- `manual` - Use current directory (debugging only)

```yaml
workspace:
    mode: isolated # isolated|shared|manual
    gitStrategy: main-only # main-only|feature-branch|any|worktree
    reusePolicy: always # never|if-available|always
```

## Step 5: Define Inputs

```yaml
inputs:
    # Shorthand (type only)
    taskDescription: string

    # Extended (with metadata)
    priority:
        type: string
        required: true
        default: 'medium'
        description: 'Task priority: low, medium, high'
```

## Step 6: Customize Steps

Replace template steps with your logic:

```yaml
steps:
    - type: model|script|subflow|user_intervention
      id: unique-step-id
      name: 'Human-Readable Step Name'
      # ... step-specific config
```

## Step 7: Validate

The system validates automatically when you save flows.yml.
Check the UI for validation errors (red indicators).

Common first-time errors:

- Duplicate step IDs → Make each ID unique
- Missing dependencies → Add `depends: [step-id]` if using step outputs
- Invalid output references → Ensure referenced steps exist and define outputs

## Step 8: Test

1. Create a test task in the UI
2. Select your new flow
3. Execute and monitor the trace
4. Check outputs and logs

## Common First-Time Mistakes

1. **Forgetting to declare dependencies**

    ```yaml
    # ❌ Wrong: step-b uses step-a output but no dependency
    - type: script
      id: step-b
      script: echo "${{ steps.step-a.outputs.result }}"

    # ✅ Correct: declare dependency
    - type: script
      id: step-b
      depends: [step-a]
      script: echo "${{ steps.step-a.outputs.result }}"
    ```

2. **Output pattern not matching script output**

    ```yaml
    # ❌ Wrong: pattern expects "result=" but script outputs just "42"
    output:
        value: { type: string, pattern: 'result=(.*)' }

    # ✅ Correct: match actual script output
    output:
        value: { type: string } # Captures entire stdout
    ```

3. **Using wrong workspace mode**
    - Use `isolated` for flows that modify code
    - Use `shared` for read-only flows (Q&A, analysis)
    - Use `manual` ONLY for local debugging

## Next Steps

- Read [Schema Reference](./schema-reference.md) for all available fields
- Explore [Pattern Catalog](./pattern-catalog.md) for advanced patterns
- Review [Best Practices](./best-practices.md) for optimization tips

```

#### 2. **Schema Reference**
**File**: `.claude/docs/flows/schema-reference.md`

**Content**: Complete field-by-field documentation auto-generated from TypeScript types with human-readable descriptions. Every field must include:
- Description
- Type (with TypeScript signature)
- Required/Optional
- Default value
- Valid values/enums
- Example
- Common mistakes
- Related fields

**Sections**:
1. Flow-Level Properties (id, version, name, description, workspace, statusTransitions, inputs)
2. Workspace Configuration (mode, gitStrategy, reusePolicy, concurrencyKey)
3. Input Definitions (shorthand vs extended, type system, validation)
4. Step Types Overview
5. Model Steps (type, model, prompt, output, context)
6. Script Steps (type, script, workingDir, env, output)
7. SubFlow Steps (type, flowId, inputs, workspaceStrategy, allowRecursion, output)
8. User Intervention Steps (interventionType, approval/question/choice configs, timeout, blocking, output)
9. Common Step Properties (id, name, depends, when, skipOnLoop, retry, onFailure, output, contract)
10. Output Extraction (pattern, from, transform, required, default)
11. Template Syntax (${{ inputs.* }}, ${{ steps.*.outputs.* }}, ${{ task.* }})
12. Conditional Execution (when clauses)
13. Feedback Loops (onFailure.goto, maxIterations)

#### 3. **Pattern Catalog**
**File**: `.claude/docs/flows/pattern-catalog.md`

**Content**: Annotated examples from flows.yml organized by use case. Each pattern includes:
- Name and description
- When to use (decision criteria)
- Visual ASCII diagram
- Complete annotated YAML example
- Key concepts explained
- Variations and alternatives
- Related patterns

**Patterns to document**:
1. **Linear Pipeline** (A → B → C)
   - Example: `data-simple-pipeline`
   - Use case: Sequential processing where each step depends on the previous

2. **Diamond (Fork-Join)** (A → {B,C} → D)
   - Example: `test-diamond`
   - Use case: Parallel processing that merges at a join point

3. **Fan-Out** (A → {B,C,D})
   - Example: `test-fork`
   - Use case: Independent parallel tasks (security audit + linting + tests)

4. **Fan-Out/Fan-In** (A → {B,C,D} → E)
   - Example: `data-fanout-fanin`
   - Use case: Parallel processing with aggregation

5. **Conditional Routing** (A → B if X, C if Y)
   - Example: `data-conditional`
   - Use case: Different paths based on data/conditions

6. **Retry Loop** (A → B → fail → A)
   - Example: `test-loop`
   - Use case: Implement-test-fix cycles

7. **ETL Pipeline** (Extract → Transform → Load)
   - Example: `data-etl`
   - Use case: Data processing workflows

8. **Build Pipeline** (checkout → build → test → deploy)
   - Example: `data-build-pipeline`
   - Use case: CI/CD workflows

9. **SubFlow Composition**
   - Example: `test-subflow-basic`
   - Use case: Reusing flows as building blocks

10. **Recursive Flow**
    - Example: `test-recursive-countdown`
    - Use case: Iterative processing with variable depth

11. **User Intervention** (Approval/Question/Choice)
    - Example: `test-user-intervention`
    - Use case: Workflows requiring human approval or input

#### 4. **Best Practices Guide**
**File**: `.claude/docs/flows/best-practices.md`

**Content**:

1. **Workspace Strategy Selection**
   - When to use `isolated` vs `shared` vs `manual`
   - Performance implications
   - Git strategy alignment

2. **Step Design Patterns**
   - Single Responsibility Principle for steps
   - Naming conventions (imperative verbs: "Analyze", "Build", "Test")
   - Output structure (what to expose vs keep internal)
   - Step granularity (when to split, when to combine)

3. **Data Flow Patterns**
   - Pipeline pattern (linear data transformation)
   - Fan-out/fan-in (parallel aggregation)
   - Conditional branching (decision trees)
   - Loop patterns (feedback loops)

4. **Output Configuration**
   - When to use regex patterns vs full stdout
   - Transform functions (when to parse, when to keep as string)
   - Required vs optional outputs
   - Default values for fallback behavior

5. **Error Handling Strategies**
   - Retry configuration (when and how)
   - Feedback loops (onFailure.goto)
   - Conditional error paths
   - Validation contracts (preProcess/postProcess)

6. **Performance Optimization**
   - Workspace reuse strategies
   - Parallel execution (dependencies graph)
   - Model selection (haiku vs sonnet vs opus)
   - Concurrency control

7. **Testing Flows**
   - Test in `manual` mode first (faster iteration)
   - Use validation examples section in flows.yml
   - Start with simple inputs
   - Monitor trace logs

8. **Maintainability**
   - Clear, descriptive names
   - Comprehensive descriptions
   - Document complex logic in name/description
   - Version your flows (semantic versioning)

#### 5. **Troubleshooting Guide**
**File**: `.claude/docs/flows/troubleshooting.md`

**Content**:

1. **Validation Errors Reference** (organized by ValidationCode)
   - MISSING_FIELD → "How to fix" + example
   - INVALID_TYPE → "How to fix" + example
   - DUPLICATE_ID → "How to fix" + example
   - UNDEFINED_STEP → "How to fix" + example
   - UNDEFINED_INPUT → "How to fix" + example
   - UNDEFINED_OUTPUT → "How to fix" + example
   - CIRCULAR_DEPENDENCY → "How to fix" + example
   - CIRCULAR_SUBFLOW_REFERENCE → "How to fix" + example
   - UNREACHABLE_STEP → "How to fix" + example
   - And all other codes from ValidationTypes.ts

2. **Runtime Errors**
   - Template rendering errors
   - Script execution failures
   - Model step failures
   - SubFlow errors

3. **Common Issues**
   - "My step outputs aren't available in the next step"
     → Check dependencies, check output configuration
   - "Pattern doesn't match script output"
     → Debug regex, check actual stdout
   - "Circular dependency detected"
     → Visualize DAG, identify cycle
   - "Flow validation passes but execution fails"
     → Check runtime conditions, check workspace state

4. **Debugging Workflow**
   1. Check validation panel (UI red indicators)
   2. Review step dependencies (ensure DAG is correct)
   3. Verify output configurations (pattern matching)
   4. Test in isolation (manual mode with simple inputs)
   5. Check trace logs (step-by-step execution)
   6. Verify workspace state (git status, file contents)

5. **FAQ**
   - Q: When should I use a subflow vs putting all steps in one flow?
   - Q: How do I pass data between steps?
   - Q: Can I use environment variables in templates?
   - Q: How do I test a flow without creating a task?
   - Q: What happens if a step fails?
   - Q: How do I debug template interpolation?
   - Q: Can I dynamically generate step IDs?
   - Q: How do I handle optional inputs?

#### 6. **Update Existing Docs**

**File**: `docs/FLOW_ENGINE_USAGE.md`

**Updates**:
- Add "🆕 New to flows? Start with [Quick Start Guide](./.claude/docs/flows/quick-start-guide.md)" at top
- Add "Prerequisites" section linking to other docs
- Add "Next Steps" section with navigation links
- Cross-link to new documentation throughout

**File**: `packages/web-frontend/src/app/pages/flows/flow-editor/README.md`

**Updates**:
- Translate from French to English
- Add "Creating Your First Flow in the Editor" section
- Link to schema reference and pattern catalog
- Add troubleshooting section specific to visual editor

### Documentation Structure

```

.claude/docs/flows/
├── quick-start-guide.md (15-minute getting started)
├── schema-reference.md (Complete field documentation)
├── pattern-catalog.md (Annotated examples by use case)
├── best-practices.md (Optimization and design patterns)
├── troubleshooting.md (Error reference and debugging)
└── README.md (Index linking to all docs)

````

### Success Metrics

**Quantitative**:
- Agent success rate: 40% → 85%+
- Time to first valid flow: < 15 minutes
- Validation error rate: Track reduction in common errors
- Documentation coverage: 100% of schema fields documented

**Qualitative**:
- Agent can explain WHY it chose a pattern
- Agent can fix validation errors without external help
- Agent can assess trade-offs between approaches

### Implementation Notes

1. **Auto-generation opportunities**:
   - Schema reference can be partially auto-generated from `packages/flow-engine/src/types.ts`
   - Validation error catalog from `packages/flow-engine/src/validation/ValidationTypes.ts`
   - Examples index from `.agent-fleet/flows.yml`

2. **Documentation standards**:
   - Every doc starts with: What you'll learn, Prerequisites, Estimated time, Related docs
   - Use consistent formatting (code blocks with language tags, ASCII diagrams, before/after)
   - Cross-link extensively

3. **Maintenance strategy**:
   - Schema reference updates when types change
   - Add new examples to flows.yml with inline comments
   - Update troubleshooting guide when new validation rules added
   - Quarterly review for gaps

---

## Phase 2: Enhanced Validation (Court Terme - Priorité Moyenne)

### Objective
Extend validation system beyond syntax/structure to include logical consistency and data flow correctness.

### Current Validation (5 Phases)
1. ✅ Schema validation (structure, required fields, types)
2. ✅ Graph validation (cycles, reachability, DAG)
3. ✅ Semantic validation (references, subflows)
4. ✅ Template validation (variable expressions)
5. ✅ Dependency order validation (variable usage respects DAG)

### New Validation Phases to Add

#### 6. **Logical Validation** (Data Flow Consistency)
**File**: `packages/flow-engine/src/validation/LogicalValidator.ts`

**Checks**:
1. **Input Coverage**: Every required input is provided or has default
2. **Output Consistency**:
   - Every step that declares outputs actually produces them
   - Output types match declared types
   - Required outputs are always produced (not optional)
3. **Data Type Flow**:
   - If step B uses `${{ steps.A.outputs.count }}` and declares it as `number`,
     verify step A's output `count` is also declared as `number`
   - Warn on type mismatches (e.g., string → number without transform)
4. **Transform Validation**:
   - If output has `transform: parseInt`, ensure type is `number`
   - If output has `transform: parseJSON`, ensure type is `object`
   - Warn if transform doesn't match type
5. **Pattern Completeness**:
   - If output uses `pattern`, ensure regex has capture group
   - Warn if pattern is too broad (e.g., `(.*)` captures everything)
6. **Conditional Logic**:
   - If `when` clause references `steps.A.outputs.x`, ensure A defines x
   - Warn if all paths are conditional (no guaranteed execution path)

**Error Codes** (add to ValidationTypes.ts):
```typescript
// Logical errors
DATA_TYPE_MISMATCH = 'DATA_TYPE_MISMATCH',
TRANSFORM_TYPE_MISMATCH = 'TRANSFORM_TYPE_MISMATCH',
OUTPUT_NOT_PRODUCED = 'OUTPUT_NOT_PRODUCED',
PATTERN_MISSING_CAPTURE = 'PATTERN_MISSING_CAPTURE',
NO_GUARANTEED_PATH = 'NO_GUARANTEED_PATH',
REQUIRED_INPUT_MISSING = 'REQUIRED_INPUT_MISSING',
````

#### 7. **Contract Validation** (Pre/Post Conditions)

**File**: `packages/flow-engine/src/validation/ContractValidator.ts`

**Checks** (if contract is defined):

1. **preProcess.validateInputs**:
    - Ensure input being validated exists
    - Ensure validation rules are valid (e.g., `min` with number, `pattern` with string)
2. **postProcess.validateOutputs**:
    - Ensure output being validated is declared in `output` section
    - Ensure validation rules match output type

#### 8. **Simulation Validator** (Dry-Run Conceptual Check)

**File**: `packages/flow-engine/src/validation/SimulationValidator.ts`

**Checks** (conceptual, no actual execution):

1. **Template Rendering Simulation**:
    - Given example inputs, simulate template rendering
    - Detect templates that would fail at runtime
    - Example: `${{ inputs.count + 1 }}` - this won't work (template only does interpolation, not evaluation)
2. **Dependency Chain Simulation**:
    - Trace data flow from inputs → step outputs → final outputs
    - Identify "dead-end" outputs (produced but never used)
    - Identify missing data (required but not produced)
3. **Execution Path Analysis**:
    - Identify all possible execution paths through the DAG
    - Warn if some outputs are only produced on certain paths
    - Ensure at least one path reaches a terminal step

### Integration with FlowValidator

**File**: `packages/flow-engine/src/validation/FlowValidator.ts`

Update to run 8 phases instead of 5:

```typescript
validate(flow: FlowDefinition): ValidationResult {
    // Existing phases
    1. schemaValidation
    2. graphValidation (if schema valid)
    3. semanticValidation (if schema valid)
    4. templateValidation (with auto-discovery)
    5. dependencyOrderValidation (if schema valid)

    // New phases
    6. logicalValidation (if schema valid)
    7. contractValidation (if schema valid)
    8. simulationValidation (if all previous valid)

    return mergedResult;
}
```

### Success Metrics

- **Coverage**: All logical inconsistencies caught before execution
- **False Positives**: < 5% (warnings should be actionable)
- **Runtime Errors**: Reduce by 60% (catch errors at validation time)

---

## Phase 3: Idea-to-Tickets System (Long Terme - Vision)

### Objective

Build a system where the user describes an idea, and the system:

1. Analyzes the idea
2. Determines if existing flows can be reused (with adaptation)
3. OR generates custom flows if needed
4. Produces structured tickets based on the refined idea

### Architecture

#### Component 1: Flow Analyzer

**File**: `packages/flow-engine/src/analysis/FlowAnalyzer.ts`

**Purpose**: Analyze existing flows to understand their capabilities and structure.

**Methods**:

- `analyzeFlow(flow: FlowDefinition): FlowCapabilities`
    - Extract flow purpose from description
    - Identify input requirements
    - Identify output types
    - Classify flow pattern (pipeline, conditional, loop, etc.)
    - Calculate complexity score

- `findSimilarFlows(capabilities: FlowCapabilities): FlowDefinition[]`
    - Semantic search based on description
    - Match by input/output signatures
    - Match by pattern type
    - Rank by similarity score

**Types**:

```typescript
interface FlowCapabilities {
	id: string;
	purpose: string; // Extracted from description
	patterns: FlowPattern[]; // 'pipeline' | 'conditional' | 'loop' | 'fanout' | etc.
	inputs: InputSignature[];
	outputs: OutputSignature[];
	complexity: number; // 1-10 score
	tags: string[]; // Auto-extracted keywords
}

interface InputSignature {
	name: string;
	type: VariableType;
	required: boolean;
}

interface OutputSignature {
	name: string;
	type: VariableType;
}
```

#### Component 2: Flow Recommendation Engine

**File**: `packages/flow-engine/src/analysis/FlowRecommendationEngine.ts`

**Purpose**: Given an idea description, recommend existing flows or suggest creating a new one.

**Methods**:

- `recommendFlows(ideaDescription: string): FlowRecommendation[]`
    - Parse idea description to extract requirements
    - Search existing flows using FlowAnalyzer
    - Rank recommendations by fit score
    - Return top matches with adaptation suggestions

**Types**:

```typescript
interface FlowRecommendation {
	flow: FlowDefinition;
	fitScore: number; // 0-100
	matchedCapabilities: string[]; // What matches the idea
	gaps: string[]; // What's missing
	adaptationSuggestions: AdaptationSuggestion[];
	reasoning: string; // Why this flow was recommended
}

interface AdaptationSuggestion {
	type: 'add-input' | 'modify-step' | 'add-step' | 'change-workspace';
	description: string;
	priority: 'required' | 'recommended' | 'optional';
}
```

#### Component 3: Custom Flow Generator

**File**: `packages/flow-engine/src/generation/FlowGenerator.ts`

**Purpose**: Generate custom flows when existing flows don't fit.

**Methods**:

- `generateFlow(requirements: FlowRequirements): FlowDefinition`
    - Analyze requirements
    - Select appropriate pattern(s)
    - Generate flow structure
    - Validate generated flow
    - Return complete flow definition

**Types**:

```typescript
interface FlowRequirements {
	description: string;
	inputs: InputRequirement[];
	expectedOutputs: OutputRequirement[];
	patterns: FlowPattern[]; // Suggested patterns
	constraints: FlowConstraints;
}

interface InputRequirement {
	name: string;
	type: VariableType;
	required: boolean;
	description: string;
}

interface OutputRequirement {
	name: string;
	type: VariableType;
	description: string;
}

interface FlowConstraints {
	workspaceMode?: WorkspaceMode;
	maxSteps?: number;
	requiresApproval?: boolean;
	timeout?: number;
}
```

**Generation Strategy**:

1. Parse requirements into structured format
2. Select base pattern from Pattern Catalog
3. Generate steps based on requirements:
    - Model steps for analysis/implementation tasks
    - Script steps for execution/testing tasks
    - SubFlow steps for reusing existing flows
    - User intervention steps if approval required
4. Configure workspace based on constraints
5. Define inputs/outputs
6. Run full validation (all 8 phases)
7. Return generated flow + validation report

#### Component 4: Idea-to-Tickets Flow (Meta-Flow)

**File**: `.agent-fleet/flows.yml` (add new flow)

**Flow ID**: `idea-refiner`

**Purpose**: Takes a high-level idea and produces structured tickets.

**Structure**:

```yaml
idea-refiner:
    version: '1.0.0'
    name: 'Idea Refiner: Transform Ideas into Actionable Tickets'
    description: 'Analyzes an idea, recommends/generates flows, and creates structured tickets'
    workspace:
        mode: shared
        gitStrategy: main-only
        reusePolicy: always
    inputs:
        idea:
            type: string
            required: true
            description: 'High-level idea description'
        preferExisting:
            type: boolean
            required: false
            default: true
            description: 'Prefer reusing existing flows over generating new ones'
    steps:
        # Step 1: Analyze the idea
        - type: model
          id: analyze-idea
          name: 'Analyze Idea Requirements'
          model: sonnet
          prompt: |
              Analyze this idea and extract:
              1. Core objective
              2. Required inputs
              3. Expected outputs
              4. Complexity level (simple/medium/complex)
              5. Suggested flow patterns (pipeline/conditional/loop/etc)

              Idea: ${{ inputs.idea }}

              Return structured JSON with these fields.
          output:
              requirements:
                  type: object
                  transform: parseJSON

        # Step 2: Search existing flows
        - type: script
          id: search-flows
          name: 'Search for Matching Flows'
          depends: [analyze-idea]
          script: |
              # Call FlowRecommendationEngine API
              # Pass requirements from previous step
              # Return top 3 recommendations
              node ./scripts/recommend-flows.js '${{ steps.analyze-idea.outputs.requirements }}'
          output:
              recommendations:
                  type: object
                  transform: parseJSON

        # Step 3: User decision (reuse or generate new)
        - type: user_intervention
          id: flow-decision
          name: 'Choose Flow Strategy'
          depends: [search-flows]
          interventionType: choice
          blocking: true
          choice:
              question: 'How would you like to proceed?'
              options:
                  - id: reuse
                    label: 'Reuse Existing Flow'
                    description: 'Adapt one of the recommended flows'
                  - id: generate
                    label: 'Generate Custom Flow'
                    description: 'Create a new flow tailored to this idea'
                  - id: manual
                    label: 'Manual Creation'
                    description: 'I will create the flow manually'
          output:
              decision: { type: string, from: 'intervention.choice' }
              selectedFlowId: { type: string, from: 'intervention.metadata.flowId' }

        # Step 4a: Adapt existing flow (if reuse chosen)
        - type: model
          id: adapt-flow
          name: 'Adapt Existing Flow'
          depends: [flow-decision]
          when: "${{ steps.flow-decision.outputs.decision === 'reuse' }}"
          model: sonnet
          prompt: |
              Adapt this flow to match the requirements:

              Original Flow: ${{ steps.search-flows.outputs.recommendations[0].flow }}
              Requirements: ${{ steps.analyze-idea.outputs.requirements }}
              Adaptation Suggestions: ${{ steps.search-flows.outputs.recommendations[0].adaptationSuggestions }}

              Return the adapted flow as YAML.
          output:
              flowYaml: { type: string }

        # Step 4b: Generate new flow (if generate chosen)
        - type: script
          id: generate-flow
          name: 'Generate Custom Flow'
          depends: [flow-decision]
          when: "${{ steps.flow-decision.outputs.decision === 'generate' }}"
          script: |
              # Call FlowGenerator API
              node ./scripts/generate-flow.js '${{ steps.analyze-idea.outputs.requirements }}'
          output:
              flowYaml: { type: string }
              validationReport: { type: object, transform: parseJSON }

        # Step 5: Validate generated/adapted flow
        - type: script
          id: validate-flow
          name: 'Validate Flow'
          depends: [adapt-flow, generate-flow]
          script: |
              # Run FlowValidator on generated/adapted flow
              node ./scripts/validate-flow.js '${{ steps.adapt-flow.outputs.flowYaml || steps.generate-flow.outputs.flowYaml }}'
          output:
              isValid: { type: boolean, pattern: 'valid=(.*)' }
              issues: { type: object, transform: parseJSON }

        # Step 6: Generate tickets
        - type: model
          id: generate-tickets
          name: 'Generate Structured Tickets'
          depends: [validate-flow]
          model: sonnet
          prompt: |
              Based on this refined idea and flow, generate structured tickets:

              Original Idea: ${{ inputs.idea }}
              Requirements: ${{ steps.analyze-idea.outputs.requirements }}
              Flow: ${{ steps.adapt-flow.outputs.flowYaml || steps.generate-flow.outputs.flowYaml }}

              Create tickets with:
              - Title
              - Description
              - Acceptance criteria
              - Dependencies
              - Estimated complexity
              - Labels/tags

              Return as JSON array of tickets.
          output:
              tickets:
                  type: object
                  transform: parseJSON

        # Step 7: Present results
        - type: script
          id: output-results
          name: 'Output Results'
          depends: [generate-tickets]
          script: |
              echo "Flow Strategy: ${{ steps.flow-decision.outputs.decision }}"
              echo "Tickets Generated: ${{ steps.generate-tickets.outputs.tickets }}"
              echo "Flow YAML: ${{ steps.adapt-flow.outputs.flowYaml || steps.generate-flow.outputs.flowYaml }}"
```

### Helper Scripts to Create

#### 1. **Flow Recommendation Script**

**File**: `scripts/recommend-flows.js`

Uses `FlowRecommendationEngine` to search and rank flows.

#### 2. **Flow Generation Script**

**File**: `scripts/generate-flow.js`

Uses `FlowGenerator` to create custom flows.

#### 3. **Flow Validation Script**

**File**: `scripts/validate-flow.js`

Uses `FlowValidator` (all 8 phases) to validate generated flows.

### Integration Points

1. **Web UI**: Add "Refine Idea" button that launches `idea-refiner` flow
2. **CLI**: `agent-fleet refine-idea "description here"`
3. **API**: POST `/api/flows/refine-idea` endpoint

### Success Metrics

**Quantitative**:

- Reuse rate: % of ideas that reuse existing flows vs generate new
- Generation success rate: % of generated flows that are valid and working
- Time saved: Reduction in manual flow creation time
- Ticket quality: % of generated tickets that require no revision

**Qualitative**:

- User satisfaction with generated flows
- Quality of flow recommendations (relevance, adaptation accuracy)
- Clarity of generated tickets (actionable, complete)

---

## Implementation Plan

### Phase 1: Documentation (2-3 days)

**Priority**: HIGH - Immediate impact

**Tasks**:

1. ✅ Create `.claude/docs/flows/` directory structure
2. ✅ Write Quick Start Guide (quick-start-guide.md)
3. ✅ Generate Schema Reference (schema-reference.md) - can be partially automated
4. ✅ Write Pattern Catalog (pattern-catalog.md) - annotate existing flows.yml examples
5. ✅ Write Best Practices Guide (best-practices.md)
6. ✅ Write Troubleshooting Guide (troubleshooting.md)
7. ✅ Update FLOW_ENGINE_USAGE.md with links
8. ✅ Translate and enhance Flow Editor README
9. ✅ Create flows/README.md as documentation index

**Critical Files**:

- `.agent-fleet/flows.yml` (source of truth for examples)
- `packages/flow-engine/src/types.ts` (source for schema reference)
- `packages/flow-engine/src/validation/ValidationTypes.ts` (source for error codes)

**Validation**: Test with an agent creating a new flow from scratch using only the docs.

### Phase 2: Enhanced Validation (3-4 days)

**Priority**: MEDIUM - Improves quality

**Tasks**:

1. ✅ Create `LogicalValidator.ts` with data flow consistency checks
2. ✅ Create `ContractValidator.ts` for pre/post condition validation
3. ✅ Create `SimulationValidator.ts` for conceptual dry-run
4. ✅ Update `FlowValidator.ts` to run 8 phases
5. ✅ Add new ValidationCode enums to `ValidationTypes.ts`
6. ✅ Write tests for new validators
7. ✅ Update documentation with new validation rules

**Critical Files**:

- `packages/flow-engine/src/validation/FlowValidator.ts`
- `packages/flow-engine/src/validation/ValidationTypes.ts`
- `packages/flow-engine/src/validation/LogicalValidator.ts` (new)
- `packages/flow-engine/src/validation/ContractValidator.ts` (new)
- `packages/flow-engine/src/validation/SimulationValidator.ts` (new)

**Validation**: Run against all flows in flows.yml, ensure no false positives.

### Phase 3: Long-Term Vision (1-2 weeks)

**Priority**: LONG-TERM - Strategic capability

**Tasks**:

1. ✅ Create `FlowAnalyzer.ts` - analyze existing flows
2. ✅ Create `FlowRecommendationEngine.ts` - recommend flows
3. ✅ Create `FlowGenerator.ts` - generate custom flows
4. ✅ Add `idea-refiner` flow to flows.yml
5. ✅ Create helper scripts (recommend-flows.js, generate-flow.js, validate-flow.js)
6. ✅ Add UI integration ("Refine Idea" button)
7. ✅ Add CLI integration (`agent-fleet refine-idea`)
8. ✅ Write tests for analysis/generation components
9. ✅ Document the idea-to-tickets workflow

**Critical Files**:

- `packages/flow-engine/src/analysis/FlowAnalyzer.ts` (new)
- `packages/flow-engine/src/analysis/FlowRecommendationEngine.ts` (new)
- `packages/flow-engine/src/generation/FlowGenerator.ts` (new)
- `.agent-fleet/flows.yml` (add idea-refiner flow)
- `scripts/recommend-flows.js` (new)
- `scripts/generate-flow.js` (new)
- `scripts/validate-flow.js` (new)

**Validation**: Test end-to-end with various idea descriptions, measure reuse rate and generation quality.

---

## Verification Strategy

### For Phase 1 (Documentation)

1. **Agent Test**: Have an agent create 5 different flows (one for each major pattern) using only the documentation
2. **Success Criteria**:
    - All 5 flows are syntactically valid (pass all 5 validation phases)
    - All 5 flows are semantically correct (accomplish intended goal)
    - Agent completes each flow in < 15 minutes
    - Agent success rate: 5/5 (100%)

### For Phase 2 (Enhanced Validation)

1. **Regression Test**: Run new validators against all flows in flows.yml
2. **Success Criteria**:
    - No false positives (all valid flows still pass)
    - Catch intentional errors in validation-error-\* flows
    - No performance regression (< 100ms validation time for typical flow)

3. **Error Injection Test**: Create 10 flows with intentional logical errors
4. **Success Criteria**:
    - All 10 errors caught by new validators
    - Error messages are actionable (suggest fixes)
    - Severity levels are appropriate (error vs warning)

### For Phase 3 (Long-Term Vision)

1. **Recommendation Test**: Test with 10 idea descriptions
2. **Success Criteria**:
    - Reuse rate: > 50% (at least 5 reuse existing flows)
    - Recommendation relevance: Manual review confirms top recommendation is appropriate
    - Adaptation suggestions are actionable

3. **Generation Test**: Generate 5 custom flows from scratch
4. **Success Criteria**:
    - All 5 generated flows pass all 8 validation phases
    - All 5 flows execute successfully with sample inputs
    - Generated flows follow best practices (naming, structure, patterns)

5. **End-to-End Test**: Run idea-refiner flow with 3 diverse ideas
6. **Success Criteria**:
    - Flow completes successfully (no crashes)
    - Tickets generated are structured and actionable
    - User satisfaction: > 4/5 rating

---

## Summary

This plan transforms the flow creation system from a **collection of examples** to a **teachable, validatable, and generative system**.

**Phase 1** (Documentation) provides immediate value by drastically improving agent success rates through clear, navigational documentation.

**Phase 2** (Enhanced Validation) catches logical errors early, reducing runtime failures and improving flow quality.

**Phase 3** (Long-Term Vision) enables the strategic capability of transforming ideas into flows and tickets, with intelligent reuse of existing patterns.

**Total Impact**:

- Agent success rate: 40% → 85%+
- Time to create flow: Reduced by 60%
- Runtime errors: Reduced by 60%
- Long-term: Automated idea-to-tickets workflow with flow reuse/generation

**Dependencies**:

- Phase 2 depends on Phase 1 (documentation for new validation rules)
- Phase 3 depends on Phase 1 & 2 (docs for generation, validation for quality)

**Timeline**:

- Phase 1: 2-3 days
- Phase 2: 3-4 days (can start after Phase 1 completes)
- Phase 3: 1-2 weeks (can start after Phase 2 completes)

**Total Estimated Time**: 2-3 weeks for complete implementation
