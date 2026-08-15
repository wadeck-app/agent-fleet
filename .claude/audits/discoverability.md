# Discoverability Audit

**Scope:** `packages/flow-cli/src` — 14 files across ipc, daemon, worker, secrets, task, validation, cli  
**Date:** 2026-08-12

---

## Findings

### 1. [HIGH] Duplicate `markIdle` method — `WorkerPool.ts:105-111`

**Issue:** `markIdle(ws: WebSocket)` is defined twice, identically, on lines 105 and 109. TypeScript in strict mode should reject this at compile time; if it does not, the second definition silently shadows the first. Any reader tracing the "idle" lifecycle is likely to miss one copy or assume the duplication is intentional.  
**Suggestion:** Remove the second definition (lines 109-111). Add a compile-time lint rule against duplicate class members if not already present.

---

### 2. [HIGH] `(this.stepRunner as any).config` — `WorkerAdapter.ts:54-59`

**Issue:** The adapter reads a private/undocumented `.config` property from `StepRunner` via an `as any` cast to patch in a dynamic MCP config path before executing a model step. There is no type contract for this property, no documented stability guarantee, and no fallback if the shape changes. A future refactor of `StepRunner` will break this silently at runtime, not at the type-check boundary.  
**Suggestion:** Expose a typed `withConfig(patch: Partial<StepRunnerConfig>): StepRunner` factory or copy-constructor on `StepRunner` so the patch is expressed through the public API. Until then, at minimum add an interface comment documenting the expected shape of `.config` and a test that will fail if the property disappears.

---

### 3. [MEDIUM] File `FlowValidator.ts` exports a function, not a class — `validation/FlowValidator.ts:1-6`

**Issue:** The file is named `FlowValidator.ts` (PascalCase, class convention per the project's own naming rules), but it exports a standalone function `validateFlowFile()`. The file acknowledges the mismatch in a comment on line 1. Worse, it imports `FlowValidator as EngineFlowValidator` from `flow-engine` to avoid a collision with its own filename, making every import of the engine validator in this file look like a renamed alias. A reader opening this file for the first time has to resolve three layers: the filename, the alias, and the actual export.  
**Suggestion:** Rename the file to `validateFlowFile.ts` (matching the exported function name) and remove the `as EngineFlowValidator` alias — the collision disappears. Update the import in `ValidateCommand.ts` accordingly.

---

### 4. [MEDIUM] `generateExecutionId` used to generate task IDs — `TaskStore.ts:5`

**Issue:** `TaskStore` imports `generateExecutionId` from `storage/ExecutionStore` to generate IDs for tasks. This creates a cross-domain dependency: the task subsystem is coupled to an execution-storage detail. The function name strongly implies its output is an execution ID, so readers of `TaskStore.create()` see `id = generateExecutionId()` and have to verify this is intentional and not a copy-paste error.  
**Suggestion:** Extract `generateId()` (or `generateUlidId()`) into a shared `utils/generateId.ts` module. Both `ExecutionStore` and `TaskStore` import from there. The semantic confusion and the coupling both disappear.

---

### 5. [MEDIUM] "Repo A/B contract" comments are unexplained — `ValidateCommand.ts:13,33`

**Issue:** Two comments read `// Machine-readable: Repo B contract` and `// Human-readable: Repo A contract`. There is no definition anywhere in the codebase (or in these files) of what "Repo A" and "Repo B" refer to, what their contracts specify, or where those contracts are documented. A developer adding a new exit code or changing output format has no way to know which contract they are breaking.  
**Suggestion:** Replace with concrete references — e.g., `// Machine-readable output: consumed by agent-fleet backend (see packages/backend/src/FlowRunner.ts)` — or add a link to the relevant spec/PR. The repo aliases "A"/"B" are opaque outside the original author's mental context.

---

### 6. [MEDIUM] `McpServer` is an ephemeral per-step object, named like a persistent service — `McpServer.ts:56`

**Issue:** One `McpServer` instance is created, started, and stopped for every individual model-step execution (`WorkerAdapter.ts:50-68`). The class name implies a long-running server process. A developer reading `WorkerAdapter` must open `McpServer.ts` to discover its lifecycle is tied to a single step. The `start()` / `stop()` API reinforces the "persistent service" mental model.  
**Suggestion:** Rename to `StepMcpServer` or `EphemeralMcpServer`. Add a one-line class-level JSDoc: `/** Per-step HTTP MCP server; created and destroyed for each model step execution. */`

---

### 7. [MEDIUM] `ExecutionContext.stepOutputs` is both an IPC payload field and a mutable daemon-side state container — `Protocol.ts:8`, `StepQueue.ts:115`

**Issue:** `ExecutionContext` is declared in `Protocol.ts` as a value-object passed from daemon to worker. Yet `StepQueue.onStepCompleted` mutates `entry.context.stepOutputs[stepId]` in place (line 115 of `StepQueue.ts`) — the same object reference passed to workers via IPC. The type definition gives no indication that the daemon mutates this field; readers of `Protocol.ts` see a plain record with no documented ownership or mutation contract.  
**Suggestion:** Add a JSDoc comment on `stepOutputs` explaining the lifecycle: populated progressively by the daemon as steps complete; snapshot-copied into each worker's assign message. Alternatively, separate the mutable daemon-side state (`ExecutionEntry.context`) from the immutable snapshot sent to each worker by deep-cloning at the assignment point.

---

### 8. [LOW] `parentToChildren` / `childToParent` maps are maintained but never consumed in v1 — `StepQueue.ts:17-19`

**Issue:** `ExecutionEntry` tracks `parentToChildren: Map<string, Set<string>>` and `childToParent: Map<string, string>` for every execution, populated on every `injectSteps` call. A comment reads "v1: metadata only, no scheduling impact." No code in the daemon, worker, or CLI reads these maps. They are maintained indefinitely for each active execution at the cost of memory allocations and reader confusion about their purpose.  
**Suggestion:** Either (a) remove them from `ExecutionEntry` and add a `TODO(v2)` comment at the injection point noting parent tracking is deferred, or (b) add a clear comment stating which future consumer will read these and from where (e.g., "consumed by execution status API endpoint in v2"). Invisible maintenance cost should be explicitly labelled.

---

## Score: 6/10

The codebase is generally structured well — single-responsibility classes, constructor injection, inline comments documenting intentional deviations and v1 deferrals. The main discoverability friction is concentrated in three areas: a genuine duplicate method that should not compile (finding 1), a type-unsafe private-property access that will silently break on engine refactors (finding 2), and several naming/ownership confusions (findings 3-7) that force readers to open multiple files to reconstruct intent that could have been local.
