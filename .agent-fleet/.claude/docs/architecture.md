# Architecture Guidelines

## Core Principles

### Single Responsibility Principle
Each class should have ONE clear purpose. If you can't describe what a class does in a single sentence without using "and", it probably needs to be split.

**Examples from Codebase:**
- `FlowExecutor` - Executes flow definitions as DAGs
- `WorkerWebSocketServer` - Manages WebSocket connections for workers
- `ClaudeProcessManager` - Manages Claude CLI process lifecycle

### Dependency Injection
Pass dependencies through constructor parameters, not global singletons.

```typescript
// ✅ Good
class TaskManager {
  constructor(
    private readonly database: Database,
    private readonly logger: Logger
  ) {}
}

// ❌ Bad
class TaskManager {
  constructor() {
    this.db = globalDatabase; // Tight coupling
  }
}
```

### Test Coverage
Every class must have a matching `.test.ts` file with >70% coverage.

**Coverage Check:**
```bash
npm run test:coverage
```

## Folder Structure

Organize by concern, not by file type:

```
src/
├── orchestrator/     # Orchestration logic
│   ├── core/        # Core orchestrator
│   └── websocket/   # WebSocket server
├── workers/         # Worker implementations
│   └── flow/        # Flow worker
├── flow/            # Flow execution engine
│   ├── executor/    # Flow execution
│   ├── processing/  # Process management
│   └── types.ts     # Flow type definitions
└── shared/          # Shared utilities
    └── types.ts     # Common types
```

**Guidelines:**
- Group by domain/feature, not by technical layer
- Maximum 3 levels deep before refactoring
- Each folder should have a clear purpose
- Avoid generic names like `utils/`, `helpers/`, `common/`

## Patterns to Avoid

### God Classes
Classes >500 lines indicate too many responsibilities.

**Refactoring threshold:**
- 400 lines: Consider splitting
- 500+ lines: Must refactor

### Circular Dependencies
If A imports B and B imports A, restructure immediately.

**Common solutions:**
- Extract shared types to separate file
- Introduce dependency inversion (interfaces)
- Combine into single cohesive module

### Generic Names
Avoid context-free names like `manager.ts`, `handler.ts`, `service.ts` without specifics.

**Better alternatives:**
- `TaskManager` → Clear what it manages
- `WebSocketHandler` → Clear what it handles
- `FlowExecutionService` → Clear what service it provides

### Abbreviations
Never abbreviate in file or class names.

❌ `WS`, `Mgr`, `Svc`, `Proc`, `Exec`
✅ `WebSocket`, `Manager`, `Service`, `Process`, `Executor`

## Refactoring Triggers

Proactively suggest refactoring when you encounter:

### 1. Large Files (>400 lines)
Extract cohesive components into separate classes.

### 2. Multiple Responsibilities
If a class does authentication AND authorization AND logging, split it.

### 3. Naming Inconsistency
File name doesn't match class name → Rename immediately.

### 4. Test Gaps (<70% coverage)
Either add tests OR simplify the code to make it testable.

### 5. Deep Nesting (>3 folder levels)
Flatten structure or reconsider organization.

### 6. Duplicate Code
Extract to shared utility with clear, specific name.

## Code Organization Best Practices

### Imports Order
```typescript
// 1. Node built-ins
import { EventEmitter } from 'events';

// 2. External dependencies
import express from 'express';

// 3. Internal shared modules
import { Logger } from '@/shared/Logger';

// 4. Local imports
import { FlowExecutor } from './FlowExecutor';
```

### Class Structure
```typescript
class Example {
  // 1. Static properties
  static readonly DEFAULT_TIMEOUT = 5000;

  // 2. Instance properties
  private readonly dependency: Dependency;
  private state: State;

  // 3. Constructor
  constructor(dependency: Dependency) {
    this.dependency = dependency;
  }

  // 4. Public methods
  public async execute(): Promise<void> {}

  // 5. Private methods
  private validate(): boolean {}
}
```

### Error Handling
Fail fast with descriptive errors:

```typescript
// ✅ Good
if (!config.apiKey) {
  throw new Error('Missing required config: apiKey');
}

// ❌ Bad
if (!config.apiKey) {
  console.log('No API key'); // Silent failure
}
```

## Testing Strategy

### Test File Location
Place `.test.ts` files next to the implementation:

```
FlowExecutor.ts
FlowExecutor.test.ts
```

### Test Structure
```typescript
describe('FlowExecutor', () => {
  describe('execute()', () => {
    it('should execute steps in dependency order', async () => {
      // Arrange
      const executor = new FlowExecutor(mockDeps);

      // Act
      const result = await executor.execute(flow);

      // Assert
      expect(result).toBeDefined();
    });
  });
});
```

### Coverage Target
- Minimum: 70%
- Ideal: 80%+
- Focus on business logic, not getters/setters
