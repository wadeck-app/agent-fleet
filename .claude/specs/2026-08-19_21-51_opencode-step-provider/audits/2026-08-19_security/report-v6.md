## v5 Fix Verification

All four v5 fixes confirmed present:

1. **0o600 on Claude MCP temp file** — `provider-abstraction.md` line 73: `permissions 0o600 (best-effort, Unix only; on Windows file ACLs apply)` ✓
2. **LaunchOptions.prompt comment** — `provider-abstraction.md` line 45: `// used by launchBackground() only; ignored by launchInteractive()` ✓
3. **sessionId regex in rule 3** — `provider-abstraction.md` line 93: `^[a-zA-Z0-9_-]{1,128}$` ✓
4. **McpServer.env value validation** in `out-of-scope.md` lines 39–41 ✓ and **Windows 0o600** in `out-of-scope.md` lines 51–53 ✓

---

## Fresh Security Sweep

### [MEDIUM] Single ModelProvider instance cannot kill concurrent same-provider steps

- **Source:** `step-model-integration.md` § Resolution in StepRunner + § ClaudeLifecycleManager impact
- **Finding:** The spec simultaneously requires "StepRunner builds `Map<string, ModelProvider>` once in its constructor" (one instance per provider name) AND "StepRunner MUST call kill() on ALL provider instances currently executing (not just the most recently started) — this covers concurrent model steps." If two concurrent steps both use `"claude"`, they share the same `ClaudeModelProvider` instance; the rule-4 pseudocode tracks a single subprocess reference, so the first step's `finally` kills whichever process was started most recently (potentially the wrong one), and the external KILL_CLAUDE cannot distinguish between the two active processes.
- **Fix:** Either (a) add an explicit NOTE to rule 4 clarifying that `kill()` MUST track all active subprocesses started by the instance (not just the last one) and kill all of them, or (b) add a statement to Decision #6 that concurrent same-provider steps are not supported in v1 (and StepRunner should serialize same-provider steps or throw on attempted concurrency). Without this, implementors will make opposite choices leading to broken kill behavior.

### [INFO] McpServer.command[] empty array not validated

- **Source:** `provider-abstraction.md` § Security requirements, rule 3
- **Finding:** Rule 3 validates string field contents (no null bytes, max 2048 chars, etc.) but does not require `McpServer.command.length >= 1`; an empty array would reach `spawn()` and fail with an OS-level error instead of a clear validation message.
- **Fix:** Add `command.length >= 1` to rule 3's McpServer field validation list.

---

**Score: 8.5/10**

No unmitigated CRITICAL or HIGH issues remain. The MEDIUM above would block correct implementation only if concurrent same-provider model steps are supported in the first shipped flow; clarifying the intent (note in rule 4 or exclusion statement) is a one-line spec change.

**SPEC IS IMPLEMENTATION-READY** pending the MEDIUM clarification on concurrent-step kill semantics.

---

## v6 Post-report fixes applied by fork

### MEDIUM: Concurrent same-provider kill() ambiguity

**Fix applied:** `step-model-integration.md` -- added v1 concurrency constraint: StepRunner MUST serialize concurrent steps that resolve to the same provider name. Cross-provider steps may still run concurrently.

### INFO: McpServer.command empty array

**Fix applied:** `provider-abstraction.md` rule 3 -- added `McpServer.command must have length >= 1`.

## Final verdict: SPEC IS IMPLEMENTATION-READY

No CRITICAL or HIGH remain. All MEDIUM issues resolved or accepted. Accepted risks documented in out-of-scope.md.
