# Readability Audit

**Scope:** `packages/flow-cli/src` — 10 files audited  
**Standards:** no comments unless WHY is non-obvious · fail fast (no silent fallbacks) · PascalCase files matching exported class

---

## 1. [HIGH] Silent fallback on unknown executionId — StepQueue.ts:110, 136

**Issue:** `onStepCompleted` and `onStepFailed` both do `if (!entry) return` when the executionId is not found. This silently drops a completion/failure notification — the caller has no way to know the call was ignored. Violates the project's fail-fast standard.

```ts
const entry = this.executions.get(executionId);
if (!entry) return;  // silent no-op
```

**Better:**

```ts
const entry = this.executions.get(executionId);
if (!entry) throw new Error(`No active execution: ${executionId}`);
```

---

## 2. [HIGH] Giant inline action callback — RunCommand.ts:82–187

**Issue:** The `.action()` callback is ~100 lines covering five distinct concerns: input parsing, path resolution, config loading, daemon communication, and output formatting. It is impossible to navigate at a glance. The `options` type is an anonymous inline type on the same 100-char line as `.action(`.

**Better:** Extract named functions (`parseInputs`, `resolveFlowFile`, `loadConfig`, `formatOutput`) and a named `RunOptions` interface. The action body should be ~15 lines orchestrating those.

---

## 3. [HIGH] `as any` escape hatch without WHY — WorkerAdapter.ts:54–60

**Issue:** Two `as any` casts access `StepRunner`'s private `config` field to patch it. The comment only explains _what_ is done (`// Patch StepRunner config with MCP config path via env`), not _why_ StepRunner doesn't expose the config, or that this is an acknowledged limitation rather than a mistake.

```ts
const originalConfig = (this.stepRunner as any).config as any;
```

**Better:** Add a WHY comment: e.g. `// StepRunner exposes no config accessor; accessing private field until flow-engine#42 is resolved.` Or, better, contribute a `withEnv()` factory to `flow-engine`.

---

## 4. [MEDIUM] Repeated boolean expression 4 times — RunCommand.ts:138, 149, 164, 173

**Issue:** `options.json && !options.human` appears four times in the same handler, with no explanation of why `--human` overrides `--json`. Reading these guards requires mentally reconstructing the precedence rule each time.

**Better:**

```ts
const machineReadable = options.json === true && options.human !== true;
```

Declare once at the top of the action, use the named variable everywhere.

---

## 5. [MEDIUM] Misleading file-naming apology comment — FlowValidator.ts:1–3

**Issue:** The file opens with a comment claiming the naming follows "Commander-convention consistency" — but Commander has no such convention. The real reason is that the file exports a function rather than a class, which is the actual deviation from the PascalCase-matches-class standard. The comment misdirects readers and proposes a future rename to `ValidateFlowFile.ts`, which is itself non-standard for a function file.

**Better:** Remove the comment. Either rename the file to `validateFlowFile.ts` (camelCase, function file) or extract a `FlowValidator` class and make the filename accurate.

---

## 6. [MEDIUM] Unexplained triple-condition entry-point guard — TaskIndex.ts:181–185

**Issue:** The entry-point guard checks `fileURLToPath(import.meta.url)` _and_ two `.endsWith()` fallbacks for `.js`/`.ts`. The `fileURLToPath` check is already exact — the two `endsWith` fallbacks are redundant unless they handle a specific edge case (e.g., ts-node path normalization). Without a WHY comment this reads as cargo-cult defensiveness.

**Better:** Either remove the `endsWith` fallbacks (they add noise), or add a comment explaining which environment requires them.

---

## 7. [MEDIUM] Decorative section-separator comments — ShowCommand.ts:13–14, 118–119, 200–201

**Issue:** Three blocks of `// -------...` visual dividers add visual bulk without information. They do not explain WHY, only name sections that the code already makes clear by structure.

```ts
// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
```

**Better:** Remove the decorators. Group related functions visually by blank lines; use a single descriptive comment only where the grouping boundary is genuinely non-obvious.

---

## 8. [LOW] Opaque internal document references in code comments — CommandHandler.ts:58–59, 93–94, 101; StepQueue.ts:59–60, 158–160

**Issue:** Comments reference `D34`, `D8`, `D30`, `D36` without any link or context. Readers outside the original authoring session cannot resolve these references.

```ts
// PARSE_ERROR / UNSUPPORTED_STEP_TYPE: These error codes are not listed in D34's known
// error code table. They are daemon-side extensions. UNSUPPORTED_STEP_TYPE cross-references D8.
```

**Better:** Replace short codes with the actual concept or a URL: `// Not in the IPC protocol spec — daemon-side extension. See ipc/Protocol.ts for declared codes.`

---

## Score: 6/10

The codebase is generally well-structured and typed. The validator, queue, and show command are readable in isolation. The main drags are the monolithic `RunCommand` action callback (readability cliff), two silent-fallback violations of the fail-fast rule, and a recurring habit of leaving opaque document references in comments that only the original author can decode.
