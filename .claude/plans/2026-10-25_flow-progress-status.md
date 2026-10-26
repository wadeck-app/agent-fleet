# Flow work: progress and status

Single source of truth for what is done, running and open. Update it at every state change (commit, agent start/end, decision). Status: `todo`, `doing`, `done`, `blocked`.

## Decisions by the user (do not ask again)

- project-sdk phase 1: GO (given several times). Work without waiting, recommended defaults of the plan apply.
- Orphan flow daemons/workers: clean them up (kill by literal PID with a kill bypass), find and fix the leak with TDD.
- Commit/push bypass: request it myself (two-step), no confirmation needed.

## Workstreams

| # | Workstream | Status | Notes / next step |
| --- | --- | --- | --- |
| 1 | project-sdk adoption | phase 1 DONE (1b3f3f31), phase 1b + 2 DONE (1438ea13: SDK helpers, queue project id, config in registry via validateLayer/mergeLayers); verified live on agent-fleet and test-flow | Open: swap commander -p for SDK parser not done (kept commander + SingleProjectOption); `Daemon did not start` cause not logged when launch folder has a legacy config; ResumeCommand bare catch. |
| 2 | Orphan daemons/workers: cleanup + leak root cause (TDD) | DONE (1b3f3f31) | Cleanup 2026-10-25: only PID 30380 (private repro daemon :52100) was alive, killed; no flow process left, ports free. Agent a06f129c280d96a9e fixed 4 leaks (idle watchdog for never-contacted daemon, WebSocketServer.close closes peers, bind race after close, worker.port removal) + `flow cli processes` + ProcessLeakGuard in tests + `--wait` fails when the daemon is gone. Commit together with #1 after the full suites pass (shared files FlowIndex.ts/CliCommand.ts; project work breaks the tree meanwhile: 145 failures with PROJECT_RESOLUTION_FAILED). Delete `packages/flow-cli/vitest.nobuild.config.ts` (temp) before commit. Decision pending: `flow start` idle daemon now exits after ~30 s. |
| 3 | FlowScheduler.ts extraction (1123 lines, limit 500) | done (dbb77a61, CI green) | 460 lines + 9 collaborators, 15 characterization tests. Coverage not re-measured after the split. |
| 4 | Script steps: `timeout` field, process-tree kill, heartbeat | DONE (commits 2f..1b3f3f31, installed 723; POSIX paths untested) | Reported by flow-sbx, unverified: ScriptExecutor never passes timeout, SIGKILL guard `!child.killed`, no killProcessTree. |
| 5 | opencode on win32: bash tool runs under PowerShell | DONE (1b3f3f31, installed; real model step unverified) | SHELL forwarded = resolved Git Bash (OpenCodeWindowsShell.ts), validate warning OPENCODE_SHELL_NOT_FOUND, mock echo_shell. Unverified with a real model step (bash -l PATH, curl, UTF-8). Shares FlowCapabilitiesGenerator.ts with #4: commit after #4. Check claude/codex providers for a similar win32 shell assumption. |
| 6 | Step metrics: per-attempt cost/turns/tool_calls/files_written | phases 2-3 DONE (1438ea13); phases 4-5 DONE in tree, NOT committed (2026-10-26); phase 6 docs mostly done | Cost rule measured (claude usd/tokens cumulative per session): `flow-core/src/execution/StepCost.ts` is the only cost computation (deltas per session, unknown never 0, `$2.7900+ (2 attempts unknown)`); `attemptLog` entries carry `sessionId` + `provider` (provider added to ModelStepMeta). Used by ExecutionView (`costUsd` = step TOTAL, new `lastAttemptCostUsd`/`costComplete`/`costLabel`/`attemptHistory`, `totalCost*`), flow show + history (StepCostLines), StepIO, FlowGraphBuilder, app-module-flow Cost column, chart panel, queue events (`costUsd`, `stepTotalCostUsd`, `stepTotalCostComplete`, `turns`, `toolCalls`, `endReason`), web contract + steps table/header. Open: opencode/codex shared-session cost semantics unverified (shown unknown), no browser check of the web/chart UI, contract still lacks flowVersion/versionLabel/versionNote (pre-existing). |
| 7 | Tests touching the real queue | DONE (1438ea13) | FLOW_QUEUE_EVENTS=0 default in createIsolatedCliEnv + BundledDaemonQueueIsolation test. |
| 8 | `flow start` unlocked isRunning+spawn | DONE (1438ea13) | StartCommand via DaemonBackgroundSpawner. |
| 9 | Dashboard widget at 2 cells breaks; logs-page dock covers 1/3 of the viewport | todo | Min width 3 declared; improve dock/legibility. |
| 10 | Remaining cleanups | todo | `isRecord` triple duplication (flow-engine), CopyButton duplicate, WebSocketServer-like fixed-port tests audit, snapshot pruning, subflow support in the daemon, stale `.claude/temp` scratch files. |
| 11 | Purge of old temp dirs | blocked | User runs the purge command given in the chat (>24h, five prefixes). |

## Done (pushed, CI green)

Secrets, step I/O, versions, queue events, waves + transitive settling + restart reset, engine-origin failures, stall message with in-flight tool, end-of-turn handling for Claude, worker disconnect diagnostics, cold-start double daemon fix (4da6bb8e), listener fallback + close on every stop path (498e6dc0), temp dir leaks (createTempDirectory), shared ReleaseVersion guard (4c88b406), WebSocketServer EACCES (d3703c19), logs page A/B (dedeaa7e), widget RunBars (6d063ec2), flow skill docs.

## Running agents

- a9f1c5ae170ab04e4: project-sdk phase 1 (flow-cli config/resolution, IPC run, ExecutionStore/State, events, docs). Avoids daemon stop paths.
- a75b181471c61aa51: FlowScheduler.ts extraction (flow-engine/orchestration only).
- a4c42a9759096977c: script step timeout, tree kill, heartbeat (ScriptExecutor/ScriptStepExecutor, validation, docs generator).
- a3aed41966337ef11: opencode shell on win32 (OpenCodeModelProvider env, validate warning, docs generator).
- ac60d0a0fbbf5ca53: SKILL.md edits for project-sdk/timeout/opencode/processes (bypass skill-write-project valid until 00:11Z).
- a168a0703c32d11d1: hardening, FINISHED, in tree, NOT committed (entangled with the two agents below; commit all together after a green full run). Done: OsProcessTable injectable reader + longer timeouts, FLOW_QUEUE_EVENTS=0 in createIsolatedCliEnv, `flow start` via StartCommand/DaemonBackgroundSpawner (waits for the port), FlowRegistry keeps model `timeout`, WebSocketServer.test fixed ports -> 0, isRecord dedup (StepMetricsCollector.ts still has a copy). OPEN: FlowRegistry model-step branch also drops subStepFeedbackPrompt/tools/skipPermissions/contextLimit/onCompact/permission (unverified whether another loader fills them).
- a004c951c83f1b9ff: project-sdk phase 1b + 2 (lock refresh, SDK helpers, queue publisher project option, projectToolDir config, validateLayer/mergeLayers).
- a90828e40c6b7f90b: step metrics phases 2-3 (attemptLog, step_failed meta, turns/tool_calls/files_written).
- Next to launch: step metrics phases 2-3 (plan 2026-10-25_step-metrics-per-attempt.md); project-sdk phase 2; dock/legibility of logs page (low).

## Remaining open (as of 2026-10-26, after 939a8a7b, installed 735)

| Item | State |
| --- | --- |
| Steps table expands one row at a time | check whether the DataTable accordion is intended; ask dsl-owner if not |
| POSIX paths of the script tree kill (pgrep, SIGTERM, snapshot) | untested (Windows-only machine) |
| Real opencode step under Git Bash (bash -l PATH, curl, UTF-8) | unverified |
| Cost semantics for opencode/codex shared sessions and more than 2 claude attempts | unverified (shown unknown) |
| FlowExecutionSummarySchema lacks flowVersion, versionLabel, versionNote (API drops them) | todo |
| web-frontend flow-engine.types.ts keeps its own step interfaces (drift risk) | todo |
| Daemon start failure cause: only the legacy-config case is tested end to end | partial |
| singleton-daemon-kit: map `socket hang up` and EPIPE; optional first-wins mode | request to the kit owner |
| Old leaked temp dirs | the user runs the purge command given in chat |
| Scratch files to delete (the delete guard blocks me): `.claude/temp/*`, `%TEMP%/flow-old-bundle-red`, `%TEMP%/leakprobe`, `flowmeasure-19222`, untracked `packages/flow-cli/src/__scratch_verify_opencode.test.ts` | the user, or a delete bypass |

## Date formatting migration (done in the working tree, not committed; CI and install pending)

- Lock: dsl-ui and dsl-renderer 2026.10.26-290-52b6493c (12 lines changed; 291 is already published). Manifest `dslLib.shared` ranges are `>=2026.10.26-290-0` in both modules: `^2026.10.26-290` and `>=2026.10.26-290` also accept the older `-279-...` and `-289-...` builds, because semver ranks the numeric prerelease `290` below any alphanumeric one. The modules load only on a shell >= 290.
- Stop-gap `commons/DateText.ts` modules deleted. RunBars, RunList, LogLine and the step panel use `useDateFormat()` / `DateText`; `describeStep` hands ISO values (`isDate`) to the panel. RunBars labels each bar with the weekday of its own date (read at noon of the server-local day) in the user's weekday style; bars stay in data order.
- Guard `CentralDateFormatter.test.ts` replaces `NoImplicitLocale.test.ts`. DSL columns carry `dateStyle` (short in lists, medium in the detail page and log time). `StepChips` uses `top-shell-bar`; the `calc(...+0.5rem)` and `max-h` arbitrary values stay (no preset utility for them).
- Verified live on an isolated app-core 127 (dsl-ui 290) with fr-FR, Sunday-first, narrow, ISO, UTC. Not verified in the browser: log `absolute` time mode and sticky chips (the A/B dock needs a shell started with `--ab-tests`); unit tests cover both.
- Open for dsl-ui: `weekdayStyle` is not part of `DateFormatter.key`, so changing only the weekday style does not re-render until reload.

## Log

- 2026-10-26: 939a8a7b (CI green, installed 735): attempts expansion in the steps table and one Cost row in the chart panel, verified on the user's :5173 (ajk42rid expands with 2 attempts and the reason; q8bbdk5u has no chevron; keyboard toggle works; no console errors). dsl-ui and dsl-renderer lock bumped to 2026.10.26-279 (a03074a6). Four agent test servers stopped by PID.

- 2026-10-25: file created after user request to track progress.
- 2026-10-26: project-sdk 1b + phase 2: SDK helpers (findProjectIncludingDeleted), queue events carry the project id, per-project flow config in the registry (plugins/hooks, schema-validated; repo .flow/config.yml is an error with the mv command); single -p per command.

- 2026-10-26: 1536fab5 (CI green, installed 726): flow run survives an idle-stopping daemon (bounded retries, DAEMON_STOPPING, in-flight check), refusals print no stack (FLOW_DEBUG=1). 6 consecutive runs OK live. flow-test moved test-flow config into the registry (verified).
- 2026-10-26: ac9878af (CI green, installed 729): startup failure cause (daemon-start-error.json), contact errors keep the cause, ExecutionStore split (389 lines), FlowRegistry StepFieldCopier. Agent ad85c48f49ef83f4c: metrics phases 4-5 (session-cumulative cost rule, display, web contract).
- TODO (dsl-owner request): bump @wadeck-app/dsl-ui and dsl-renderer in package-lock from 2026.10.24-161 to latest as single entries, rebuild the dslLib bundles of app-module-flow and app-module-flow-chart (PageHeader -> PageSection deprecation: grep usages; unknown Badge variant now warns), keep dslLib ranges unless the shell requires more; run module tests + agent-browser check on the real pages. Do after the metrics agent (lockfile/node_modules). The capability-framework apps are NOT mine (user said do not touch).
- 2026-10-26: a6508271 (CI green, installed 732): non-model steps no longer count in cost totals (verified live: flow show q8bbdk5u Total $0.0064; ajk42rid script step has no 'cost unknown'). Browser check on :5173 (agent aaa7630727c04aece): q8bbdk5u page OK (Cost column, total $0.0064, check shows '-'), logs page OK. FAILURES to fix next (after the dsl bump agent a5c99489bc665bbb3 finishes, it edits the same views): (1) app-module-flow execution page for ajk42rid shows 'unknown' with no explanation and NO attempts list in the steps table (only the plain-text block lower on the page) -> add an expandable row (DataTable expansion) per multi-attempt step with the attempt table and the unknown reason; (2) chart step panel shows Cost twice (details rows + metrics block) -> keep one.
