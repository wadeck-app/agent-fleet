# Agent Fleet

## What & Why

**Agent Fleet** is a multi-agent orchestration system for autonomous development tasks. It coordinates AI agents through a TypeScript/Node.js framework using:
- **Flow Engine**: DAG-based task execution with dependency management
- **Orchestrator**: WebSocket-based coordination of distributed workers
- **Workers**: Specialized agents (flow execution, development tasks)

**Tech Stack**: TypeScript, Node.js, WebSocket (ws), terminal-kit, Express, Vitest

## Code Organization

**File naming**: TypeScript files MUST be PascalCase matching their exported class (e.g., `FlowExecutor.ts` → `class FlowExecutor`). See `.agent-fleet/.claude/docs/naming-conventions.md`

## Architecture Principles

**Required:**
- Single Responsibility - One clear purpose per class
- Dependency Injection - Constructor parameters, not globals
- Test Coverage - >70% coverage for all classes
- Clear Naming - No abbreviations (use `WebSocket` not `WS`)

**Avoid:**
- God classes (>500 lines → refactor at 400+)
- Circular dependencies
- Generic names (`manager.ts` → `TaskManager.ts`)
- Kebab-case for class files

**Structure**: Group by domain (e.g., `workers/`, `flow/`, `orchestrator/`), not by file type. Max 3 folder levels.

**Reference**: `.agent-fleet/.claude/docs/architecture.md`

## Entry Points

**Orchestrator**: `src/orchestrator/core/index.ts`
**Flow Worker**: `src/workers/flow/FlowWorker.ts`
**CLI**: `src/cli/entry-point.ts`

## Testing & Documentation

**Run tests:**
```bash
npm test                # Run all tests
npm run test:coverage   # With coverage report
npm run test:watch      # Watch mode
```

**Coverage requirement**: Minimum 70% for all classes. Place test files next to implementation:
```
FlowExecutor.ts
FlowExecutor.test.ts
```

**Documentation standards:**
- All documentation, code, and tests in English
- Keep docs concise - reference actual code instead of excerpts
- Examples must link to existing codebase files

## Project Structure

```
src/
├── orchestrator/    # WebSocket coordination
│   ├── core/        # Entry point + core logic
│   └── websocket/   # Server implementation
├── workers/         # Worker implementations
│   └── flow/        # Flow worker + UI
├── flow/            # Flow execution engine
│   ├── executor/    # DAG execution
│   ├── processing/  # Process management
│   └── types.ts     # Flow definitions
└── shared/          # Shared utilities
```

## Advices

- Delegate to sub-agents early and often
- Test before declaring work complete (build + test:agent)
- Document in .claude/temp folder if needed
- Put your plans in .claude/plans folder and keep them updated
- Ask user if requirements unclear (AskUserQuestion tool)

## Additional references (only consult when needed)
- `.agent-fleet/.claude/docs/naming-conventions.md` - File naming rules, collision handling, examples
- `.agent-fleet/.claude/docs/architecture.md` - Design patterns, code organization
- `.agent-fleet/.claude/docs/flow-development.md` - Flow YAML syntax, validation, debugging
- `.agent-fleet/.claude/docs/terminal-kit-tsx-issue.md` - Technical deep dive on stdin conflict
- `.claude/kb/lessons-learned.md` - Project-specific gotchas and solutions
