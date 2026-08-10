# Plan Consistency Audit — Wave 3 (2026-08-10)

## Findings

### F1 — `PARSE_ERROR` and `UNSUPPORTED_STEP_TYPE` not in D34 error code list (Low → Document)
**File:** `src/daemon/CommandHandler.ts:53, 93-97`
**Problem:** D34 lists: `VALIDATION_FAILED`, `DAEMON_START_FAILED`, `PORT_CONFLICT`, `FLOW_NOT_FOUND`, `MISSING_INPUT`. `PARSE_ERROR` and `UNSUPPORTED_STEP_TYPE` are used but not listed. No cross-reference comment.
**Fix:** Add comments referencing D8 for `UNSUPPORTED_STEP_TYPE` and noting `PARSE_ERROR` as daemon-side extension of D34 exit-3 behavior.

### F2/F9 — `--input key=value` (space-separated) silently not parsed (Medium → Fix)
**File:** `src/cli/RunCommand.ts:30-37`
**Problem:** D34 example shows `flow run ./flow.yml --input branch=feat`. RunCommand only accepts `--input=key=value` (equals attached). Space form causes silent empty inputs — caller gets no error and no inputs.
**Fix:** Parse both forms: token starting with `--input=` (existing) AND `--input` followed by next arg.

### F3 — `MISSING_INPUT` listed in D34 but validation not implemented (Medium → Document)
**File:** `src/daemon/CommandHandler.ts`
**Problem:** D34 lists `MISSING_INPUT` as a known error code, implying the daemon validates required inputs. It does not — passes `cmd.inputs ?? {}` directly without checking `required: true` fields.
**Fix:** Add comment: `// MISSING_INPUT: D34 lists this code but required-input validation is not implemented in v1. Tracked for v2.`

### F4 — `LogMasker` not wired in Worker output paths, no v2 comment (Medium → Document)
**File:** `src/worker/Worker.ts`, `src/worker/StepExecutor.ts`
**Problem:** `threat-model.md` says masking applies at all output boundaries. No `LogMasker` instantiation in these files. No comment notes this is a v1 known limitation.
**Fix:** Add explicit v1-deferral comments in both files where output is sent.

### F5 — `Secret` missing `Symbol.for('nodejs.util.inspect.custom')` override (Medium → Fix)
**File:** `src/secrets/Secret.ts`
**Problem:** `threat-model.md` states the `Secret` class prevents `util.inspect` leaks. `Secret.ts` overrides `toString`, `toJSON`, `Symbol.toPrimitive` but NOT `nodejs.util.inspect.custom`. `console.log(secret)` leaks the value.
**Fix:** Add `[Symbol.for('nodejs.util.inspect.custom')]() { return '[REDACTED]'; }`.

### F6 — `LogMasker` 7 variants vs spec's 6, undocumented (Low → Document)
**File:** `src/secrets/LogMasker.ts`
**Problem:** Spec (D31) describes 6 variants. Implementation adds a 7th (base64-with-padding) for longer-match priority before the no-pad variant. This is correct behavior but undocumented.
**Fix:** Add comment explaining why padded is registered before no-pad.

### F7 — `DeclaredWorkspaceProvider` crashes if `flow.workspace` is undefined (High → Fix)
**File:** `src/daemon/CommandHandler.ts:70` or `src/worker/DeclaredWorkspaceProvider.ts`
**Problem:** `CommandHandler` passes `flow.workspace` directly to `DeclaredWorkspaceProvider`. If a flow YAML has no `workspace:` key, `this.config` is undefined → runtime crash accessing `this.config.mode`.
**Fix:** Guard in `CommandHandler`: if `!flow.workspace` skip DeclaredWorkspaceProvider construction (or use a default workspace config).
