# Step input/output recording (2026-10-24)

Goal: a past execution shows what each step received and produced (run chart panel, run page, `flow show <id> --io`).

## Evidence

- Record (`StepState`) held status, times, attempts, error, meta, and stdout/stderr of FAILED steps only. Outputs lived in daemon memory (`context.stepOutputs`).
- The worker already holds everything: `StepTrace` has `prompt` (model, rendered), `stdout`, `stderr`, `outputs`; script `env` is rendered in `ScriptStepExecutor` but not kept in the trace.
- Model step `env` is NOT rendered by the engine (passed as written), so it is a declaration, not a resolved value: not recorded.
- Secret inputs never reach `context.inputs`; they arrive in `context.secrets` (secret-inputs plan 2026-10-23).

## What is recorded per step attempt (`StepState.io`)

| Key (in `io.inputs` unless noted) | Content |
| --- | --- |
| `inputs.NAME` | Flow input `NAME` referenced by the step (`${{ inputs.NAME }}` or `{% ... inputs.NAME %}`), resolved. A secret/password input is the placeholder `[secret:NAME]`, its value is never copied. |
| `env.NAME` | Rendered `env` entry of a script step (declared `secrets:` excluded). |
| `secrets.NAME` | Declared `secrets:` of a script step: placeholder only. |
| `prompt` | Rendered prompt of a model step, head only (cap below). The script text is NOT an input. |
| `io.outputs` | The extracted output map later steps consume. Non-strings are JSON text. |
| `io.stdout`, `io.stderr` | Tail of every step. A model step's `stdout` is its final response. |

Each value is `{ text, truncated, chars }` (`chars` = original length). The step has `truncated` (any value cut or emptied) and `storedChars`.

## Caps

Per value 4096 chars; per step 32768 (texts; names are flow-declared and not counted); per execution 1048576 (sum over steps). Inputs/outputs keep the head, stdout/stderr the tail. Past a budget a value is stored empty with `truncated: true` and its `chars`; nothing is dropped silently. Order of budget use: inputs, outputs, stdout, stderr.

## Secrets

The recorder masks each text with the per-execution masker BEFORE truncating: truncating first could cut a secret in half so no variant matches and a prefix leaks. The store masks again on write (existing). The worker and the daemon ingress already mask (secret-inputs plan). Undeclared secrets (inherited env vars) are NOT masked: authors must declare them (documented in `flow docs`).

## Format

Additive `StepState.io` in flow-core `ExecutionState.ts`. Absent on records written before: every reader keeps working and says "not recorded for this run". No version field: presence of `io` is the marker. A new attempt clears `io`; a retry rewrites it.

## Decisions

- Default ON, caps always applied.
- No `record: false` flow opt-out: needs schema + validator + daemon plumbing, and the right control for sensitive data is declaring it a secret. Revisit on demand.
- Mask before truncate (proved by a test).
- Legacy `stdout`/`stderr` of failed steps stay (uncapped, existing behaviour); `io` is the capped, all-steps view.

## Readers

flow-core `describeStepIO` (chart panel data), `renderExecutionDetail` (`flow show --io`), app-module-flow-chart sections (Inputs/Outputs with show more, truncation note, copy), app-module-flow execution page (collapsed section per step).
