# Flow Pattern Catalog

Complete reference for workflow orchestration patterns in Agent Fleet.

## Table of Contents

1. [Linear Pipeline](#1-linear-pipeline)
2. [Diamond (Fork-Join)](#2-diamond-fork-join)
3. [Fan-Out](#3-fan-out)
4. [Fan-Out/Fan-In](#4-fan-outfan-in)
5. [Conditional Routing](#5-conditional-routing)
6. [Retry Loop](#6-retry-loop)
7. [Review Loop](#7-review-loop)
8. [Multi-Review with Skip](#8-multi-review-with-skip)
9. [ETL Pipeline](#9-etl-pipeline)
10. [Build Pipeline](#10-build-pipeline)
11. [SubFlow Composition](#11-subflow-composition)
12. [Recursive Flow](#12-recursive-flow)
13. [User Intervention](#13-user-intervention)

---

## 1. Linear Pipeline

**Pattern**: A → B → C

**Use When**:

- Sequential processing is required
- Each step depends on the previous step's output
- No parallel execution needed
- Simple data transformation chains

**Decision Criteria**:

- ✅ Steps must execute in strict order
- ✅ Data flows linearly from start to end
- ❌ No need for parallel processing
- ❌ No conditional branching required

### Visual Diagram

```
┌─────────┐      ┌───────────┐      ┌─────────┐
│Generate │─────▶│ Transform │─────▶│ Display │
│  Data   │      │   Data    │      │ Result  │
└─────────┘      └───────────┘      └─────────┘
   Step 1            Step 2            Step 3
  (seed*10)        (value*2)        (show final)
```

### Complete Example

```yaml
data-simple-pipeline:
    version: '1.0.0'
    name: 'Data Flow: Simple Pipeline'
    description: 'Linear data flow: generate → transform → display'
    workspace:
        mode: manual
        gitStrategy: any
        reusePolicy: always
    inputs:
        seed: string
    steps:
        # Step 1: Generate initial data
        - type: script
          id: generate
          name: 'Generate Data'
          script: |
              echo Input seed: ${{ inputs.seed }}
              set /a value=${{ inputs.seed }} * 10
              echo value=%value%
          output:
              value: { type: string, pattern: 'value=(.*)' }

        # Step 2: Transform the data
        - type: script
          id: transform
          name: 'Transform Data'
          depends: [generate]
          script: |
              echo Received: ${{ steps.generate.outputs.value }}
              set /a doubled=${{ steps.generate.outputs.value }} * 2
              echo doubled=%doubled%
          output:
              doubled: { type: string, pattern: 'doubled=(.*)' }

        # Step 3: Display final result
        - type: script
          id: display
          name: 'Display Result'
          depends: [transform]
          script: |
              echo Final result: ${{ steps.transform.outputs.doubled }}
              echo Original seed was ${{ inputs.seed }}, final value is ${{ steps.transform.outputs.doubled }}
```

### Key Concepts

1. **Sequential Dependency**: Each step explicitly depends on the previous one using `depends: [previous-step]`
2. **Data Flow**: Outputs from one step become inputs to the next via `${{ steps.stepId.outputs.fieldName }}`
3. **Output Patterns**: Use regex patterns to extract structured data from script output
4. **Input Variables**: Flow inputs are accessible via `${{ inputs.fieldName }}`

### Variations

**Multi-Output Pipeline**: One step produces multiple outputs used by different consumers

```yaml
# Step produces multiple outputs
- type: script
  id: calculate
  script: |
      set /a sum=${{ inputs.number }} + 100
      set /a product=${{ inputs.number }} * 5
      echo sum=%sum%
      echo product=%product%
  output:
      sum: { type: string, pattern: 'sum=(.*)' }
      product: { type: string, pattern: 'product=(.*)' }

# Different steps can use different outputs
- type: script
  id: use-sum
  depends: [calculate]
  script: echo Using sum: ${{ steps.calculate.outputs.sum }}
```

### Related Patterns

- [ETL Pipeline](#9-etl-pipeline) - Specialized linear pipeline for data processing
- [Build Pipeline](#10-build-pipeline) - CI/CD variant with testing stages

---

## 2. Diamond (Fork-Join)

**Pattern**: A → {B, C} → D

**Use When**:

- Need parallel processing with synchronized completion
- Two independent operations can run concurrently
- Results must be merged or compared
- Both branches must complete before proceeding

**Decision Criteria**:

- ✅ Independent parallel operations
- ✅ Both results needed for final step
- ✅ No order dependency between B and C
- ✅ Synchronization point required

### Visual Diagram

```
         ┌─────────┐
         │ Step A  │
         │ (Start) │
         └────┬────┘
              │
        ┌─────┴─────┐
        ▼           ▼
   ┌────────┐  ┌────────┐
   │ Step B │  │ Step C │
   │ (Left) │  │(Right) │
   └────┬───┘  └───┬────┘
        └─────┬─────┘
              ▼
         ┌────────┐
         │ Step D │
         │ (Join) │
         └────────┘
```

### Complete Example

```yaml
test-diamond:
    version: '1.0.0'
    name: 'Test: Diamond Pattern'
    description: 'Tests fork-join with diamond shape (A splits to B+C, then joins at D)'
    workspace:
        mode: manual
        gitStrategy: any
        reusePolicy: always
    statusTransitions:
        onSuccess: approved
        onFailure: todo
    inputs:
        message: string
    steps:
        # Root: A - Initialize the flow
        - type: script
          id: step-a
          name: 'Step A (Start)'
          script: |
              echo [A] Starting diamond flow: ${{ inputs.message }}
              ping localhost -n 2 >nul
              echo [A] Done!

        # Fork: B and C run in parallel
        - type: script
          id: step-b
          name: 'Step B (Left Branch)'
          depends: [step-a]
          script: |
              echo [B] Processing left branch...
              ping localhost -n 4 >nul
              echo [B] Left branch complete!

        - type: script
          id: step-c
          name: 'Step C (Right Branch)'
          depends: [step-a]
          script: |
              echo [C] Processing right branch...
              ping localhost -n 3 >nul
              echo [C] Right branch complete!

        # Join: D waits for both B and C
        - type: script
          id: step-d
          name: 'Step D (Join)'
          depends: [step-b, step-c]
          script: |
              echo [D] Merging results from B and C...
              ping localhost -n 2 >nul
              echo [D] Diamond flow complete!
```

### Key Concepts

1. **Parallel Execution**: Steps B and C both depend only on A, so they run concurrently
2. **Join Point**: Step D lists both B and C in its `depends` array, creating a synchronization barrier
3. **Timing Independence**: B and C can take different amounts of time; D waits for both
4. **Data Merging**: Join step can access outputs from both branches

### Variations

**Diamond with Data Flow**:

```yaml
steps:
    - type: script
      id: source
      script: |
          set /a base=${{ inputs.value }} * 2
          echo base=%base%
      output:
          base: { type: string, pattern: 'base=(.*)' }

    - type: script
      id: branch-a
      depends: [source]
      script: |
          set /a result=${{ steps.source.outputs.base }} + 50
          echo result=%result%
      output:
          result: { type: string, pattern: 'result=(.*)' }

    - type: script
      id: branch-b
      depends: [source]
      script: |
          set /a result=${{ steps.source.outputs.base }} * 3
          echo result=%result%
      output:
          result: { type: string, pattern: 'result=(.*)' }

    - type: script
      id: combine
      depends: [branch-a, branch-b]
      script: |
          set /a combined=${{ steps.branch-a.outputs.result }} + ${{ steps.branch-b.outputs.result }}
          echo combined=%combined%
      output:
          combined: { type: string, pattern: 'combined=(.*)' }
```

### Related Patterns

- [Fan-Out](#3-fan-out) - Fork without join
- [Fan-Out/Fan-In](#4-fan-outfan-in) - Multiple parallel branches with aggregation

---

## 3. Fan-Out

**Pattern**: A → {B, C, D}

**Use When**:

- Multiple independent operations after initialization
- No need to wait for all operations to complete
- Parallel execution for performance
- Operations don't need to be synchronized

**Decision Criteria**:

- ✅ Operations are independent
- ✅ No aggregation or merging needed
- ✅ Maximum parallelism desired
- ❌ Don't need to wait for all to complete

### Visual Diagram

```
         ┌─────────┐
         │ Step A  │
         │  (Init) │
         └────┬────┘
              │
     ┌────────┼────────┐
     ▼        ▼        ▼
┌─────────┐ ┌────┐ ┌──────┐
│ Step B  │ │ C  │ │  D   │
│Security │ │Lint│ │Tests │
└─────────┘ └────┘ └──────┘
  (9s)      (8s)    (15s)
```

### Complete Example

```yaml
test-fork:
    version: '1.0.0'
    name: 'Test: Fork Pattern'
    description: 'Tests parallel execution with 3-way fork (A splits to B+C+D)'
    workspace:
        mode: manual
        gitStrategy: any
        reusePolicy: always
    statusTransitions:
        onSuccess: approved
        onFailure: todo
    inputs:
        task: string
    steps:
        # Root: A - Initialize
        - type: script
          id: step-a
          name: 'Step A (Initialize)'
          script: |
              echo [A] Initializing fork flow: ${{ inputs.task }}
              ping localhost -n 2 >nul
              echo [A] Ready to fork into 3 parallel branches!

        # Fork: B, C, and D run in parallel with different durations
        - type: script
          id: step-b
          name: 'Step B (Security Audit)'
          depends: [step-a]
          script: |
              echo [B] Starting security audit...
              ping localhost -n 2 >nul
              echo [B] Phase 1: Scanning dependencies (3s)
              ping localhost -n 4 >nul
              echo [B] Phase 2: Checking vulnerabilities (4s)
              ping localhost -n 5 >nul
              echo [B] Phase 3: Generating report (2s)
              ping localhost -n 3 >nul
              echo [B] Security audit complete!

        - type: script
          id: step-c
          name: 'Step C (Code Linting)'
          depends: [step-a]
          script: |
              echo [C] Starting linting process...
              ping localhost -n 2 >nul
              echo [C] Phase 1: Loading rules (2s)
              ping localhost -n 3 >nul
              echo [C] Phase 2: Analyzing code (5s)
              ping localhost -n 6 >nul
              echo [C] Phase 3: Fixing auto-fixable issues (1s)
              ping localhost -n 2 >nul
              echo [C] Linting complete - no errors!

        - type: script
          id: step-d
          name: 'Step D (Test Suite)'
          depends: [step-a]
          script: |
              echo [D] Starting test suite...
              ping localhost -n 2 >nul
              echo [D] Phase 1: Setup test environment (3s)
              ping localhost -n 4 >nul
              echo [D] Phase 2: Running unit tests (6s)
              ping localhost -n 7 >nul
              echo [D] Phase 3: Running integration tests (4s)
              ping localhost -n 5 >nul
              echo [D] Phase 4: Cleanup (2s)
              ping localhost -n 3 >nul
              echo [D] All tests passed!
```

### Key Concepts

1. **True Parallelism**: All branches execute simultaneously, not sequentially
2. **No Join**: Flow completes when all branches complete, but there's no explicit join step
3. **Different Durations**: Each branch can take different amounts of time
4. **Independent Failure**: One branch can fail without affecting others (unless configured otherwise)

### Variations

**Fan-Out with Partial Dependencies**:

```yaml
steps:
    - type: script
      id: init
      script: echo Initializing...

    # Some branches independent
    - type: script
      id: branch-a
      depends: [init]
      script: echo Branch A

    - type: script
      id: branch-b
      depends: [init]
      script: echo Branch B

    # This branch depends on branch-a but not branch-b
    - type: script
      id: branch-c
      depends: [init, branch-a]
      script: echo Branch C (after A)
```

### Related Patterns

- [Diamond (Fork-Join)](#2-diamond-fork-join) - Fork with synchronization
- [Fan-Out/Fan-In](#4-fan-outfan-in) - Fork with aggregation

---

## 4. Fan-Out/Fan-In

**Pattern**: A → {B, C, D, E} → F

**Use When**:

- Multiple parallel operations need aggregation
- Complex statistical or analytical processing
- Independent computations that contribute to a final result
- Parallel processing with result consolidation

**Decision Criteria**:

- ✅ Multiple independent parallel operations
- ✅ Results need to be aggregated or summarized
- ✅ Can create intermediate aggregation steps
- ✅ Final step needs all parallel results

### Visual Diagram

```
         ┌─────────┐
         │ Prepare │
         │ Dataset │
         └────┬────┘
              │
     ┌────────┼────────┬────────┐
     ▼        ▼        ▼        ▼
┌─────────┐ ┌────┐ ┌────┐ ┌────────┐
│Calculate│ │Find│ │Find│ │Calculate│
│ Average │ │Min │ │Max │ │ StdDev │
└────┬────┘ └─┬──┘ └─┬──┘ └───┬────┘
     │        └──┬───┘         │
     │           ▼             │
     │      ┌─────────┐        │
     │      │Calculate│        │
     │      │  Range  │        │
     │      └────┬────┘        │
     └───────────┼─────────────┘
                 ▼
          ┌─────────────┐
          │  Generate   │
          │   Report    │
          └─────────────┘
```

### Complete Example

```yaml
data-fanout-fanin:
    version: '1.0.0'
    name: 'Data Flow: Fan-Out/Fan-In'
    description: 'Complex pattern with multiple parallel transformations and aggregation'
    workspace:
        mode: manual
        gitStrategy: any
        reusePolicy: always
    inputs:
        dataset: string
    steps:
        # Initial preparation
        - type: script
          id: prepare
          name: 'Prepare Dataset'
          script: |
              echo Preparing dataset: ${{ inputs.dataset }}
              set /a count=100
              set /a total=5000
              echo count=%count%
              echo total=%total%
          output:
              count: { type: string, pattern: 'count=(.*)' }
              total: { type: string, pattern: 'total=(.*)' }

        # Fan-out: Multiple parallel processors
        - type: script
          id: calc-average
          name: 'Calculate Average'
          depends: [prepare]
          script: |
              echo Calculating average from total=${{ steps.prepare.outputs.total }}, count=${{ steps.prepare.outputs.count }}
              set /a avg=${{ steps.prepare.outputs.total }} / ${{ steps.prepare.outputs.count }}
              echo average=%avg%
          output:
              average: { type: string, pattern: 'average=(.*)' }

        - type: script
          id: calc-min
          name: 'Find Minimum'
          depends: [prepare]
          script: |
              echo Finding min in dataset
              set /a min=5
              echo min=%min%
          output:
              min: { type: string, pattern: 'min=(.*)' }

        - type: script
          id: calc-max
          name: 'Find Maximum'
          depends: [prepare]
          script: |
              echo Finding max in dataset
              set /a max=95
              echo max=%max%
          output:
              max: { type: string, pattern: 'max=(.*)' }

        - type: script
          id: calc-stddev
          name: 'Calculate Std Dev'
          depends: [prepare]
          script: |
              echo Calculating standard deviation
              set /a stddev=15
              echo stddev=%stddev%
          output:
              stddev: { type: string, pattern: 'stddev=(.*)' }

        # Intermediate: Use some results
        - type: script
          id: calc-range
          name: 'Calculate Range'
          depends: [calc-min, calc-max]
          script: |
              echo Range calculation: max=${{ steps.calc-max.outputs.max }}, min=${{ steps.calc-min.outputs.min }}
              set /a range=${{ steps.calc-max.outputs.max }} - ${{ steps.calc-min.outputs.min }}
              echo range=%range%
          output:
              range: { type: string, pattern: 'range=(.*)' }

        # Fan-in: Aggregate all statistics
        - type: script
          id: generate-report
          name: 'Generate Statistics Report'
          depends: [calc-average, calc-range, calc-stddev]
          script: |
              echo === Statistics Report ===
              echo Dataset: ${{ inputs.dataset }}
              echo Count: ${{ steps.prepare.outputs.count }}
              echo Total: ${{ steps.prepare.outputs.total }}
              echo Average: ${{ steps.calc-average.outputs.average }}
              echo Min: ${{ steps.calc-min.outputs.min }}
              echo Max: ${{ steps.calc-max.outputs.max }}
              echo Range: ${{ steps.calc-range.outputs.range }}
              echo StdDev: ${{ steps.calc-stddev.outputs.stddev }}
              echo report=generated
          output:
              report: { type: string, pattern: 'report=(.*)' }
```

### Key Concepts

1. **Multi-Level Aggregation**: Can have intermediate aggregation steps (calc-range) before final aggregation
2. **Selective Dependencies**: Final step only depends on what it needs, not necessarily all parallel steps
3. **Complex Data Flow**: Steps can access outputs from any ancestor in the dependency graph
4. **Transitive Dependencies**: generate-report implicitly depends on calc-min and calc-max through calc-range

### Variations

**Two-Stage Fan-Out/Fan-In**:

```yaml
steps:
    - id: init
      script: echo Initialize

    # First fan-out
    - id: process-a
      depends: [init]
      script: echo Process A
    - id: process-b
      depends: [init]
      script: echo Process B

    # First fan-in
    - id: merge-1
      depends: [process-a, process-b]
      script: echo Merge 1

    # Second fan-out
    - id: validate-a
      depends: [merge-1]
      script: echo Validate A
    - id: validate-b
      depends: [merge-1]
      script: echo Validate B

    # Final fan-in
    - id: final
      depends: [validate-a, validate-b]
      script: echo Final
```

### Related Patterns

- [Diamond (Fork-Join)](#2-diamond-fork-join) - Simplified version with two branches
- [Build Pipeline](#10-build-pipeline) - Specialized fan-out/fan-in for CI/CD

---

## 5. Conditional Routing

**Pattern**: A → (condition) → {B | C | D}

**Use When**:

- Different processing paths based on data values
- Business logic requires branching
- Need to skip certain steps based on conditions
- Dynamic workflow routing

**Decision Criteria**:

- ✅ Multiple possible execution paths
- ✅ Path selection based on runtime data
- ✅ Only one path should execute
- ✅ Conditional logic can be expressed in `when` clauses

### Visual Diagram

```
       ┌──────┐
       │Check │
       │Value │
       └───┬──┘
           │
    ┌──────┼──────┐
    ▼      ▼      ▼
┌────────────────────┐
│ when: path='high'  │
│  Process High      │ (value * 100)
│  (value > 50)      │
└────────────────────┘

┌────────────────────┐
│ when: path='medium'│
│  Process Medium    │ (value * 10)
│  (20 < value ≤ 50) │
└────────────────────┘

┌────────────────────┐
│ when: path='low'   │
│  Process Low       │ (value * 2)
│  (value ≤ 20)      │
└────────────────────┘
           │
           ▼
       ┌────────┐
       │Finalize│
       └────────┘
```

### Complete Example

```yaml
data-conditional:
    version: '1.0.0'
    name: 'Data Flow: Conditional Processing'
    description: 'Data flows through different paths based on conditions'
    workspace:
        mode: manual
        gitStrategy: any
        reusePolicy: always
    inputs:
        value: string
    steps:
        # Decision step: determine which path to take
        - type: script
          id: check
          name: 'Check Value'
          script: |
              echo Checking value: ${{ inputs.value }}
              set /a num=${{ inputs.value }}
              if %num% GTR 50 (
                echo path=high
                set /a category=1
              ) else if %num% GTR 20 (
                echo path=medium
                set /a category=2
              ) else (
                echo path=low
                set /a category=3
              )
              echo category=%category%
          output:
              path: { type: string, pattern: 'path=(.*)' }
              category: { type: string, pattern: 'category=(.*)' }

        # Conditional paths: Only one executes based on 'when' clause
        - type: script
          id: process-high
          name: 'High Value Processing'
          depends: [check]
          when: "${{ steps.check.outputs.path === 'high' }}"
          script: |
              echo Processing HIGH value
              set /a result=${{ inputs.value }} * 100
              echo result=%result%
          output:
              result: { type: string, pattern: 'result=(.*)' }

        - type: script
          id: process-medium
          name: 'Medium Value Processing'
          depends: [check]
          when: "${{ steps.check.outputs.path === 'medium' }}"
          script: |
              echo Processing MEDIUM value
              set /a result=${{ inputs.value }} * 10
              echo result=%result%
          output:
              result: { type: string, pattern: 'result=(.*)' }

        - type: script
          id: process-low
          name: 'Low Value Processing'
          depends: [check]
          when: "${{ steps.check.outputs.path === 'low' }}"
          script: |
              echo Processing LOW value
              set /a result=${{ inputs.value }} * 2
              echo result=%result%
          output:
              result: { type: string, pattern: 'result=(.*)' }

        # Finalize step: runs regardless of which path was taken
        - type: script
          id: finalize
          name: 'Finalize Processing'
          depends: [check]
          script: |
              echo Finalizing for category: ${{ steps.check.outputs.category }}
              echo Final processing complete
```

### Key Concepts

1. **When Clause**: Uses JavaScript expression syntax to evaluate conditions
2. **Step Skipping**: Steps with false `when` conditions are skipped entirely
3. **Common Dependency**: All conditional branches depend on the decision step
4. **Final Step**: Can depend only on the decision step, not conditional branches
5. **Expression Context**: Can reference inputs and step outputs in `when` expressions

### Variations

**Nested Conditionals**:

```yaml
steps:
    - id: check-type
      script: echo type=premium
      output:
          type: { type: string, pattern: 'type=(.*)' }

    - id: check-status
      depends: [check-type]
      when: "${{ steps.check-type.outputs.type === 'premium' }}"
      script: echo status=active
      output:
          status: { type: string, pattern: 'status=(.*)' }

    - id: special-processing
      depends: [check-status]
      when: "${{ steps.check-status.outputs.status === 'active' }}"
      script: echo Processing premium active user
```

**Multiple Conditions**:

```yaml
- type: script
  id: process
  depends: [check-a, check-b]
  when: "${{ steps.check-a.outputs.valid === 'true' && steps.check-b.outputs.ready === 'true' }}"
  script: echo Process when both conditions met
```

### Related Patterns

- [Retry Loop](#6-retry-loop) - Conditional repetition
- [Review Loop](#7-review-loop) - Conditional feedback with retry

---

## 6. Retry Loop

**Pattern**: A → B (retry on failure)

**Use When**:

- Operations may fail transiently
- Automatic retry logic needed
- Testing scenarios that should eventually succeed
- Network or external service operations

**Decision Criteria**:

- ✅ Operation might fail temporarily
- ✅ Retrying could lead to success
- ✅ Need to limit retry attempts
- ✅ Can detect failure conditions programmatically

### Visual Diagram

```
┌───────────┐
│ Implement │
└─────┬─────┘
      │
      ▼
┌───────────┐
│   Test    │
└─────┬─────┘
      │
   ┌──┴──┐
   │ OK? │
   └──┬──┘
      │
   ┌──┴──────────┐
   │             │
   ▼ YES         ▼ NO (iter < 3)
┌──────┐    ┌─────────┐
│ Done │    │  goto:  │
└──────┘    │implement│
            └────┬────┘
                 │
                 └──────┐
                        │
            ┌───────────▼────────┐
            │ maxIterations: 3   │
            │ Iteration tracking │
            └────────────────────┘
```

### Complete Example

```yaml
test-loop:
    version: '1.0.0'
    name: 'Test: Feedback Loop (Retry Pattern)'
    description: 'Tests onFailure.goto with a test step that fails twice then succeeds'
    workspace:
        mode: manual
        gitStrategy: any
        reusePolicy: always
    statusTransitions:
        onSuccess: approved
        onFailure: todo
    inputs:
        message: string
    steps:
        # Step 1: implement (always succeeds)
        - type: script
          id: implement
          name: 'Implement Feature'
          script: |
              echo [implement] Starting implementation: ${{ inputs.message }}
              ping localhost -n 2 >nul
              echo [implement] Writing code...
              ping localhost -n 3 >nul
              echo [implement] Implementation complete!

        # Step 2: test (fails first 2 times, succeeds on 3rd)
        - type: script
          id: test
          name: 'Run Tests'
          depends: [implement]
          onFailure:
              goto: implement
              maxIterations: 3
          script: |
              echo [test] Running test suite...
              ping localhost -n 2 >nul
              if not exist test-iter1.tmp (
                echo First iteration - FAIL
                echo. > test-iter1.tmp
                exit /b 1
              ) else if not exist test-iter2.tmp (
                echo Second iteration - FAIL
                echo. > test-iter2.tmp
                exit /b 1
              ) else (
                echo Third iteration - PASS
                del test-iter1.tmp test-iter2.tmp 2>nul
                exit /b 0
              )

        # Step 3: done (only runs after tests pass)
        - type: script
          id: done
          name: 'Complete'
          depends: [test]
          script: |
              echo [done] All steps completed successfully! Flow finished.
```

### Key Concepts

1. **onFailure Configuration**: Defines retry behavior when step fails
2. **goto Target**: Specifies which step to jump back to (can be self or earlier step)
3. **maxIterations**: Prevents infinite loops by limiting retry attempts
4. **Iteration Tracking**: System automatically tracks iteration count
5. **Exit Conditions**: Step must eventually succeed or exhaust retries
6. **State Persistence**: Can use temporary files to track retry state

### Variations

**Self-Retry (same step)**:

```yaml
- type: script
  id: api-call
  name: 'Call External API'
  onFailure:
      goto: api-call
      maxIterations: 5
  script: |
      # Attempt API call
      # Fail with exit code 1 if transient error
      # Succeed with exit code 0
```

**Retry with Backoff**:

```yaml
- type: script
  id: implement
  script: echo Implementing...

- type: script
  id: test
  depends: [implement]
  onFailure:
      goto: wait
      maxIterations: 3
  script: |
      echo Testing...
      # Test logic
      exit /b 1

- type: script
  id: wait
  depends: [test]
  script: |
      echo Waiting before retry...
      ping localhost -n 5 >nul

- type: script
  id: retry-implement
  depends: [wait]
  script: echo Retrying implementation...
```

### Related Patterns

- [Review Loop](#7-review-loop) - Retry with human feedback
- [Conditional Routing](#5-conditional-routing) - Decision-based branching

---

## 7. Review Loop

**Pattern**: implement → review → (feedback) → implement

**Use When**:

- Human review and approval needed
- Code review workflows
- Quality gates requiring feedback
- Iterative refinement processes

**Decision Criteria**:

- ✅ Human judgment required
- ✅ Feedback loop improves quality
- ✅ Changes can be made based on feedback
- ✅ Limited iterations acceptable

### Visual Diagram

```
┌───────────┐
│ Implement │◀────────┐
│  Feature  │         │
└─────┬─────┘         │
      │               │
      ▼               │
┌───────────┐         │
│   Review  │         │
│   Code    │         │
└─────┬─────┘         │
      │               │
   ┌──┴──────┐        │
   │Approved?│        │
   └──┬──────┘        │
      │               │
   ┌──┴──────────┐    │
   │             │    │
   ▼ YES         ▼ NO │
┌──────┐    ┌─────────┤
│Deploy│    │ Feedback│
└──────┘    │  goto:  │
            │implement│
            └─────────┘
```

### Complete Example

```yaml
test-review-loop:
    version: '1.0.0'
    name: 'Test: Review Feedback Loop'
    description: 'Tests onFailure.goto with a review step that fails once then approves'
    workspace:
        mode: manual
        gitStrategy: any
        reusePolicy: always
    statusTransitions:
        onSuccess: approved
        onFailure: changes_requested
    inputs:
        feature: string
    steps:
        # Step 1: implement
        - type: script
          id: implement
          name: 'Implement Feature'
          script: |
              echo [implement] Implementing feature: ${{ inputs.feature }}
              ping localhost -n 2 >nul
              echo [implement] Adding new code...
              ping localhost -n 2 >nul
              if exist review-feedback.tmp (
                echo [implement] Applying feedback from review
                ping localhost -n 2 >nul
                del review-feedback.tmp 2>nul
              )
              echo [implement] Implementation ready for review

        # Step 2: review (fails first time with feedback, passes second time)
        - type: script
          id: review
          name: 'Code Review'
          depends: [implement]
          onFailure:
              goto: implement
              maxIterations: 2
          script: |
              echo [review] Starting code review...
              ping localhost -n 2 >nul
              if not exist review-iter1.tmp (
                echo [review] CHANGES REQUESTED: Please add error handling
                echo. > review-iter1.tmp
                echo. > review-feedback.tmp
                exit /b 1
              ) else (
                echo [review] Code review APPROVED! All issues addressed
                del review-iter1.tmp 2>nul
                exit /b 0
              )

        # Step 3: deploy (only runs after review passes)
        - type: script
          id: deploy
          name: 'Deploy to Production'
          depends: [review]
          script: |
              echo [deploy] Deploying approved code to production...
              ping localhost -n 3 >nul
              echo [deploy] Deployment successful!
```

### Key Concepts

1. **Feedback Mechanism**: Review step can provide feedback via output or side effects
2. **Iterative Improvement**: Implementation step can check for and apply feedback
3. **State Management**: Use temporary files or outputs to track review state
4. **Approval Gate**: Deployment only proceeds after successful review
5. **Limited Iterations**: Prevents endless revision cycles

### Variations

**Review with Explicit Feedback Output**:

```yaml
- type: script
  id: implement
  script: |
      echo Implementing...
      if exist feedback.txt (
        echo Applying feedback: $(cat feedback.txt)
        rm feedback.txt
      )
      echo code=implementation
  output:
      code: { type: string, pattern: 'code=(.*)' }

- type: script
  id: review
  depends: [implement]
  onFailure:
      goto: implement
      maxIterations: 3
  script: |
      echo Reviewing: ${{ steps.implement.outputs.code }}
      if [ "${{ steps.implement.outputs.code }}" != "perfect" ]; then
        echo feedback=Add error handling > feedback.txt
        exit 1
      fi
      exit 0
```

### Related Patterns

- [Retry Loop](#6-retry-loop) - Automatic retry without feedback
- [Multi-Review with Skip](#8-multi-review-with-skip) - Multiple reviewers

---

## 8. Multi-Review with Skip

**Pattern**: implement → {review1, review2, review3} → deploy

**Use When**:

- Multiple review types needed (security, quality, usability)
- Some reviews only need to run once
- Different reviews have different retry behavior
- Complex approval workflows

**Decision Criteria**:

- ✅ Multiple independent review processes
- ✅ Some reviews shouldn't re-run on iteration
- ✅ Different retry limits per review
- ✅ Want to reset iteration counts on success

### Visual Diagram

```
┌───────────┐
│ Implement │◀───────────────────┐
└─────┬─────┘                    │
      │                          │
   ┌──┴───────────────┐          │
   ▼                  ▼          │
┌──────────┐    ┌──────────┐    │
│  Quality │    │Consistency│   │
│  Review  │    │  Review   │   │
│(skip loop)│   │(skip loop)│   │
└──────────┘    └──────────┘    │
                                 │
   ▼                  ▼          │
┌──────────┐    ┌──────────┐    │
│ Security │    │ Usability │   │
│  Review  │    │  Review   │   │
│ (retry)  │    │  (retry)  │   │
└────┬─────┘    └─────┬─────┘   │
     │                │          │
     └────┬───────────┘          │
          │ Any FAIL?            │
          ├──────────────────────┘
          │ All PASS
          ▼
     ┌─────────┐
     │  Deploy │
     └─────────┘
```

### Complete Example

```yaml
test-multi-review:
    version: '1.0.0'
    name: 'Test: Multi-Review with Skip and Reset'
    description: 'Tests skipOnLoop and resetOnSuccess with parallel review steps'
    workspace:
        mode: manual
        gitStrategy: any
        reusePolicy: always
    statusTransitions:
        onSuccess: approved
        onFailure: changes_requested
    inputs:
        feature: string
    steps:
        # Step 1: implement
        - type: script
          id: implement
          name: 'Implement Feature'
          script: |
              echo [implement] Implementing feature: ${{ inputs.feature }}
              ping localhost -n 2 >nul
              echo [implement] Code complete

        # Step 2-5: Multiple reviews run in parallel

        # Quality review only runs once (skipOnLoop=true)
        - type: script
          id: review-quality
          name: 'Code Quality Review'
          depends: [implement]
          skipOnLoop: true
          script: |
              echo [quality] Checking code quality...
              ping localhost -n 2 >nul
              echo [quality] Quality standards met!

        # Security review can trigger loop, with resetOnSuccess
        - type: script
          id: review-security
          name: 'Security Review'
          depends: [implement]
          onFailure:
              goto: implement
              maxIterations: 2
              resetOnSuccess: true
          script: |
              echo [security] Running security audit...
              ping localhost -n 2 >nul
              if not exist security-pass.tmp (
                echo [security] SECURITY ISSUE FOUND - Fix required
                echo. > security-pass.tmp
                exit /b 1
              ) else (
                echo [security] Security approved!
                del security-pass.tmp 2>nul
                exit /b 0
              )

        # Consistency review only runs once (skipOnLoop=true)
        - type: script
          id: review-consistency
          name: 'Code Consistency Review'
          depends: [implement]
          skipOnLoop: true
          script: |
              echo [consistency] Checking code consistency...
              ping localhost -n 2 >nul
              echo [consistency] Consistent with project standards!

        # Usability review can trigger loop, with resetOnSuccess
        - type: script
          id: review-usability
          name: 'Usability Review'
          depends: [implement]
          onFailure:
              goto: implement
              maxIterations: 2
              resetOnSuccess: true
          script: |
              echo [usability] Reviewing user experience...
              ping localhost -n 2 >nul
              if not exist usability-pass.tmp (
                echo [usability] USABILITY ISSUE - Improve UX
                echo. > usability-pass.tmp
                exit /b 1
              ) else (
                echo [usability] UX approved!
                del usability-pass.tmp 2>nul
                exit /b 0
              )

        # Step 6: deploy (waits for all reviews)
        - type: script
          id: deploy
          name: 'Deploy to Production'
          depends: [review-quality, review-security, review-consistency, review-usability]
          script: |
              echo [deploy] All reviews passed! Deploying to production...
              ping localhost -n 3 >nul
              echo [deploy] Deployment complete!
```

### Key Concepts

1. **skipOnLoop**: Step only runs on first iteration, skipped on subsequent loops
2. **resetOnSuccess**: Iteration counter resets if step succeeds, allowing fresh attempts
3. **Parallel Reviews**: All reviews run concurrently for first iteration
4. **Mixed Behavior**: Some reviews skip on loop, others can trigger loops
5. **Multiple Gatekeepers**: Any review can block deployment by triggering retry

### Variations

**Hierarchical Reviews**:

```yaml
steps:
    - id: implement
      script: echo Implement

    # First tier reviews (must pass first)
    - id: syntax-check
      depends: [implement]
      skipOnLoop: true
      script: echo Syntax check

    - id: security-scan
      depends: [implement]
      onFailure:
          goto: implement
          maxIterations: 2
      script: echo Security scan

    # Second tier reviews (only run if first tier passes)
    - id: code-review
      depends: [syntax-check, security-scan]
      onFailure:
          goto: implement
          maxIterations: 3
      script: echo Code review

    - id: deploy
      depends: [code-review]
      script: echo Deploy
```

### Related Patterns

- [Review Loop](#7-review-loop) - Single review with feedback
- [Fan-Out/Fan-In](#4-fan-outfan-in) - Parallel processing with aggregation

---

## 9. ETL Pipeline

**Pattern**: Extract → Transform → Load

**Use When**:

- Data integration workflows
- Need to move data between systems
- Data cleansing and enrichment
- Structured data processing

**Decision Criteria**:

- ✅ Clear extract, transform, load phases
- ✅ Data validation needed
- ✅ Multiple transformation steps
- ✅ Data quality checks required

### Visual Diagram

```
┌─────────┐    ┌───────┐    ┌────────┐    ┌────────┐    ┌──────┐
│ Extract │───▶│ Parse │───▶│Validate│───▶│ Enrich │───▶│ Load │
│  Data   │    │Fields │    │  Data  │    │  Data  │    │  to  │
│         │    │       │    │        │    │        │    │  DB  │
└─────────┘    └───────┘    └────────┘    └────────┘    └──────┘
   (read)      (split)      (check)       (augment)    (persist)

  raw_data    user_id         valid        credits
           ───┬──────        status      ───┬───────
              │              tier           │
              │                             │
              └─────────────┬───────────────┘
                            ▼
                    All fields combined
                    in final load step
```

### Complete Example

```yaml
data-etl:
    version: '1.0.0'
    name: 'Data Flow: ETL Pattern'
    description: 'Extract, Transform, Load pattern with multiple transformations'
    workspace:
        mode: manual
        gitStrategy: any
        reusePolicy: always
    inputs:
        source: string
    steps:
        # EXTRACT: Get raw data
        - type: script
          id: extract
          name: 'Extract Data'
          script: |
              echo Extracting from: ${{ inputs.source }}
              echo raw_data=user123,active,premium
          output:
              raw_data: { type: string, pattern: 'raw_data=(.*)' }

        # TRANSFORM: Parse into structured fields
        - type: script
          id: parse
          name: 'Parse Fields'
          depends: [extract]
          script: |
              echo Parsing: ${{ steps.extract.outputs.raw_data }}
              echo user_id=user123
              echo status=active
              echo tier=premium
          output:
              user_id: { type: string, pattern: 'user_id=(.*)' }
              status: { type: string, pattern: 'status=(.*)' }
              tier: { type: string, pattern: 'tier=(.*)' }

        # TRANSFORM: Validate data quality
        - type: script
          id: validate
          name: 'Validate Data'
          depends: [parse]
          script: |
              echo Validating user: ${{ steps.parse.outputs.user_id }}
              echo Status: ${{ steps.parse.outputs.status }}
              echo Tier: ${{ steps.parse.outputs.tier }}
              echo valid=true
          output:
              valid: { type: string, pattern: 'valid=(.*)' }

        # TRANSFORM: Enrich with additional data
        - type: script
          id: enrich
          name: 'Enrich Data'
          depends: [validate]
          script: |
              echo Enriching: ${{ steps.parse.outputs.user_id }}
              echo credits=1000
              echo expiry=2025-12-31
          output:
              credits: { type: string, pattern: 'credits=(.*)' }
              expiry: { type: string, pattern: 'expiry=(.*)' }

        # LOAD: Persist to destination
        - type: script
          id: load
          name: 'Load to Database'
          depends: [enrich]
          script: |
              echo Loading to database:
              echo - User: ${{ steps.parse.outputs.user_id }}
              echo - Status: ${{ steps.parse.outputs.status }}
              echo - Tier: ${{ steps.parse.outputs.tier }}
              echo - Credits: ${{ steps.enrich.outputs.credits }}
              echo - Expiry: ${{ steps.enrich.outputs.expiry }}
              echo loaded=success
```

### Key Concepts

1. **Separation of Concerns**: Each phase (E, T, L) has distinct responsibilities
2. **Data Quality**: Validation step ensures data integrity
3. **Enrichment**: Augment source data with additional context
4. **Linear Flow**: ETL typically follows strict sequential order
5. **Output Preservation**: Each step's outputs remain accessible to downstream steps

### Variations

**Parallel Transform**:

```yaml
steps:
    - id: extract
      script: echo raw_data=data
      output:
          raw_data: { type: string }

    # Multiple parallel transformations
    - id: clean
      depends: [extract]
      script: echo Cleaning data
      output:
          cleaned: { type: string }

    - id: normalize
      depends: [extract]
      script: echo Normalizing data
      output:
          normalized: { type: string }

    - id: dedupe
      depends: [extract]
      script: echo Removing duplicates
      output:
          deduped: { type: string }

    # Merge transformed results
    - id: merge
      depends: [clean, normalize, dedupe]
      script: echo Merging transformations

    - id: load
      depends: [merge]
      script: echo Loading to database
```

**ETL with Error Handling**:

```yaml
steps:
    - id: extract
      onFailure:
          goto: extract
          maxIterations: 3
      script: curl https://api.example.com/data

    - id: transform
      depends: [extract]
      script: |
          # Transform with validation
          if [ invalid ]; then exit 1; fi

    - id: load
      depends: [transform]
      onFailure:
          goto: load
          maxIterations: 5
      script: psql -c "INSERT INTO table VALUES (...)"
```

### Related Patterns

- [Linear Pipeline](#1-linear-pipeline) - Simplified sequential processing
- [Fan-Out/Fan-In](#4-fan-outfan-in) - Parallel transformation stages

---

## 10. Build Pipeline

**Pattern**: Checkout → Install → Compile → {Test, Analyze} → Package → Publish

**Use When**:

- CI/CD workflows
- Software build automation
- Need parallel testing stages
- Artifact generation and publishing

**Decision Criteria**:

- ✅ Building software artifacts
- ✅ Multiple test types (unit, integration)
- ✅ Code quality analysis needed
- ✅ Publishing to artifact repository

### Visual Diagram

```
┌──────────┐   ┌─────────┐   ┌─────────┐
│ Checkout │──▶│ Install │──▶│ Compile │
│   Code   │   │  Deps   │   │ Source  │
└──────────┘   └─────────┘   └────┬────┘
                                   │
                        ┌──────────┼──────────┐
                        ▼          ▼          ▼
                   ┌────────┐ ┌────────┐ ┌─────────┐
                   │  Test  │ │  Test  │ │ Analyze │
                   │  Unit  │ │ Integ  │ │Coverage │
                   └────┬───┘ └───┬────┘ └────┬────┘
                        └─────┬───┘           │
                              └───────┬───────┘
                                      ▼
                                 ┌─────────┐
                                 │ Package │
                                 └────┬────┘
                                      ▼
                                 ┌─────────┐
                                 │ Publish │
                                 └─────────┘
```

### Complete Example

```yaml
data-build-pipeline:
    version: '1.0.0'
    name: 'Data Flow: Build Pipeline'
    description: 'CI/CD pipeline with compile, test, and package steps'
    workspace:
        mode: manual
        gitStrategy: any
        reusePolicy: always
    inputs:
        version: string
    steps:
        # Phase 1: Setup
        - type: script
          id: checkout
          name: 'Checkout Code'
          script: |
              echo Checking out version: ${{ inputs.version }}
              echo commit=abc123def
              echo branch=main
          output:
              commit: { type: string, pattern: 'commit=(.*)' }
              branch: { type: string, pattern: 'branch=(.*)' }

        - type: script
          id: install-deps
          name: 'Install Dependencies'
          depends: [checkout]
          script: |
              echo Installing dependencies for commit ${{ steps.checkout.outputs.commit }}
              ping localhost -n 2 >nul
              echo deps_installed=true
              echo deps_count=142
          output:
              deps_installed: { type: string, pattern: 'deps_installed=(.*)' }
              deps_count: { type: string, pattern: 'deps_count=(.*)' }

        # Phase 2: Build
        - type: script
          id: compile
          name: 'Compile Source'
          depends: [install-deps]
          script: |
              echo Compiling with ${{ steps.install-deps.outputs.deps_count }} dependencies
              ping localhost -n 3 >nul
              echo artifacts=dist/bundle.js
              echo size=2048
          output:
              artifacts: { type: string, pattern: 'artifacts=(.*)' }
              size: { type: string, pattern: 'size=(.*)' }

        # Phase 3: Test (parallel)
        - type: script
          id: test-unit
          name: 'Run Unit Tests'
          depends: [compile]
          script: |
              echo Running unit tests on ${{ steps.compile.outputs.artifacts }}
              ping localhost -n 2 >nul
              echo tests_passed=45
              echo tests_failed=0
          output:
              tests_passed: { type: string, pattern: 'tests_passed=(.*)' }
              tests_failed: { type: string, pattern: 'tests_failed=(.*)' }

        - type: script
          id: test-integration
          name: 'Run Integration Tests'
          depends: [compile]
          script: |
              echo Running integration tests
              ping localhost -n 3 >nul
              echo tests_passed=12
              echo tests_failed=0
          output:
              tests_passed: { type: string, pattern: 'tests_passed=(.*)' }
              tests_failed: { type: string, pattern: 'tests_failed=(.*)' }

        # Phase 4: Analysis
        - type: script
          id: analyze-coverage
          name: 'Analyze Test Coverage'
          depends: [test-unit, test-integration]
          script: |
              echo Analyzing coverage from unit and integration tests
              echo Unit: ${{ steps.test-unit.outputs.tests_passed }} passed
              echo Integration: ${{ steps.test-integration.outputs.tests_passed }} passed
              set /a total=${{ steps.test-unit.outputs.tests_passed }} + ${{ steps.test-integration.outputs.tests_passed }}
              echo coverage=87
              echo total_tests=%total%
          output:
              coverage: { type: string, pattern: 'coverage=(.*)' }
              total_tests: { type: string, pattern: 'total_tests=(.*)' }

        # Phase 5: Package
        - type: script
          id: package
          name: 'Package Application'
          depends: [analyze-coverage]
          script: |
              echo Packaging version ${{ inputs.version }}
              echo Artifact: ${{ steps.compile.outputs.artifacts }}
              echo Size: ${{ steps.compile.outputs.size }}KB
              echo Coverage: ${{ steps.analyze-coverage.outputs.coverage }}%%
              echo package=app-${{ inputs.version }}.zip
          output:
              package: { type: string, pattern: 'package=(.*)' }

        # Phase 6: Publish
        - type: script
          id: publish
          name: 'Publish Artifacts'
          depends: [package]
          script: |
              echo Publishing ${{ steps.package.outputs.package }}
              echo Branch: ${{ steps.checkout.outputs.branch }}
              echo Commit: ${{ steps.checkout.outputs.commit }}
              echo url=https://artifacts.example.com/${{ steps.package.outputs.package }}
          output:
              url: { type: string, pattern: 'url=(.*)' }
```

### Key Concepts

1. **Phase Organization**: Clear phases (setup, build, test, package, publish)
2. **Parallel Testing**: Unit and integration tests run concurrently
3. **Artifact Tracking**: Build artifacts passed through pipeline
4. **Metadata Propagation**: Version, commit info available to all steps
5. **Quality Gates**: Coverage analysis before packaging

### Variations

**With Deployment Stages**:

```yaml
steps:
    # ... build steps ...

    - id: deploy-staging
      depends: [publish]
      script: deploy to staging

    - id: smoke-tests
      depends: [deploy-staging]
      script: run smoke tests

    - id: approval
      depends: [smoke-tests]
      type: user_intervention
      interventionType: approval

    - id: deploy-production
      depends: [approval]
      script: deploy to production
```

**With Conditional Deployment**:

```yaml
steps:
    # ... build steps ...

    - id: check-branch
      depends: [checkout]
      script: echo branch=${{ steps.checkout.outputs.branch }}
      output:
          branch: { type: string }

    - id: deploy
      depends: [package, check-branch]
      when: "${{ steps.check-branch.outputs.branch === 'main' }}"
      script: deploy to production
```

### Related Patterns

- [Fan-Out/Fan-In](#4-fan-outfan-in) - Parallel testing stages
- [ETL Pipeline](#9-etl-pipeline) - Structured data processing

---

## 11. SubFlow Composition

**Pattern**: Parent Flow → SubFlow → SubFlow

**Use When**:

- Need to reuse common workflow sequences
- Want to organize complex flows hierarchically
- Breaking down large workflows into manageable pieces
- Creating workflow libraries

**Decision Criteria**:

- ✅ Common sequences used in multiple flows
- ✅ Logical decomposition improves maintainability
- ✅ SubFlows are self-contained units
- ✅ Need to pass data between parent and child

### Visual Diagram

```
Parent Flow: test-subflow-basic
┌──────────────────────────────────────┐
│  ┌──────────────┐                    │
│  │ first-echo   │                    │
│  │ (SubFlow)    │                    │
│  │              │                    │
│  │ ┌──────────┐ │                    │
│  │ │test-echo:│ │                    │
│  │ │  echo    │ │ message=greeting   │
│  │ └──────────┘ │                    │
│  └──────┬───────┘                    │
│         │ output: echo1              │
│         ▼                            │
│  ┌──────────────┐                    │
│  │ second-echo  │                    │
│  │ (SubFlow)    │                    │
│  │              │                    │
│  │ ┌──────────┐ │                    │
│  │ │test-echo:│ │ message=echo1      │
│  │ │  echo    │ │                    │
│  │ └──────────┘ │                    │
│  └──────────────┘                    │
└──────────────────────────────────────┘
```

### Complete Example

**Atomic Flow** (reusable component):

```yaml
test-echo:
    version: '1.0.0'
    name: 'Test: Echo Flow'
    description: 'Simple echo flow used for testing subflow composition'
    workspace:
        mode: manual
        gitStrategy: any
        reusePolicy: always
    inputs:
        message: string
    steps:
        - type: script
          id: echo
          name: 'Echo Message'
          script: 'echo "${{ inputs.message }}"'
          output:
              result: { type: string }
```

**Composite Flow** (uses subflows):

```yaml
test-subflow-basic:
    version: '1.0.0'
    name: 'Test: Basic SubFlow'
    description: 'Tests basic subflow execution with inherit strategy'
    workspace:
        mode: manual
        gitStrategy: any
        reusePolicy: always
    inputs:
        greeting: string
    steps:
        # First subflow call
        - type: subflow
          id: first-echo
          name: 'First Echo'
          flowId: test-echo
          inputs:
              message: '${{ inputs.greeting }}'
          output:
              echo1: '${{ steps.echo.outputs.result }}'

        # Second subflow call (depends on first)
        - type: subflow
          id: second-echo
          name: 'Second Echo'
          flowId: test-echo
          depends: [first-echo]
          inputs:
              message: 'Reply: ${{ steps.first-echo.outputs.echo1 }}'
```

### Key Concepts

1. **flowId Reference**: Points to the subflow definition to execute
2. **Input Mapping**: Parent flow inputs mapped to subflow inputs
3. **Output Mapping**: Subflow step outputs exposed to parent
4. **Workspace Inheritance**: Subflows inherit parent workspace (inherit strategy)
5. **Dependency Tracking**: Subflows participate in normal dependency graph
6. **Step Reference**: Access subflow's internal step outputs via `steps.stepId.outputs`

### Variations

**Nested SubFlows** (3 levels deep):

```yaml
test-subflow-nested:
    version: '1.0.0'
    name: 'Test: Nested SubFlows'
    description: 'Tests nested subflow execution (3 levels deep)'
    workspace:
        mode: manual
        gitStrategy: any
        reusePolicy: always
    inputs:
        msg: string
    steps:
        - type: subflow
          id: call-basic
          name: 'Call Basic SubFlow'
          flowId: test-subflow-basic
          inputs:
              greeting: '${{ inputs.msg }}'
```

**Parallel SubFlows**:

```yaml
steps:
    - id: init
      type: script
      script: echo Initialize

    - id: subflow-a
      type: subflow
      depends: [init]
      flowId: process-a
      inputs:
          data: value-a

    - id: subflow-b
      type: subflow
      depends: [init]
      flowId: process-b
      inputs:
          data: value-b

    - id: merge
      depends: [subflow-a, subflow-b]
      type: script
      script: |
          echo A result: ${{ steps.subflow-a.outputs.result }}
          echo B result: ${{ steps.subflow-b.outputs.result }}
```

**Conditional SubFlow**:

```yaml
steps:
    - id: check
      script: echo type=premium
      output:
          type: { type: string }

    - id: premium-flow
      type: subflow
      depends: [check]
      when: "${{ steps.check.outputs.type === 'premium' }}"
      flowId: premium-processing
      inputs:
          user: ${{ inputs.userId }}
```

### Related Patterns

- [Recursive Flow](#12-recursive-flow) - SubFlow that calls itself
- [Linear Pipeline](#1-linear-pipeline) - Sequential processing

---

## 12. Recursive Flow

**Pattern**: Flow → (condition) → Self

**Use When**:

- Countdown or count-up operations
- Tree traversal
- Iterative refinement with variable iterations
- Processing nested structures

**Decision Criteria**:

- ✅ Problem naturally recursive
- ✅ Exit condition can be determined at runtime
- ✅ Recursion depth is bounded
- ✅ Each iteration reduces problem size

### Visual Diagram

```
┌─────────────────────────────────────┐
│ test-recursive-countdown (count=5)  │
│                                     │
│  ┌─────────┐   ┌───────────┐       │
│  │ Display │──▶│ Calculate │       │
│  │ Count   │   │   Next    │       │
│  │  (5)    │   │ next=4    │       │
│  └─────────┘   │continue=T │       │
│                └─────┬─────┘       │
│                      ▼             │
│            when: continue='true'   │
│                      │             │
│                ┌─────▼─────┐       │
│                │  Recurse  │       │
│                │ (SubFlow) │       │
│                └─────┬─────┘       │
└──────────────────────┼─────────────┘
                       │
        ┌──────────────▼──────────────┐
        │ test-recursive-countdown    │
        │         (count=4)           │
        │   ┌─────────┐  ┌─────────┐ │
        │   │ Display │─▶│Calculate│ │
        │   │  (4)    │  │ next=3  │ │
        │   └─────────┘  └────┬────┘ │
        │                     ▼      │
        │              when: continue │
        │                     │      │
        │              ┌──────▼────┐ │
        │              │  Recurse  │ │
        └──────────────┴───────────┴─┘
                       ...
                    count=0
                 continue=false
                   (stop)
```

### Complete Example

```yaml
test-recursive-countdown:
    version: '1.0.0'
    name: 'Test: Recursive Countdown'
    description: 'Tests recursive SubFlowStep with exit condition (counts from N to 0)'
    workspace:
        mode: manual
        gitStrategy: any
        reusePolicy: always
    inputs:
        count: string
    steps:
        # Display current count
        - type: script
          id: display
          name: 'Display Count'
          script: 'echo "Count: ${{ inputs.count }}"'

        # Calculate next value and determine if should continue
        - type: script
          id: calculate
          name: 'Calculate Next'
          script: |
              set /a next=${{ inputs.count }}-1 >nul
              echo next=%next%
              if %next% GEQ 0 (echo continue=true) else (echo continue=false)
          output:
              next: { type: string, pattern: 'next=(.*)' }
              continue: { type: string, pattern: 'continue=(.*)' }

        # Recursive call (only if continue=true)
        - type: subflow
          id: recurse
          name: 'Recurse if count > 0'
          flowId: test-recursive-countdown
          allowRecursion: true
          when: "${{ steps.calculate.outputs.continue === 'true' }}"
          depends: [calculate]
          inputs:
              count: '${{ steps.calculate.outputs.next }}'
```

### Key Concepts

1. **allowRecursion**: Must be set to `true` to allow flow to call itself
2. **Exit Condition**: Use `when` clause to prevent infinite recursion
3. **State Reduction**: Each recursive call should reduce problem size
4. **Depth Tracking**: System tracks recursion depth automatically
5. **Conditional SubFlow**: Recursion step only executes when condition met
6. **Input Transformation**: Pass modified input to recursive call

### Variations

**Recursive Tree Traversal**:

```yaml
traverse-tree:
    version: '1.0.0'
    name: 'Traverse Tree'
    inputs:
        node: string
    steps:
        - id: process
          script: echo Processing node: ${{ inputs.node }}

        - id: get-children
          script: |
              # Get child nodes
              echo child1=node-a
              echo child2=node-b
              echo has_children=true
          output:
              child1: { type: string }
              child2: { type: string }
              has_children: { type: string }

        - id: traverse-left
          type: subflow
          flowId: traverse-tree
          allowRecursion: true
          when: "${{ steps.get-children.outputs.has_children === 'true' }}"
          inputs:
              node: ${{ steps.get-children.outputs.child1 }}

        - id: traverse-right
          type: subflow
          flowId: traverse-tree
          allowRecursion: true
          when: "${{ steps.get-children.outputs.has_children === 'true' }}"
          inputs:
              node: ${{ steps.get-children.outputs.child2 }}
```

**Recursive Refinement**:

```yaml
refine-until-perfect:
    version: '1.0.0'
    name: 'Recursive Refinement'
    inputs:
        quality: string
    steps:
        - id: refine
          script: |
              echo Refining quality: ${{ inputs.quality }}
              set /a new_quality=${{ inputs.quality }} + 10
              echo quality=%new_quality%
          output:
              quality: { type: string }

        - id: check-quality
          script: |
              if ${{ steps.refine.outputs.quality }} LSS 100 (
                echo needs_improvement=true
              ) else (
                echo needs_improvement=false
              )
          output:
              needs_improvement: { type: string }

        - id: recurse
          type: subflow
          flowId: refine-until-perfect
          allowRecursion: true
          when: "${{ steps.check-quality.outputs.needs_improvement === 'true' }}"
          inputs:
              quality: ${{ steps.refine.outputs.quality }}
```

### Related Patterns

- [Retry Loop](#6-retry-loop) - Fixed iteration count
- [SubFlow Composition](#11-subflow-composition) - Non-recursive composition

---

## 13. User Intervention

**Pattern**: prepare → wait for approval → proceed

**Use When**:

- Human approval required before proceeding
- Manual review or validation needed
- Compliance or audit requirements
- Critical decision points

**Decision Criteria**:

- ✅ Human judgment required
- ✅ Cannot automate approval
- ✅ Need audit trail of decisions
- ✅ Want to capture reviewer feedback

### Visual Diagram

```
┌─────────┐
│ Prepare │
│  Data   │
└────┬────┘
     │
     ▼
┌───────────────────────┐
│  User Intervention    │
│  (Approval Step)      │
│                       │
│  ┌─────────────────┐  │
│  │ Title: Approve  │  │
│  │ Deployment      │  │
│  │                 │  │
│  │ Description:    │  │
│  │ Data hash: abc  │  │
│  │                 │  │
│  │ [Approve] [Rej] │  │◀─ User interacts
│  └─────────────────┘  │
│                       │
│  Outputs:             │
│  - approved: bool     │
│  - userResponse: str  │
│  - comment: str       │
│  - answeredBy: str    │
└───────┬───────────────┘
        │
        ▼
    ┌──────┐
    │Deploy│
    └──────┘
```

### Complete Example

```yaml
test-user-intervention:
    version: '1.0.0'
    name: 'Test: User Intervention'
    description: 'Tests user intervention step with approval workflow'
    workspace:
        mode: manual
        gitStrategy: any
        reusePolicy: always
    statusTransitions:
        onSuccess: approved
        onFailure: todo
    inputs:
        message: string
    steps:
        # Step 1: Prepare data for review
        - type: script
          id: prepare
          name: 'Prepare Data'
          script: |
              echo [prepare] Processing: ${{ inputs.message }}
              ping localhost -n 2 >nul
              echo [prepare] Data ready for review
              echo data_hash=abc123
          output:
              data_hash: { type: string, pattern: 'data_hash=(.*)' }

        # Step 2: Wait for user approval
        - type: user_intervention
          id: approval
          name: 'Approve Deployment'
          interventionType: approval
          blocking: true
          depends: [prepare]
          approval:
              title: 'Approve Deployment to Production'
              description: 'Data hash: ${{ steps.prepare.outputs.data_hash }}. Please review and approve this deployment.'
              allowReject: true
          output:
              approved: { type: boolean, from: 'intervention.approved' }
              userResponse: { type: string, from: 'intervention.userResponse' }
              comment: { type: string, from: 'intervention.comment' }
              answeredBy: { type: string, from: 'intervention.answeredBy' }

        # Step 3: Proceed with deployment (only after approval)
        - type: script
          id: deploy
          name: 'Deploy to Production'
          depends: [approval]
          script: |
              echo [deploy] User decision: ${{ steps.approval.outputs.userResponse }}
              echo [deploy] Deploying data: ${{ steps.prepare.outputs.data_hash }}
              ping localhost -n 3 >nul
              echo [deploy] Deployment successful!
```

### Key Concepts

1. **interventionType**: Specifies type of intervention (approval, input, review)
2. **blocking**: When true, flow pauses until user responds
3. **approval Config**: Defines approval UI (title, description, options)
4. **allowReject**: Whether user can reject (vs only approve)
5. **Output Mapping**: Standard outputs (approved, userResponse, comment, answeredBy)
6. **Variable Interpolation**: Can use step outputs in approval description

### Variations

**User Input Collection**:

```yaml
- type: user_intervention
  id: collect-config
  name: 'Collect Configuration'
  interventionType: input
  blocking: true
  input:
      title: 'Deployment Configuration'
      description: 'Please provide deployment parameters'
      fields:
          - name: environment
            type: select
            options: [dev, staging, prod]
          - name: replicas
            type: number
            default: 3
  output:
      environment: { type: string, from: 'intervention.fields.environment' }
      replicas: { type: number, from: 'intervention.fields.replicas' }
```

**Conditional Approval**:

```yaml
steps:
    - id: check-risk
      script: |
          if [ ${{ inputs.amount }} -gt 10000 ]; then
            echo high_risk=true
          else
            echo high_risk=false
          fi
      output:
          high_risk: { type: string }

    - id: approval
      type: user_intervention
      interventionType: approval
      when: "${{ steps.check-risk.outputs.high_risk === 'true' }}"
      depends: [check-risk]
      approval:
          title: 'High-Value Transaction Approval'
          description: 'Amount: ${{ inputs.amount }}'
      output:
          approved: { type: boolean }

    - id: process
      depends: [check-risk]
      script: |
          # Processes if low risk OR if approved
          echo Processing transaction
```

**Multi-Stage Approval**:

```yaml
steps:
    - id: prepare
      script: echo Preparing

    - id: tech-approval
      type: user_intervention
      depends: [prepare]
      interventionType: approval
      approval:
          title: 'Technical Review'
      output:
          approved: { type: boolean }

    - id: business-approval
      type: user_intervention
      depends: [tech-approval]
      interventionType: approval
      approval:
          title: 'Business Review'
      output:
          approved: { type: boolean }

    - id: deploy
      depends: [business-approval]
      script: echo Deploying
```

### Related Patterns

- [Review Loop](#7-review-loop) - Automated review with retry
- [Multi-Review with Skip](#8-multi-review-with-skip) - Multiple automated reviews

---

## Pattern Selection Decision Tree

```
Start: What is your workflow goal?

├─ Sequential processing?
│  ├─ Simple data transformation?
│  │  └─ [1. Linear Pipeline]
│  │
│  └─ Data integration?
│     ├─ Extract → Transform → Load?
│     │  └─ [9. ETL Pipeline]
│     │
│     └─ Build → Test → Deploy?
│        └─ [10. Build Pipeline]
│
├─ Parallel processing?
│  ├─ Need to merge results?
│  │  ├─ Two branches?
│  │  │  └─ [2. Diamond (Fork-Join)]
│  │  │
│  │  └─ Multiple branches with aggregation?
│  │     └─ [4. Fan-Out/Fan-In]
│  │
│  └─ No merge needed?
│     └─ [3. Fan-Out]
│
├─ Conditional execution?
│  ├─ Different paths based on data?
│  │  └─ [5. Conditional Routing]
│  │
│  └─ Human decision needed?
│     └─ [13. User Intervention]
│
├─ Retry/feedback needed?
│  ├─ Automatic retry?
│  │  └─ [6. Retry Loop]
│  │
│  └─ Human feedback?
│     ├─ Single reviewer?
│     │  └─ [7. Review Loop]
│     │
│     └─ Multiple reviewers?
│        └─ [8. Multi-Review with Skip]
│
└─ Flow composition?
   ├─ Reuse existing flows?
   │  └─ [11. SubFlow Composition]
   │
   └─ Self-referential?
      └─ [12. Recursive Flow]
```

## Best Practices

### Pattern Composition

Patterns can be combined to create sophisticated workflows:

1. **Build Pipeline + Review Loop**: CI/CD with manual approval gates
2. **Fan-Out/Fan-In + Conditional**: Parallel processing with conditional aggregation
3. **ETL + Retry Loop**: Data pipeline with automatic error recovery
4. **SubFlow Composition + Diamond**: Reusable parallel processing modules

### Variable Management

1. **Explicit Dependencies**: Always declare dependencies when using step outputs
2. **Output Patterns**: Use regex patterns for reliable data extraction
3. **Type Safety**: Define output types explicitly (string, number, boolean)
4. **Naming Conventions**: Use descriptive names for steps and outputs

### Error Handling

1. **Retry Limits**: Always set `maxIterations` to prevent infinite loops
2. **Exit Codes**: Use proper exit codes (0=success, non-zero=failure)
3. **State Management**: Use temporary files or outputs to track retry state
4. **Failure Modes**: Consider both transient and permanent failures

### Performance

1. **Maximize Parallelism**: Use fan-out when steps are independent
2. **Minimize Dependencies**: Only declare necessary dependencies
3. **Batch Operations**: Group related operations in single steps
4. **Conditional Skipping**: Use `when` clauses to skip unnecessary work

### Maintainability

1. **Decomposition**: Break complex flows into subflows
2. **Reusability**: Create library of common atomic flows
3. **Documentation**: Use descriptive names and descriptions
4. **Versioning**: Increment version when making breaking changes

## Common Anti-Patterns

### ❌ Missing Dependencies

```yaml
# WRONG: Uses output without dependency
- id: step1
  script: echo value=42
  output:
      value: { type: string }

- id: step2
  # Missing: depends: [step1]
  script: echo Using ${{ steps.step1.outputs.value }}
```

### ❌ Undefined Outputs

```yaml
# WRONG: References output not defined
- id: analyze
  script: echo Analyzing
  output:
      analysis: { type: string }

- id: report
  depends: [analyze]
  script: |
      echo ${{ steps.analyze.outputs.summary }}
      # 'summary' was never defined!
```

### ❌ Circular Dependencies

```yaml
# WRONG: Creates cycle
- id: step-a
  depends: [step-b]
  script: echo A

- id: step-b
  depends: [step-a]
  script: echo B
```

### ❌ Unbounded Loops

```yaml
# WRONG: No maxIterations
- id: retry
  onFailure:
      goto: retry
      # Missing: maxIterations: 5
  script: curl https://api.example.com
```

## Reference

### Configuration Files

- Primary definition: `.agent-fleet/flows.yml`
- Schema validation: `packages/flow-engine/src/validation/`

### Related Documentation

- [Flow Engine Architecture](../architecture/flow-engine.md)
- [Variable System](./variables.md)
- [Step Types Reference](./step-types.md)

### Examples Repository

All patterns in this catalog are tested and runnable from `flows.yml`
