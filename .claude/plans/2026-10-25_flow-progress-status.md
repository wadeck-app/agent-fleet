# Flow work: progress and status

Single source of truth for what is done, running and open. Update it at every state change (commit, agent start/end, decision). Status: `todo`, `doing`, `done`, `blocked`.

## Decisions by the user (do not ask again)

- project-sdk phase 1: GO (given several times). Work without waiting, recommended defaults of the plan apply.
- Orphan flow daemons/workers: clean them up (kill by literal PID with a kill bypass), find and fix the leak with TDD.
- Commit/push bypass: request it myself (two-step), no confirmation needed.

## Workstreams

| # | Workstream | Status | Notes / next step |
| --- | --- | --- | --- |
| 1 | project-sdk adoption, phase 1 (resolver swap, -p/--project, FLOW_PROJECT, projectId on executions/events) | doing (agent a9f1c5ae170ab04e4) | Plan: `2026-10-25_project-sdk-adoption.md`. Then phase 2 (projectToolDir config/data, validateLayer/mergeLayers). SDK now has the shared `-p` parser (project-owner, check version). |
| 2 | Orphan daemons/workers: cleanup + leak root cause (TDD) | done in tree, NOT committed | Cleanup 2026-10-25: only PID 30380 (private repro daemon :52100) was alive, killed; no flow process left, ports free. Agent a06f129c280d96a9e fixed 4 leaks (idle watchdog for never-contacted daemon, WebSocketServer.close closes peers, bind race after close, worker.port removal) + `flow cli processes` + ProcessLeakGuard in tests + `--wait` fails when the daemon is gone. Commit together with #1 after the full suites pass (shared files FlowIndex.ts/CliCommand.ts; project work breaks the tree meanwhile: 145 failures with PROJECT_RESOLUTION_FAILED). Delete `packages/flow-cli/vitest.nobuild.config.ts` (temp) before commit. Decision pending: `flow start` idle daemon now exits after ~30 s. |
| 3 | FlowScheduler.ts extraction (1123 lines, limit 500) | done (dbb77a61, CI green) | 460 lines + 9 collaborators, 15 characterization tests. Coverage not re-measured after the split. |
| 4 | Script steps: `timeout` field, process-tree kill, heartbeat | todo | Reported by flow-sbx, unverified: ScriptExecutor never passes timeout, SIGKILL guard `!child.killed`, no killProcessTree. |
| 5 | opencode on win32: bash tool runs under PowerShell | done in tree, NOT committed (agent a3aed41966337ef11) | SHELL forwarded = resolved Git Bash (OpenCodeWindowsShell.ts), validate warning OPENCODE_SHELL_NOT_FOUND, mock echo_shell. Unverified with a real model step (bash -l PATH, curl, UTF-8). Shares FlowCapabilitiesGenerator.ts with #4: commit after #4. Check claude/codex providers for a similar win32 shell assumption. |
| 6 | Step metrics: per-attempt cost/turns/tool_calls/files_written | plan done, impl todo | Plan: `2026-10-25_step-metrics-per-attempt.md` (6 phases; phase 1 needs real claude/opencode captures = real cost, unverified: claude total_cost_usd cumulative on relaunch?). Start with phases 2-3 (stop the cost loss: step_failed meta, attemptLog) once #1/#2 are committed. |
| 7 | Tests touching the real queue | todo | Bundle-spawning tests without FLOW_QUEUE_EVENTS=0 declare events to the real queue (CliSmoke, FlowEvents). |
| 8 | `flow start` unlocked isRunning+spawn | todo | Reuse DaemonBackgroundSpawner (lock). |
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
- Finished, awaiting commit: a06f129c280d96a9e (leak hunt, see #2).

## Log

- 2026-10-25: file created after user request to track progress.
