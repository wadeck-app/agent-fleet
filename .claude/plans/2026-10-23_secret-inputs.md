# Secret inputs: design and decisions (2026-10-23)

## Evidence (step 0)

- `SecretProvider`, `Secret`, `LogMasker` (packages/flow-cli/src/secrets) are referenced only by their own tests (lessons-learned.md:6663).
- `RunCommand.validateSecretInputs` only checks that a `type: password` input value looks like `env://`, `file://` or `input://`. Nothing resolves it: the flow receives the URI text.
- No input is persisted in the execution record. Step outputs are in daemon memory only (`context.stepOutputs`), but `stdout`/`stderr`/`error` of failed steps are persisted (ExecutionStore.markStepFailed), and every worker `log` entry is appended to the daily log (LogWriter).
- `LogMasker` is whole-string regex; its tests have no chunk/split case; it matches base64 "offset" fragments and hex (heuristic-adjacent) and skips variants < 4 chars.
- Script stdout is captured whole by the engine, then split on `\n` by `WorkerAdapter.sendStdoutAsLogs` (one `log` message per line). There is no live byte-chunk streaming for scripts. Model steps stream `assistant_text` entries.
- Values cross the daemon -> worker boundary in the `assign` message (`ExecutionContext.inputs`, step `env`). Worker -> daemon: `log`, `step_completed{output}`, `step_failed{error,output,stdout,stderr}`.
- `flow.env` is rendered in the daemon (CommandHandler) and merged into EVERY step's env.
- Script steps run with `isolateEnv:false`: they inherit the worker process env (allow-list built by ForkWorkerSource.buildEnv; a worker started by hand inherits its whole shell env).
- `CLI argv` is written to the daily log (FlowIndex.ts) before any validation, including `-i key=value`.

## Decisions

| Topic | Decision | Why |
| --- | --- | --- |
| Flow-level declaration | Existing `type: password` input = secret. Value at run time is a reference: `-i NAME=env://VAR` or `file://./rel/path`. Optional `default:` must be such a reference. | Backward compatible, no second concept. A literal is refused (already today). |
| `input://` | Refused with an actionable error. | It would read a literal from another CLI input, and CLI argv is logged. |
| `value://` | Refused. | Literal in the command line. |
| Step-level declaration | `secrets: [NAME, ...]` on `script` steps: env var `NAME` is set for that step. `${{ inputs.NAME }}` in a script text or step `env` also works. | Explicit, visible in `flow show`, least surprising. |
| Who receives a secret | Only steps that reference it (explicit `secrets:` or `inputs.NAME` anywhere in the step, found by a template scan). The `assign` message carries only those values in `executionContext.secrets`; `executionContext.inputs` never contains secret names. | Least privilege, also towards remote workers. |
| Model / user_intervention / subflow steps, flow-level `env` | Referencing a secret there is a validation ERROR (never allowed). Injected steps (`provideSteps`) referencing a secret are refused. | The model (and its transcript) would see the value; flow `env` fans out to every step. Use a script step. |
| Resolution timing | Daemon, in `handleRun` right after flow validation, BEFORE workspace allocation and any step. All failures are reported together. | Fail fast, nothing started. |
| Resolution source | `env://` is read from the DAEMON process environment (not the shell of `flow run`). `file://` is read fresh at each run, relative to the run cwd, no absolute path, no traversal, no symlink escape; one trailing CR/LF is trimmed. | Directive: daemon resolves. The env staleness is documented; error message says it. Prefer `file://`. |
| Minimum length | 8 characters (after trimming). Shorter is refused. | TM-02 in specs audits recommends 8+; masking shorter values destroys output and leaks by guessing. |
| Unused / missing | An undeclared-use secret that is not supplied is skipped. A secret used by a step must be supplied, else run refused. | No empty value ever. |
| Masker lifecycle | One `SecretMasker` per execution, built from the resolved values, registered in `ExecutionMasks` keyed by executionId, kept for the daemon lifetime (late messages must not leak; released only with the process). Resume of a kept-alive execution re-resolves from the stored references (references are not secret, values are never persisted). | Resume reuses the same daemon process; re-resolving picks up rotated values. |
| Placeholder | `[secret:NAME]`. Name only. | Reader knows which secret was hidden. |
| Masking failure | Output is replaced by `[secret-masking-failed]` and a daemon warning is logged. Raw text is never written. | Fail closed. |

## What the masker covers (exact value only, no pattern, no name guess)

For each secret value `v`: `v`; JSON-escaped `v` (`JSON.stringify(v)` without quotes); `encodeURIComponent(v)` and its `+` for space form; base64 (padded, unpadded, url-safe unpadded) of the UTF-8 bytes of `v`; hex (lower and upper) of those bytes. For a multi-line `v`: each line of at least 8 characters is also masked on its own, so line-by-line log entries cannot reveal it. Longest variant first.

Not covered (documented): substrings or transformations of `v` (split, reversed, hashed, case-changed, shell-quoted, embedded in a larger base64 blob such as `user:TOKEN` Basic auth), a secret split mid-line across two separate messages (no such path exists today: scripts are captured whole and masked as a whole before splitting; model steps never receive a secret), secrets shorter than 8 characters (refused), values that a step reads from the environment itself and that are not declared (leak path below), anything written by a step to files in the workspace, network calls made by the step.

## Sinks and how each is masked

| Sink | Masking |
| --- | --- |
| Worker -> daemon `log`, `step_completed`, `step_failed` | Worker masks whole stdout/stderr/output/error with the values it received (before line splitting). Daemon masks again at ingress (Daemon.ts) with all execution secrets. |
| Daily log (`LogWriter`) | Constructor-injected `ExecutionMasks`; every `write` / `writeExecution` message. |
| Execution record (`ExecutionStore`) | Constructor-injected; every string leaf of the state before `JSON.stringify`. |
| `context.stepOutputs`, scheduler errors, hooks payload | Masked at ingress, so later steps and plugins see the placeholder. |
| Worker terminal (`WorkerDisplay`) | Receives the already masked messages from the adapter. |
| CLI follow (`flow run`), `flow logs`, `flow show`, `flow history`, HTTP routes served from records | Read what the two stores wrote, so they are masked. |
| CLI argv in the daily log | `-i/--input` values are no longer logged (name only). |
| IPC responses | Carry ids, statuses and `lastError` read from the masked store. Secret errors name the input and the source, never a value. |

## Not covered (leak paths)

- Steps inherit the worker process environment (`process.env`). An env var that holds a secret but is NOT a declared secret is not masked. Declaring it as a secret input masks it. The default inheritance is a separate decision and is unchanged.
- Records and logs written before this feature may contain secrets (the web modules document a grep recipe).
- Values passed on a script command line are visible to other local processes; prefer `secrets:` + `$NAME`.
- Resume after a daemon restart is not supported (already the case), so no value is ever re-read from disk by a new process.
- A remote worker receives the plaintext of the secrets its step uses (needed to run the step); transport protection is the existing worker transport.

## Agent visibility

- `flow docs` (FlowCapabilitiesGenerator) gets a "Secrets" section with a working example.
- `flow validate`: codes `SECRET_UNKNOWN`, `SECRET_INVALID_NAME`, `SECRET_FORBIDDEN_STEP`, `SECRET_BAD_REFERENCE`, warning `SECRET_IN_SCRIPT_TEXT`.
- `flow show <flow file>` lists secret name, source kind, steps using it. Never values.
- Runtime errors (typed): `SecretUnresolvedError`, `SecretTooShortError`, `SecretSourceError` (refused scheme/path).
