 Workflow System Design - Agent Fleet

 Context & Objectives

 Current State

- Workers are typed (PM, PO, DEV, REVIEWER) with fixed behavior
- Tasks follow a linear status flow
- No workspace isolation concept
- Workers share the same codebase directory

 Goals

. Generic Workers: Workers should be able to execute any type of flow without being typed
. Configurable Flows: Flows should be defined per-project via DSL (YAML/JSON)
. Workspace Management: Support isolated and shared workspaces with git branch awareness
. Flow Orchestration: Steps should be executed sequentially with variable passing (CI/CD-like)
. Observability: Full tracing and logging of flow execution
. Reusability: Decouple agent-fleet code from project-specific workflows

---

 Architecture Overview

 Core Components

```

                      Orchestrator                           
             
   TaskManager     FlowRegistry      Workers           
             
                                                          
                       
                                                            
                                                            
                         
               FlowExecutor                                
           - Execute flow steps                            
           - Variable interpolation                        
           - Context gathering                             
           - Model invocation                              
                         
                                                            
                          
                                                          
             
    Workspace       Execution        Storage           
    Manager         Tracer                             
             

                             
                             
                    
                      Claude API     
                      (Sonnet/Haiku) 
                    
```

---

 Flow DSL Specification

 Flow Definition Schema

```typescript
interface FlowDefinition {
	id: string;
	name: string;
	description: string;

	// Workspace requirements
	workspace: {
		mode: 'isolated' | 'shared';
		gitStrategy: 'main-only' | 'feature-branch' | 'any';
		reusePolicy: 'never' | 'if-available' | 'always';
		concurrencyKey?: string; // Group compatible workspaces
	};

	// Input variables expected from task
	inputs: Record<string, 'string' | 'number' | 'boolean' | 'object'>;

	// Flow steps
	steps: FlowStep[];

	// Optional hooks
	hooks?: {
		onStart?: string;
		onComplete?: string;
		onError?: string;
	};
}

interface FlowStep {
	id: string;
	name: string;

	// Model selection
	model: 'sonnet' | 'haiku' | 'opus';

	// Prompt template with variable interpolation
	// Supports: ${varName}, ${stepId.outputVar}, ${task.metadata.key}
	prompt: string;

	// Context to provide to the model
	context?: {
		files?: string[]; // Glob patterns
		previousOutputs?: string[]; // Step IDs to include
		taskMetadata?: string[]; // Keys from task.metadata
	};

	// Output parsing and extraction
	output?: {
		extract?: Record<
			string,
			{
				type: 'string' | 'number' | 'boolean' | 'json';
				pattern?: string; // Regex for extraction
				required?: boolean;
			}
		>;
	};

	// Conditional transitions
	next?: {
		default?: string; // Default next step ID
		conditions?: Array<{
			when: string; // JS expression: "output.approved === true"
			goto: string; // Target step ID
		}>;
	};

	// Retry configuration
	retry?: {
		maxAttempts: number;
		backoff: 'linear' | 'exponential';
	};
}
```

 Example Flow Configurations

 Simple Q&A Flow

```yaml
simple-qa:
    name: 'Simple Question & Answer'
    description: 'Answer questions using existing codebase knowledge'

    workspace:
        mode: shared
        gitStrategy: main-only
        reusePolicy: always
        concurrencyKey: readonly

    inputs:
        question: string

    steps:
        - id: answer
          name: 'Answer Question'
          model: haiku
          prompt: '${question}'
          context:
              files: ['/.md', '/.ts']
```

 Full Development Flow

```yaml
dev-full:
    name: 'Full Development Cycle'
    description: 'Analysis → Validation → Implementation → Quality → Review'

    workspace:
        mode: isolated
        gitStrategy: feature-branch
        reusePolicy: never

    inputs:
        taskDescription: string
        priority: string

    steps:
        - id: analyze
          name: 'Analyze Requirements'
          model: sonnet
          prompt: |
              Analyze this task and create an implementation plan:
              Task: ${taskDescription}
              Priority: ${priority}

              Provide:
              . Technical approach
              . Files to modify
              . Risks and complexity

          context:
              files: ['/.ts', 'README.md']

          output:
              extract:
                  approach: { type: string }
                  filesToModify: { type: json }
                  complexity: { type: string, required: true }

          next:
              conditions:
                  - when: "output.complexity === 'high'"
                    goto: validate
              default: implement

        - id: validate
          name: 'Validate with User'
          model: haiku
          prompt: |
              High complexity detected. Review needed:
              ${analyze.approach}

              Proceed? (yes/no)

          output:
              extract:
                  approved: { type: boolean }

          next:
              conditions:
                  - when: 'output.approved === false'
                    goto: end
              default: implement

        - id: implement
          name: 'Implement Solution'
          model: sonnet
          prompt: |
              Implement based on:
              ${analyze.approach}
              Files: ${analyze.filesToModify}

          context:
              previousOutputs: [analyze]

          next:
              default: quality

        - id: quality
          name: 'Quality Check'
          model: haiku
          prompt: 'Run linters and tests. Report issues.'

          output:
              extract:
                  passed: { type: boolean }
                  issues: { type: json }

          next:
              conditions:
                  - when: 'output.passed === false'
                    goto: fix
              default: end

        - id: fix
          name: 'Fix Issues'
          model: sonnet
          prompt: 'Fix: ${quality.issues}'
          next:
              default: quality

        - id: end
          name: 'Complete'
          model: haiku
          prompt: 'Summarize work done'
```

 PR Review Flow

```yaml
review-pr:
    name: 'Pull Request Review'
    description: 'Review code changes in a PR'

    workspace:
        mode: shared
        gitStrategy: any
        reusePolicy: if-available
        concurrencyKey: pr-review

    inputs:
        prNumber: number
        branch: string

    steps:
        - id: checkout
          name: 'Checkout Branch'
          model: haiku
          prompt: 'git checkout ${branch}'

        - id: review
          name: 'Review Code'
          model: sonnet
          prompt: |
              Review PR ${prNumber}
              Focus: quality, bugs, performance, security

          context:
              files: ['/.ts', '/.tsx']

          output:
              extract:
                  approved: { type: boolean }
                  comments: { type: json }

          next:
              default: post-review

        - id: post-review
          name: 'Post Comments'
          model: haiku
          prompt: 'Post review to PR ${prNumber}: ${review.comments}'
```

 Brainstorming Flow

```yaml
brainstorm:
    name: 'Iterative Brainstorming'
    description: 'Analysis → Questions → Refinement (loop)'

    workspace:
        mode: shared
        gitStrategy: main-only
        reusePolicy: always
        concurrencyKey: brainstorm

    inputs:
        topic: string
        maxIterations: number

    steps:
        - id: analyze
          name: 'Analyze Topic'
          model: sonnet
          prompt: 'Analyze: ${topic}'

          output:
              extract:
                  thoughts: { type: string }
                  questions: { type: json }

          next:
              default: ask

        - id: ask
          name: 'Ask Questions'
          model: haiku
          prompt: 'Questions: ${analyze.questions}'

          output:
              extract:
                  answers: { type: json }

          next:
              default: refine

        - id: refine
          name: 'Refine Ideas'
          model: sonnet
          prompt: |
              Refine based on:
              Initial: ${analyze.thoughts}
              Answers: ${ask.answers}

          output:
              extract:
                  refinedIdeas: { type: string }
                  needsMore: { type: boolean }
                  iteration: { type: number }

          next:
              conditions:
                  - when: 'output.needsMore && output.iteration < maxIterations'
                    goto: analyze
              default: end

        - id: end
          name: 'Finalize'
          model: haiku
          prompt: 'Summarize brainstorm results'
```

---

 Workspace Management

 Workspace Types

 Isolated Workspace

- Use case: Development tasks requiring file modifications
- Characteristics:
    - Dedicated directory per task
    - Can checkout feature branches
    - No concurrent access
    - Cleaned up after task completion
- Example: `dev-full`, `bugfix`

 Shared Workspace

- Use case: Read-only analysis, questions, reviews
- Characteristics:
    - Multiple tasks can use simultaneously
    - Usually on main branch
    - Persistent across tasks
    - Grouped by concurrencyKey
- Example: `simple-qa`, `brainstorm`, `review-pr`

 Workspace Lifecycle

```

 Task Created 

       
       

 Allocate Workspace       
 - Check reuse policy     
 - Find compatible or     
 - Create new             

       
       

 Setup Git State          
 - Clone/checkout branch  
 - Verify clean state     

       
       

 Execute Flow             
 - Run steps              
 - Track usage            

       
       

 Release Workspace        
 - Remove from active     
 - Cleanup if isolated    
 - Persist if shared      

```

 Concurrency Management

```typescript
interface Workspace {
	id: string;
	path: string;
	mode: 'isolated' | 'shared';

	git?: {
		branch: string;
		isClean: boolean;
		lastCommit: string;
	};

	concurrency: {
		key: string; // Group identifier
		activeTasks: Set<string>;
		locked: boolean; // Exclusive lock for modifications
	};

	createdAt: string;
	lastUsedAt: string;
	usageCount: number;
}
```

Allocation Rules:

. Isolated + never reuse → Always create new workspace
. Shared + always reuse → Find or create in pool
. Check compatibility → Same concurrencyKey, git state, not locked
. Lock for writes → Set `locked: true` during modifications

---

 Execution Tracing

 Trace Structure

```typescript
interface FlowTrace {
	id: string;
	taskId: string;
	flowId: string;
	workspaceId: string;
	startTime: number;
	endTime?: number;
	status: 'running' | 'completed' | 'failed';
	steps: StepTrace[];
}

interface StepTrace {
	stepId: string;
	stepName: string;
	startTime: number;
	endTime?: number;
	durationMs?: number;
	model: string;
	prompt: string;
	response?: string;
	outputs?: Record<string, any>;
	error?: string;
	retries?: number;
}
```

 Trace Storage

- Traces saved to `.agent-fleet/traces/{traceId}.json`
- Indexed by task ID for easy lookup
- Queryable via REST API
- Used for debugging and flow optimization

 Observability Features

. Real-time monitoring: WebSocket updates on step progress
. Historical analysis: Query past executions
. Performance metrics: Step duration, model usage
. Error tracking: Failed steps with full context
. Flow visualization: Step graph with transitions

---

 Implementation Plan

 Phase : Foundation

 . Type Definitions

- [ ] Create `src/flow/types.ts` with core interfaces
    - `FlowDefinition`
    - `FlowStep`
    - `Workspace`
    - `FlowTrace`
    - `FlowExecutionContext`

 . Flow Registry

- [ ] Implement `src/flow/flow-registry.ts`
    - Load flows from `.agent-fleet/flows.yaml`
    - Validate flow definitions
    - Default flows (simple-qa, dev-full)
    - Flow lookup and caching

 . Workspace Manager (Basic)

- [ ] Create `src/flow/workspace-manager.ts`
    - Workspace creation (directory structure)
    - Basic allocation (isolated only, no sharing yet)
    - Cleanup on release
    - Simple tracking (Map-based)

 Phase : Flow Execution Engine

 . Template Renderer

- [ ] Implement `src/flow/template-renderer.ts`
    - Variable interpolation: `${varName}`
    - Nested access: `${stepId.outputVar}`
    - Task metadata: `${task.metadata.key}`
    - Escape handling

 . Context Gatherer

- [ ] Create `src/flow/context-gatherer.ts`
    - File loading by glob patterns
    - Previous step outputs inclusion
    - Task metadata extraction
    - Context size optimization

 . Output Extractor

- [ ] Implement `src/flow/output-extractor.ts`
    - Regex-based extraction
    - Type conversion (string, number, boolean, json)
    - Validation (required fields)
    - Error handling

 . Flow Executor (Core)

- [ ] Create `src/flow/flow-executor.ts`
    - Step-by-step execution
    - Condition evaluation for transitions
    - Retry logic with backoff
    - Error propagation

 Phase : Claude Integration

 . Model Adapter

- [ ] Create `src/flow/model-adapter.ts`
    - Abstract interface for model calls
    - Sonnet/Haiku/Opus selection
    - Context formatting (files + outputs)
    - Response parsing

 . Worker Integration

- [ ] Update `src/worker/worker.ts`
    - Replace typed behavior with flow execution
    - Workspace-aware task processing
    - Progress reporting via WebSocket
    - Error handling and reporting

 . Task Manager Integration

- [ ] Update `src/orchestrator/task-manager.ts`
    - Add `flowId` to Task type
    - Add `workspaceId` to Task type
    - Flow selection logic
    - Workspace tracking

 Phase : Advanced Workspace Management

 . Shared Workspaces

- [ ] Extend `workspace-manager.ts`
    - Workspace pooling by concurrencyKey
    - Reuse policy implementation
    - Concurrent access tracking
    - Locking mechanism for writes

 . Git Integration

- [ ] Create `src/flow/git-manager.ts`
    - Clone repositories
    - Branch checkout/creation
    - Status checking (clean/dirty)
    - Commit/push support (optional)

 . Workspace Persistence

- [ ] Implement workspace state storage
    - Save/load workspace metadata
    - Track usage statistics
    - Cleanup policies (LRU, time-based)

 Phase : Observability & Tracing

 . Execution Tracer

- [ ] Create `src/flow/execution-tracer.ts`
    - Trace lifecycle management
    - Step timing and metrics
    - Prompt/response logging
    - Error capture

 . Storage Layer

- [ ] Implement trace storage
    - JSON file storage
    - Indexing by task/flow/time
    - Query interface
    - Cleanup old traces

 . API Endpoints

- [ ] Add REST endpoints
    - `GET /api/traces/:traceId`
    - `GET /api/traces?taskId=...`
    - `GET /api/flows`
    - `GET /api/workspaces`

 . UI Integration

- [ ] Update `src/orchestrator/ui.tsx`
    - Flow execution visualization
    - Step progress indicators
    - Workspace status panel
    - Trace viewer

 Phase : Configuration & Documentation

 . Flow Configuration

- [ ] Create default flows library
    - `flows/simple-qa.yaml`
    - `flows/dev-full.yaml`
    - `flows/review-pr.yaml`
    - `flows/brainstorm.yaml`

 . Project Setup

- [ ] Implement project initialization
    - `agent-fleet init` command
    - Generate `.agent-fleet/` directory
    - Template flows.yaml
    - Configuration wizard

 . Documentation

- [ ] Write user documentation
    - Flow DSL reference
    - Workspace concepts
    - Configuration examples
    - Best practices
    - Troubleshooting guide

 . Testing

- [ ] Comprehensive test suite
    - Unit tests for each component
    - Integration tests for flow execution
    - EE tests with real Claude API
    - Performance benchmarks

 Phase : Polish & Launch (Week )

 . Migration Path

- [ ] Backward compatibility
    - Support old WorkerType system
    - Auto-convert to flows
    - Deprecation warnings

 . Performance Optimization

- [ ] Optimize critical paths
    - Workspace allocation caching
    - Template rendering optimization
    - Context gathering parallelization
    - Trace storage batching

 . Error Handling

- [ ] Robust error recovery
    - Step retry mechanisms
    - Workspace cleanup on failure
    - Detailed error messages
    - User-friendly error reporting

 . Beta Testing

- [ ] Internal testing
    - Test with real projects
    - Gather feedback
    - Iterate on UX
    - Fix bugs

---

 Technical Decisions

 . Flow Definition Format: YAML vs JSON

Decision: YAML (with JSON support)

- More human-readable for complex flows
- Better for multi-line prompts
- Comments support
- JSON parsing fallback for tooling

 . Variable Interpolation: Template String vs AST

Decision: Simple template string

- Easier to understand for users
- Fast to implement and execute
- Sufficient for % of use cases
- Can evolve to AST if needed

 . Model Invocation: Direct API vs CLI Wrapper

Decision: Direct API (future), CLI wrapper (MVP)

- MVP: Use existing Claude Code CLI
- Future: Direct API for better control
- Allows custom system prompts
- Better streaming support

 . Workspace Storage: In-memory vs Persistent

Decision: Persistent with in-memory cache

- Survives orchestrator restarts
- Enables workspace reuse
- Better debugging capabilities
- Minimal performance impact

 . Concurrency Model: Locks vs Optimistic

Decision: Lock-based for isolated, optimistic for shared

- Isolated workspaces need exclusive access
- Shared workspaces can handle conflicts
- Simpler reasoning model
- Easier to implement correctly

 . Trace Format: Structured vs Free-form

Decision: Structured JSON

- Queryable and analyzable
- Standardized tooling
- Easy to visualize
- Future-proof for analytics

---

 Success Metrics

 Functional Goals

- [ ] Workers execute any flow without code changes
- [ ] Multiple workspace types work correctly
- [ ] Flows are configurable per-project
- [ ] Full tracing and observability
- [ ] Git integration works (main + feature branches)

 Performance Goals

- [ ] Flow execution overhead < ms per step
- [ ] Workspace allocation < s for shared, < s for isolated
- [ ] Trace storage < ms per step
- [ ] System handles + concurrent workers

 Quality Goals

- [ ] %+ test coverage
- [ ] Zero data loss (tasks, traces)
- [ ] Graceful degradation on errors
- [ ] Clear error messages

 UX Goals

- [ ] Flows easy to write (< min for new flow)
- [ ] Debugging easy (traces + logs)
- [ ] Configuration intuitive
- [ ] Documentation complete

---

 Future Enhancements

 Post-Launch (Prioritized)

. Flow Composition
    - Reusable sub-flows
    - Flow templates/inheritance
    - Conditional flow selection

. Advanced Git Features
    - Auto-commit during steps
    - Branch creation from flow
    - PR creation integration
    - Merge conflict resolution

. Parallel Steps
    - Execute independent steps concurrently
    - Fan-out/fan-in patterns
    - Step dependencies graph

. Human-in-the-Loop
    - Pause for user input
    - Approval gates
    - Interactive refinement

. Flow Analytics
    - Success/failure rates
    - Duration statistics
    - Bottleneck identification
    - Cost optimization

. Multi-Model Support
    - GPT-, Gemini, etc.
    - Model routing by step type
    - Cost/quality tradeoffs

. Workspace Snapshots
    - Save/restore workspace state
    - Time travel debugging
    - Rollback on failure

. Flow Marketplace
    - Share flows across projects
    - Community templates
    - Best practices library

---

 Risk Assessment

 High Risks

. Complexity: Flow DSL might become too complex
    - Mitigation: Start simple, iterate based on feedback

. Performance: Workspace operations might be slow
    - Mitigation: Benchmark early, optimize hot paths

. Claude API Limits: Rate limiting could block flows
    - Mitigation: Queue management, backoff, retries

 Medium Risks

. Git Conflicts: Concurrent workspace operations
    - Mitigation: Lock management, clear policies

. Storage Growth: Traces accumulate quickly
    - Mitigation: Retention policies, compression

 Low Risks

. Migration: Existing users need migration path
    - Mitigation: Backward compatibility layer

. Documentation: Learning curve for new users
    - Mitigation: Examples, tutorials, wizards

---

 Conclusion

This design provides a flexible, scalable foundation for executing AI agent workflows with:

- Decoupling: Flows separated from code
- Flexibility: Configurable per-project
- Safety: Workspace isolation
- Observability: Full tracing
- Extensibility: Easy to add new features

The phased implementation plan allows for incremental delivery and validation at each stage.

Next step: Begin Phase  - Foundation implementation.
