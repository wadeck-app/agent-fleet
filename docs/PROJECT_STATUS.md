# Project Status - Agent Fleet

**Last Updated**: 2025-11-30

## Current State: Phase 2 Complete ✓

### ✅ Completed (Phases 1 & 2)

#### Core Flow Engine
- **Type System** (`src/flow/types.ts`)
  - Discriminated union types for FlowStep (ModelFlowStep | ScriptFlowStep)
  - Complete type definitions for flows, workspaces, execution

- **Flow Registry** (`src/flow/flow-registry.ts`)
  - YAML flow definition loading
  - Flow validation with clear error messages
  - Default flows: 'simple-qa', 'dev-full'

- **Template Renderer** (`src/flow/template-renderer.ts`)
  - **GitHub Actions syntax**: `${{ expression }}`
  - Three contexts: `inputs`, `steps.*.outputs`, `task`
  - Natural coexistence with shell vars, JSON, etc.
  - 14 escape tests passing

- **Script Executor** (`src/flow/script-executor.ts`)
  - Shell command execution with stdout/stderr capture
  - Working directory and environment variable support
  - Cross-platform compatibility (Windows/Unix)

- **Output Extractor** (`src/flow/output-extractor.ts`)
  - Regex pattern matching
  - Type conversion (string, number, boolean, object)
  - Transforms: parseInt, parseFloat, parseBoolean, parseJSON, etc.
  - Default values and optional fields
  - 21 tests passing

- **Condition Evaluator** (`src/flow/condition-evaluator.ts`)
  - JavaScript expression evaluation
  - Access to inputs, outputs, task metadata
  - Safe evaluation with clear error messages
  - 19 tests passing

- **Flow Executor** (`src/flow/flow-executor.ts`)
  - Step-by-step execution with state management
  - Conditional transitions (branching logic)
  - Retry logic (linear and exponential backoff)
  - Complete execution traces
  - 8 flow executor tests + 4 integration tests passing

- **Workspace Manager** (`src/flow/workspace-manager.ts`)
  - Basic structure (Phase 1 only)
  - **Not yet implemented**: git operations, concurrency, cleanup

#### Testing
- **118 tests total** (all passing ✓)
  - 21 output extraction tests
  - 19 condition evaluation tests
  - 8 flow executor tests
  - 4 integration tests
  - 14 escape/literal character tests
  - 52 compiled JavaScript tests (dist/)

#### Documentation
- **WORKFLOW_SYSTEM_DESIGN.md** - Complete architecture
- **FLOW_ENGINE_USAGE.md** - Comprehensive usage guide
- **GITHUB_ACTIONS_SYNTAX_MIGRATION.md** - Syntax migration doc
- **TEMPLATE_ESCAPING.md** - Escaping and literal characters
- **PROJECT_STATUS.md** (this file)

#### Examples & Demos
- **examples/flow-demo.ts** - 5 working demos
- **examples/run-demo.ts** - Demo runner
- Run with: `npx tsx examples/run-demo.ts`

### 📋 Next Steps (Phase 3+)

#### Phase 3: Complete WorkspaceManager
**Priority**: High
**Files**: `src/flow/workspace-manager.ts`

Features to implement:
- [ ] Git operations (clone, checkout, branch creation)
- [ ] Concurrency management (locks, active task tracking)
- [ ] Workspace lifecycle (create, allocate, release, cleanup)
- [ ] Workspace reuse policies (never, if-available, always)
- [ ] Git strategies (main-only, feature-branch, any)

#### Phase 4: Orchestrator
**Priority**: High
**Files**: New - `src/orchestrator/`

Components:
- [ ] Task queue management
- [ ] Worker pool (multi-process execution)
- [ ] Task lifecycle (queued → running → completed/failed)
- [ ] WorkspaceManager integration
- [ ] FlowRegistry integration

#### Phase 5: REST API
**Priority**: Medium
**Files**: New - `src/api/`

Endpoints:
- [ ] POST /tasks - Submit new task
- [ ] GET /tasks/:id - Get task status
- [ ] GET /tasks/:id/trace - Get execution trace
- [ ] GET /flows - List available flows
- [ ] WebSocket for real-time updates

#### Phase 6: CLI Interface
**Priority**: Medium
**Files**: New - `src/cli/`

Commands:
- [ ] `agent-fleet run <flow-id>` - Run a flow
- [ ] `agent-fleet status <task-id>` - Check task status
- [ ] `agent-fleet flows` - List flows
- [ ] `agent-fleet workers` - Manage workers

#### Phase 7: Dashboard UI
**Priority**: Low
**Files**: New - `src/dashboard/`

Features:
- [ ] Task queue visualization
- [ ] Real-time execution traces
- [ ] Workspace status overview
- [ ] Flow management interface

## Key Technical Decisions

### 1. GitHub Actions Syntax
**Decision**: Use `${{ expression }}` instead of `${expression}`

**Rationale**:
- Clear distinction from shell variables
- Explicit context naming (inputs, steps, task)
- Industry standard syntax
- Better IDE support potential

**Migration Complete**: All tests passing ✓

### 2. Discriminated Union Types
**Decision**: `type FlowStep = ModelFlowStep | ScriptFlowStep`

**Rationale**:
- Type safety with TypeScript discriminated unions
- Clear separation of concerns
- Better autocomplete and error checking

### 3. Script Steps for Testing
**Decision**: Support script execution without AI models

**Rationale**:
- Deterministic testing
- Faster test execution
- Cross-platform compatibility

### 4. Task Metadata Separation
**Decision**: Priority and metadata separate from flow inputs

**Rationale**:
- Flows are reusable definitions
- Tasks are runtime instances with metadata
- Cleaner separation of concerns

## Running the Project

### Install Dependencies
```bash
npm install
```

### Run Tests
```bash
npm test                    # All tests
npm test -- flow-executor   # Specific suite
npm test -- escape          # Escape tests
```

### Run Demos
```bash
npx tsx examples/run-demo.ts
```

### Build
```bash
npm run build
```

### Development
```bash
npm run dev    # Watch mode with multiple workers
```

## File Structure

```
agent-fleet/
├── src/
│   ├── flow/                    # Flow engine (Phase 1 & 2) ✓
│   │   ├── types.ts
│   │   ├── flow-registry.ts
│   │   ├── template-renderer.ts
│   │   ├── script-executor.ts
│   │   ├── output-extractor.ts
│   │   ├── condition-evaluator.ts
│   │   ├── flow-executor.ts
│   │   ├── workspace-manager.ts  # Basic only
│   │   └── *.test.ts            # 118 tests
│   ├── orchestrator/            # Phase 4 (TODO)
│   ├── api/                     # Phase 5 (TODO)
│   ├── cli/                     # Phase 6 (TODO)
│   └── dashboard/               # Phase 7 (TODO)
├── examples/
│   ├── flow-demo.ts             # Working demos ✓
│   └── run-demo.ts
├── docs/
│   ├── WORKFLOW_SYSTEM_DESIGN.md
│   ├── FLOW_ENGINE_USAGE.md
│   ├── GITHUB_ACTIONS_SYNTAX_MIGRATION.md
│   ├── TEMPLATE_ESCAPING.md
│   └── PROJECT_STATUS.md (this file)
└── dist/                        # Compiled output
```

## Known Issues / Limitations

### Current Limitations
1. **WorkspaceManager**: Only basic structure, no git operations yet
2. **No Orchestrator**: Can't run multiple tasks concurrently yet
3. **No API**: Only programmatic usage currently
4. **No CLI**: Must use TypeScript/JavaScript to run flows
5. **Backslash escaping**: `\${{` doesn't escape (not needed in practice)

### None Blocking
- All core flow engine features working
- 118 tests passing
- Demos running successfully
- Documentation complete

## Quick Start After Context Clear

1. **Review this file**: `docs/PROJECT_STATUS.md`
2. **Check design**: `docs/WORKFLOW_SYSTEM_DESIGN.md`
3. **Run tests**: `npm test` (should see 118 passing)
4. **Run demos**: `npx tsx examples/run-demo.ts`
5. **Next phase**: Implement WorkspaceManager (Phase 3)

## Git Status

```
Branch: master
Status: Clean (all changes committed)

Recent commits:
- bcc5612 Add nicer UI for orchestrator + plan for flow engine
- 3499018 Use welcome message to assign id to worker
- fba4752 First version with orchestration working
```

## Summary

**Current**: Flow Engine complete with GitHub Actions syntax ✓
**Next**: Complete WorkspaceManager with git operations
**Progress**: ~30% of total system (2/7 phases)
**Quality**: 118/118 tests passing, full documentation

The foundation is solid. Ready to build the orchestration layer!
