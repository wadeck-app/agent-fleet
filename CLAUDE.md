# Agent Fleet - Claude Instructions

## Code Organization & Naming Conventions

### File Naming Convention: PascalCase Matching Class Names

**✅ ALWAYS follow this pattern:**

All TypeScript source files (`.ts`) must be named in **PascalCase** to **exactly match** their primary exported class name.

#### Examples of Correct Naming

```typescript
// ✅ CORRECT
FlowExecutor.ts         → export class FlowExecutor
WorkerWebSocketServer.ts → export class WorkerWebSocketServer
TaskManager.ts          → export class TaskManager
```

#### Handling Name Collisions

If two classes have the same name but exist in different modules, add the **parent folder context**:

```typescript
// ✅ CORRECT - Two ClaudeProcessManager classes exist
workers/dev/ClaudeProcessManager.ts         → Different responsibilities
flow/processing/ClaudeProcessManager.ts     → Different responsibilities
```

#### Exception: Utility Files

These files use lowercase or kebab-case (no primary class export):

```typescript
// ✅ CORRECT - Utility/config files
types.ts           // Type definitions only
protocol.ts        // Helper functions
index.ts           // Entry points
```

### Pattern Recognition Guidelines

When adding new features or refactoring existing code:

#### ✅ Patterns to FOLLOW

- **Single Responsibility**: Each class should have one clear purpose
- **Consistent Naming**: File name = Class name (PascalCase)
- **Clear Folder Structure**: Group by concern (workers/, orchestrator/, flow/, shared/)
- **Dependency Injection**: Pass dependencies through constructor
- **Test Coverage**: Every class must have a matching `.test.ts` file with >70% coverage

#### ❌ Patterns to AVOID

- **Kebab-case for class files**: `flow-executor.ts` → Use `FlowExecutor.ts`
- **Abbreviations**: `ws-server.ts` → Use full name `WorkerWebSocketServer.ts`
- **Generic names without context**: `manager.ts` → Use `TaskManager.ts`
- **God classes**: Classes >500 lines → Refactor into smaller components
- **Circular dependencies**: A imports B, B imports A → Restructure dependencies

### When to Refactor

Proactively suggest refactoring when you encounter:

1. **Large files**: >400 lines → Extract components
2. **Multiple responsibilities**: Class doing >1 thing → Split into focused classes
3. **Naming inconsistency**: File doesn't match class → Rename file
4. **Test gaps**: <70% coverage → Add tests OR simplify code
5. **Deep nesting**: >3 folder levels → Flatten structure

### Quick Reference

```
✅ GOOD                              ❌ BAD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FlowExecutor.ts                     flow-executor.ts
WorkerWebSocketServer.ts            server.ts
DevWorkerWebSocketServer.ts         websocket-server.ts
ClaudeProcessManager.ts             claude-pm.ts
```

## Flow Development Guidelines

### ALWAYS Validate Flows Before Committing

When creating or modifying flows in `.agent-fleet/flows.yaml`:

1. **After any flow modification**, immediately test validation by checking the server logs
2. Look for validation errors or warnings in the console
3. Fix any issues before proceeding
4. The FlowValidator will catch:
   - Undefined step references in `depends`
   - Circular dependencies
   - Invalid template variable references
   - Missing required fields
   - Type mismatches

### Template Variable Syntax

- ✅ Use: `${{ inputs.variableName }}`
- ✅ Use: `${{ steps.stepId.outputs.field }}`
- ✅ Use: `${{ task.priority }}`
- ❌ **Do NOT use**: `${{ inputs.var || 'default' }}` (not supported by validator)
- ❌ **Do NOT use**: Complex JavaScript expressions in templates

For optional inputs, declare them in the flow definition and handle missing values at runtime.

### Flow Testing Checklist

Before marking a flow as complete:

- [ ] Flow validates without errors
- [ ] All `depends` references point to existing steps
- [ ] All template variables reference declared inputs or previous step outputs
- [ ] Test with actual task creation (not just validation)
- [ ] Verify DAG execution order is correct
- [ ] Check logs for warnings

### Example Validation Check

After modifying a flow, the server logs should show:
```
✓ Loaded flow: your-flow-name
```

If you see errors:
```
Validation failed for flow 'your-flow':
  [ERROR] ...
```

**STOP** and fix the errors immediately before continuing.
- ensure that all documentation, code, test, are written in English
- ensure that the documentation remains concise. All examples should be linked to existing code, not excerpt of code inside the .md

## NPM Scripts & Entry Points

### Orchestrator Entry Point

After the orchestrator refactoring (Dec 2024), the entry point was moved from:
- ❌ OLD: `src/orchestrator/index.ts`
- ✅ NEW: `src/orchestrator/core/index.ts`

**Important:** When updating package.json scripts or documentation, use the correct path:
- `npm run orch:dev` → `tsx watch src/orchestrator/core/index.ts`
- `npm run orch:dev:no-watch` → `tsx src/orchestrator/core/index.ts`
- Build output → `dist/orchestrator/core/index.js`

This applies to:
- package.json `scripts` section
- package.json `main` field
- bin files (fleet-orchestrator)
- Documentation referencing the entry point

## Terminal-Kit UI & Watch Mode Limitation

### ⚠️ CRITICAL: tsx watch Mode Breaks Keyboard Input

**Problem:** When using `tsx watch` with terminal-kit-based UIs (OrchestratorUI, FlowWorkerUI), keyboard input does NOT work. Keys are "eaten" by tsx watch and never reach terminal-kit.

**Root Cause:** `tsx watch` captures stdin to detect restart commands (like 'rs'). This interferes with terminal-kit's stdin capture, preventing keyboard events from being detected.

**Solution:** Always use UI scripts WITHOUT watch mode:

```bash
# ✅ CORRECT - Keyboard input works
npm run orch:ui              # Orchestrator with UI
npm run worker:flow:ui       # Flow Worker with UI

# Or directly:
tsx src/orchestrator/core/index.ts
tsx src/workers/flow/FlowWorker.ts --ui

# ❌ WRONG - Keyboard input broken
npm run orch:dev             # Uses tsx watch
npm run worker:flow:ui:watch # Uses tsx watch
```

### Script Organization

- **Development scripts** (`orch:dev`, `worker:flow`) - Use `tsx watch` for file watching, NO UI
- **UI scripts** (`orch:ui`, `worker:flow:ui`) - Use `tsx` without watch, keyboard works
- **Watch scripts** - For development without UI only

### Warning Detection

Both OrchestratorUI and FlowWorkerUI detect tsx watch mode and display a warning:
```
⚠️  WARNING: Detected stdin listeners (likely tsx watch mode)
⚠️  Keyboard input will NOT work properly in the UI
⚠️  Solution: Run without watch mode
```

This check happens at UI start by detecting existing stdin 'data' listeners.

### Testing

When testing UI keyboard input:
1. Always use `tsx` (without watch)
2. Test files created: `test-terminal-kit-*.ts` demonstrate the issue
3. FlowWorkerUI works identically to OrchestratorUI for keyboard capture