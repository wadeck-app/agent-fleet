# File Naming Conventions

## Core Rule: File Name = Class Name (PascalCase)

All TypeScript files containing a primary exported class MUST be named in PascalCase to exactly match the class name.

### Examples from Codebase

**Correct Patterns:**

- `src/flow/executor/FlowExecutor.ts` → `export class FlowExecutor`
- `src/orchestrator/websocket/WorkerWebSocketServer.ts` → `export class WorkerWebSocketServer`
- `src/flow/processing/ClaudeProcessManager.ts` → `export class ClaudeProcessManager`

**Incorrect Patterns:**

```
❌ flow-executor.ts       (kebab-case)
❌ executor.ts            (missing context)
❌ ws-server.ts           (abbreviation)
❌ flowExecutor.ts        (camelCase)
```

## Utility Files Exception

Files without a primary class export may use lowercase or kebab-case:

**Examples from Codebase:**

- `src/flow/types.ts` - Type definitions only
- `src/shared/types.ts` - Shared type definitions
- `index.ts` - Entry points and re-exports
- `protocol.ts` - Protocol definitions and helpers

## Handling Name Collisions

When two classes share the same name but serve different purposes, the file structure provides disambiguation:

```
src/workers/dev/SpecificManager.ts    → Worker-specific implementation
src/flow/processing/SpecificManager.ts → Flow-specific implementation
```

**Guidelines:**

- Keep the same base name for the class
- Rely on folder structure for context
- Do NOT add prefixes/suffixes to the class name
- Do NOT use abbreviations

## Quick Reference Table

| Pattern                      | Valid | Example                                |
| ---------------------------- | ----- | -------------------------------------- |
| PascalCase matching class    | ✅    | `TaskManager.ts` → `class TaskManager` |
| Kebab-case for class file    | ❌    | `task-manager.ts`                      |
| Abbreviated name             | ❌    | `tm.ts`, `task-mgr.ts`                 |
| Generic name without context | ❌    | `manager.ts`, `server.ts`              |
| Utility file lowercase       | ✅    | `types.ts`, `protocol.ts`              |
| Entry point                  | ✅    | `index.ts`                             |

## Refactoring Misnamed Files

When you encounter a file that doesn't follow this convention:

1. Verify the primary exported class name
2. Rename the file to match the class name exactly
3. Update all imports across the codebase
4. Run tests to verify no breakage
5. Commit with message: `refactor: rename {old-name} to {ClassName}.ts for consistency`
