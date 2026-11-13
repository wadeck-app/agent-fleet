# Environment of script steps, in particular `host: true`

Status: **decision POSTPONED by the user on 2026-11-13** ("pas un problème actuellement, on verra à l'usage"). Nothing implemented: not option D, not the `FLOW_WORKER_TOKEN` strip. Analysis kept below for when the case is reopened. Audience: the user (human).

## Decision: postponed, and when to reopen

**Accepted today (facts, from sections 0 and 1):**
- A script on a normal host worker sees the worker's whole environment: your shell secrets, and `FLOW_WORKER_TOKEN` when the worker was started by a `built-in:command` source.
- A `host: true` script on the sandbox worker is filtered by the plugin's allow-list; any other plugin that adds a host path is not filtered.
- Model steps and sandbox VM scripts are isolated. No flow of the repo or of `_test-flow` uses `host: true` (static grep, 2026-11-13).

**Reopen this case, and pick option D (+ token strip) from section 3, as soon as ONE of these is true:**

| # | Condition | How to check |
|---|---|---|
| 1 | A secret value (API key, `GH_TOKEN`, `FLOW_WORKER_TOKEN`) shows up in a step log, an output file, a report or a session file | read the symptom; no automatic detection exists |
| 2 | A worker plugin other than flow-sandbox adds a host execution path (a new `ProcessLauncher` that runs scripts on the host, or a new exec variant) | review of any new worker plugin; grep `ProcessLauncher` implementations |
| 3 | A real flow gets `host: true` (repo `.flow/*.yml`, `_test-flow`, or a user flow), or `HOST_SCRIPT_WITH_MODEL_STEPS` is printed in real use | `grep -rn "host: true"`; the warning appears in `flow run` / `flow validate` |
| 4 | A worker runs somewhere other than your own machine and account (remote or shared machine, CI), or runs flows you did not write yourself | before enabling such a worker |
| 5 | The sandbox allow-list (`HostScriptEnvironment`) gets a second consumer or diverges from a copy | code review |

**Cheapest first step when reopened:** strip `FLOW_WORKER_TOKEN` in flow-cli (about 0.25 day, not breaking); it is the only secret that is certain to be exposed on the common path.

## 0. Findings that change the picture

1. **A flow cannot forward an ambient variable by name.** The template roots are `inputs`, `steps`, `task`, `subSteps`, `subStepFeedback`, `meta` (`TemplateRenderer.ts:1-14`); there is no `env` root. `HostScriptEnvironment` keeps a "declared" name only with the value the step gave it. So the drop message "declare a name in the step's env to pass it" (`HostScriptEnvironment.ts:93`) does NOT bring back `SSH_AUTH_SOCK` or `ANTHROPIC_API_KEY`: the user would have to write the secret into the flow or pass it as an input/secret. A worker-side way to allow a name is missing (see section 3).
2. **The engine does not isolate script steps on a host worker.** `ScriptStepExecutor.ts:103` passes `isolateEnv: scriptExecutor.isolatesEnvironment === true`; the host launchers answer `false`, so `ScriptExecutor.ts:154-175` takes `{ ...process.env }`.
3. **`FLOW_WORKER_TOKEN` is stripped only by the sandbox wrapper** (`ExecMain.ts:61`, `HarnessMain.ts:46`). `flow-cli` never deletes it (`WorkerLaunch.ts:90` only reads it; no `delete` in `flow-cli/src/worker`), so a script on a normal worker started by a `built-in:command` source sees it.
4. Model steps already isolate (`ClaudeModelProvider.ts:130` `isolateEnv: true`, API key re-added explicitly by `ClaudeLauncher.ts:292`). Script steps are the only unisolated path.

## 1. Who gets what today

| Path | Code | Env the script gets | Leak risk |
|---|---|---|---|
| (a) Engine, `isolateEnv: true` (reached only when the launcher `isolatesEnvironment`) | `ScriptExecutor.ts:154-175` | `PATH, HOME, TMPDIR, TEMP, TMP`; win32: `SystemRoot, USERPROFILE, FLOW_BASH_PATH`; plus step `env:` (rendered templates, `ScriptStepExecutor.ts:84-89`) plus declared `secrets` (`withSecrets`, added after `env:`, `:43-63`) | Low. Note: no `APPDATA`/`LOCALAPPDATA`/`USERNAME`, so some tools (npm, git credential helpers) may misbehave: not verified |
| (a') Engine, `isolateEnv: false` | `ScriptExecutor.ts:175` | `{ ...process.env }` + step `env:` + secrets | **High**: everything the worker process holds |
| (b) Normal host worker (`flow-cli` `Worker.ts:44-48`, `new StepRunner({interactive:false})`, `DefaultProcessLauncher`, `isolatesEnvironment=false`) | `ScriptStepExecutor.ts:103` -> (a') | Whole worker env, including `FLOW_WORKER_TOKEN`, `FLOW_WORKER_SOURCE_ID`, `FLOW_WORKER_PROJECTS` when started by a `built-in:command` source (`CommandWorkerSource.ts:14-18,66-73`: daemon env + additions, only `FLOW_DAEMON_MODE` removed) | **High**: launch token and all user shell secrets (API keys, `GH_TOKEN`, `AWS_*`) |
| (c) Sandbox VM script | `VmEnvironmentFilter.ts:58-95` on top of the engine's env | Forwarded only if declared by the step OR value differs from the host's; host-only names (`PATH, HOME, TEMP, ...`) never forwarded; ambient copies dropped, logged by name (`:98-122`) | Low. Residual stated in the class doc: a variable the engine derives itself passes |
| (d) Sandbox `host: true` | `HostScriptLauncher.ts:67-73`, `HostScriptEnvironment.ts:7-53,70-99` | Allow-list: PATH, PATHEXT, SYSTEMROOT, SYSTEMDRIVE, WINDIR, COMSPEC, TEMP, TMP, TMPDIR, HOME, HOMEDRIVE, HOMEPATH, USERPROFILE, APPDATA, LOCALAPPDATA, PROGRAMFILES, PROGRAMFILES(X86), PROGRAMW6432, PROGRAMDATA, COMMONPROGRAMFILES, USERNAME, USER, LOGNAME, OS, NUMBER_OF_PROCESSORS, PROCESSOR_ARCHITECTURE, LANG, TZ, TERM, FLOW_BASH_PATH, MSYSTEM, MSYS, MSYS2_PATH_TYPE, `LC_*`, plus declared names. Prefixes `FLOW_SANDBOX_HOST_`, `FLOW_WORKER_`, `AWS_`, `AMAZON_`, `AZURE_`, `GOOGLE_`, `GCP_` never from the baseline. Dropped names logged, never values (`describe`, `:90-94`) | Low. Only holds because the plugin wires it (`ExecMain.ts:203-215`) |
| (e) Any other worker plugin adding a host path | none | Whatever it builds on: the default `DefaultProcessLauncher` gives (a') | **High**, silently |

What the worker process itself holds (e):
- Daemon-launched worker (`built-in:command`): the daemon's whole env + `FLOW_DAEMON_WS_URL`, `FLOW_WORKER_SOURCE_ID`, `FLOW_WORKER_PROJECTS`, `FLOW_WORKER_TOKEN` (`CommandWorkerSource.ts:66-73`).
- Sandbox plugin wrapper: its README says the wrapper receives an allow-listed env, not the daemon's (exact names not read, README line truncated in my view), then adds the token; `ExecMain.ts:61` deletes the token after parsing; `WorkerCredentialFilter` (`FLOW_WORKER_*`) filters what sbx/aws children get.
- User shell env on a hand-started `flow worker`: everything (PATH, HOME, API keys, SSH_AUTH_SOCK...).

## 2. Design options for the core

| | A. Nothing in core, document + conformance helper | B. Core `ScriptEnvironmentPolicy` extension | C. Isolate by default for ALL script steps | D. Move sandbox allow-list into flow-engine, applied when `step.host === true` |
|---|---|---|---|---|
| What | Doc says plugins adding a host path must filter; ship a test helper (spawn a canary var, assert it is absent) | New optional policy on `ProcessLauncher`/`StepRunnerConfig`; `ScriptExecutor` applies it when the step is `host: true` or the launcher does not isolate; configurable list | `ScriptStepExecutor.ts:103` becomes `true` always (or flip `ScriptExecutor` default semantics) | `HostScriptEnvironment` moves to flow-engine, exported; `executeScriptStep` applies it to `host: true` steps on any launcher; sandbox keeps its launcher (idempotent) |
| Pros | 0 engine change, no regression | Single mechanism, extensible, covers future cases | Closes the leak for every script on every worker | Fixes the stated risk for every plugin with an existing, tested list; no behavior change for non-host scripts |
| Cons | Leak stays by default; relies on plugin authors; a test helper is opt-in | Largest design surface (policy API, config, versioning of extension-points) for a first version | Breaking: scripts calling `claude`, `gh`, `git push`, `npm` lose `ANTHROPIC_API_KEY`, `GH_TOKEN`, `SSH_AUTH_SOCK`, `GIT_*`, proxies, `APPDATA`; with finding 0.1 a flow has no way to get them back | Only `host: true` is covered (a normal worker script still gets all); needs the passthrough in section 3 |
| Effort | 0.5-1 d | 2-3 d | 1 d code, 2+ d migration/audit, high regression risk | 1.5-2 d |
| Existing flows | None affected | None until configured | See audit below | Only `host: true` scripts, which exist only in tests/live checks today (grep: no `host: true` in `.flow/*.yml`) |

Audit of existing flows (static grep, shell locals dominate; not run):
- `agent-fleet/.flow/flows.yml`, `flows-custom.yml`: scripts read only names declared in `env:` (`TICKET_ID, COMMENT, FLOW_ID, BACKEND_URL`); they call `node`, `git`, `npm`: need PATH only (plus HOME for git/npm user config). No `host: true`.
- `_test-flow/flows` (`01..14`, `lib/*`): `$TASK_ID`, `$REPORT`, `$DIR`... are step `env:` or script locals. Ambient reads found: `PATH`, `SystemRoot` (passed explicitly by `lib/adversarial.js:178`), `XDG_CONFIG_HOME` (`lib/exec-metrics.js:21`, falls back to `os.homedir()`), `REPORT_ROOT` (`lib/check-report.js:192`, falls back to cwd), `GIT_INDEX_FILE` (set inline in `deliver-guard.sh`, `plan-meta.sh`). Commands used: `task` (163 uses), `flow` (90), `node` (68), `npm` (16), `git` (5), `claude` (1).
- Concrete breakage under C: a script running `claude -p ...` or `git push` over SSH. `claude` needs `ANTHROPIC_API_KEY` (or its login under HOME/USERPROFILE); `git push` needs `SSH_AUTH_SOCK` and maybe `GIT_SSH_COMMAND`, `HOME` for `~/.ssh`/`~/.gitconfig`. `task`/`flow` need HOME/USERPROFILE/APPDATA (config dir `~/.config/...`, `XDG_CONFIG_HOME` optional). With the current `ScriptExecutor` isolated base, `APPDATA` is missing.
- Under D/recommendation: the same scripts, if marked `host: true`, keep PATH/HOME/USERPROFILE/APPDATA; lose `ANTHROPIC_API_KEY`, `SSH_AUTH_SOCK`, `GIT_*`, `GH_TOKEN` until allowed per worker.

## 3. Recommendation (simplest first version)

Option D, minimal, plus one worker-side passthrough:

1. Move `HostScriptEnvironment` (list, prefixes, `describe`) unchanged into flow-engine; flow-sandbox imports it. The engine applies it in `executeScriptStep` when `step.host === true` (and `stepTrace` unchanged). The plugin launcher stays: filtering twice is idempotent.
2. Default allow-list: exactly the current names/prefixes above (no new names in v1). Not added on purpose: `SSH_AUTH_SOCK` (grants use of the user's keys), `GIT_*`, proxies (may embed credentials), `NODE_*`, `npm_config_*` (may hold auth tokens), `XDG_*`, `SHELL`.
3. Worker-side passthrough (needed because of finding 0.1): env var `FLOW_HOST_SCRIPT_ENV_PASSTHROUGH=NAME1,NAME2` read by the worker at start. Names only, case-insensitive, exact names (no wildcard in v1), validated at start (empty item or invalid name = error naming the option). Logged at start: `host scripts also receive: NAME1,NAME2`.
4. User-facing rule (one line, goes in the flow docs): **A `host: true` script sees only the baseline variables, the ones you declare in `env:`/`secrets:`, and the ones the worker operator allows with `FLOW_HOST_SCRIPT_ENV_PASSTHROUGH`.**
5. Failure mode: before spawning, scan the rendered script text for dropped names (`$NAME`, `${NAME`, `process.env.NAME`, `env:NAME`; word boundary, case-insensitive on Windows). For each match, warn once and append the same line to the step stderr via the engine's `[flow]` notice mechanism (`ScriptExecutor.ts` `notice`):
   `Step 'deploy' (host: true) uses NAME, which is in the worker environment but is not passed to host scripts. Fix: declare NAME in the step's env: (with a value), or have the worker started with FLOW_HOST_SCRIPT_ENV_PASSTHROUGH=NAME.`
   Under bash `-u` the script itself also fails with `NAME: unbound variable`, so the cause and fix appear together. A script that reads the variable indirectly (a tool reading `SSH_AUTH_SOCK`) cannot be detected: it fails with the tool's own error; the start-time log of dropped names (below) is the pointer, and the docs list the usual names (`SSH_AUTH_SOCK`, `GIT_*`, `ANTHROPIC_API_KEY`, `GH_TOKEN`).
6. Logging dropped names without values: reuse `describe` (count, first 12 sorted names, `...`), once per step at info level (`ScriptExecutor` already has per-step logging). Never log values, never log the mere presence of secret-looking names beyond the name.
7. Out of scope v1, recorded as follow-ups: strip `FLOW_WORKER_TOKEN` in `flow-cli` itself for scripts on a normal worker (finding 0.3; one-line `delete` after `WorkerLaunch` reads it, ~0.25 d, strongly suggested and not breaking); isolating non-host scripts (option C); a policy extension (option B); wildcard passthrough; per-step passthrough.

Effort: 1.5-2 d (move + tests 0.5 d, engine wiring 0.5 d, passthrough + validation 0.5 d, scan/warn + docs 0.5 d). Tests: canary variable absent for host step on a plain `DefaultProcessLauncher`; present when declared or passed through; token never present; warning text asserts the variable name and both fixes.

## 4. Decision record (store in `.claude/docs/flows/host-script-environment.md` when implemented)

```
# Host script environment

Decision (2026-11-13): a script step marked `host: true` receives an allow-listed environment, enforced by flow-engine
for every worker and plugin; other script steps are unchanged.

Rule: a host script sees only the baseline variables, the names declared in its `env:`/`secrets:`, and the names the worker
operator lists in `FLOW_HOST_SCRIPT_ENV_PASSTHROUGH`.

Baseline: see HostScriptEnvironment (program lookup, system/temp/user directories, locale, FLOW_BASH_PATH, MSYS). Never
from the baseline: FLOW_SANDBOX_HOST_*, FLOW_WORKER_*, AWS_*, AMAZON_*, AZURE_*, GOOGLE_*, GCP_*.

Why: the engine hands a script the worker's whole environment (ScriptStepExecutor isolateEnv), which holds the launch
token and user secrets; `host: true` runs next to them with the user's rights.

Why not now:
- Isolate all scripts (breaks scripts that call claude, gh, git over SSH; flows cannot forward an ambient name).
- Policy extension (API surface before a second use case exists).
- Wildcard or per-step passthrough (add when a flow needs it).

Failure: the step warns, naming the variable and both fixes (declare in `env:` or operator passthrough). Dropped names are
logged, never values.

Revisit when: a second plugin needs a different baseline, a flow needs a wildcard, or non-host scripts must be isolated.
```

## 5. Not verified

- Runtime contents of a real daemon/worker environment; only code paths read.
- Exact allow-list of the sandbox plugin's `wrapper.cjs` (README line truncated).
- Whether `npm`, `git`, `task`, `flow` work with the engine's isolated base (no `APPDATA`) on Windows: not run.
- That no other plugin currently builds a host path: only `ExecMain.ts` found (`createHostExecutor`); plugin API for third parties not reviewed.
- The flow audit is a regex over `_test-flow/flows` and `.flow/*.yml` only; other repos' flows and `.agent-fleet` flows not scanned.
- Whether `FLOW_WORKER_TOKEN` is removed somewhere else in `flow-cli` outside `src/worker` (grep of `flow-cli/src` shows no such `delete`).
