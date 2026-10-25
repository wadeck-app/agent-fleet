# Flow work: progress and status

Single source of truth for what is done, running and open. Update it at every state change (commit, agent start/end, decision). Status: `todo`, `doing`, `done`, `blocked`.

## Decisions by the user (do not ask again)

- project-sdk phase 1: GO (given several times). Work without waiting, recommended defaults of the plan apply.
- Orphan flow daemons/workers: clean them up (kill by literal PID with a kill bypass), find and fix the leak with TDD.
- Commit/push bypass: request it myself (two-step), no confirmation needed.

## Workstreams

| # | Workstream | Status | Notes / next step |
| --- | --- | --- | --- |
| 1 | project-sdk adoption, phase 1 (resolver swap, -p/--project, FLOW_PROJECT, projectId on executions/events) | todo | Plan: `2026-10-25_project-sdk-adoption.md`. Then phase 2 (projectToolDir config/data, validateLayer/mergeLayers). SDK now has the shared `-p` parser (project-owner, check version). |
| 2 | Orphan daemons/workers: cleanup + leak root cause (TDD) | todo | Suspect: pre-498e6dc0 stop paths (fixed). Prove no leak on the current build for every stop path (flow stop, idle, signal, update, crash), including workers outliving the daemon. |
| 3 | FlowScheduler.ts extraction (1123 lines, limit 500) | todo | Behaviour-preserving, tests first. |
| 4 | Script steps: `timeout` field, process-tree kill, heartbeat | todo | Reported by flow-sbx, unverified: ScriptExecutor never passes timeout, SIGKILL guard `!child.killed`, no killProcessTree. |
| 5 | opencode on win32: bash tool runs under PowerShell | todo | Forward `SHELL` (Git Bash) to opencode or document; `flow validate` warning for opencode model steps on win32 without SHELL. |
| 6 | Step metrics: per-attempt cost/turns/tool_calls/files_written | todo | Requested by flow-test; record-format change (flow-core, engine, UI). Plan file first. |
| 7 | Tests touching the real queue | todo | Bundle-spawning tests without FLOW_QUEUE_EVENTS=0 declare events to the real queue (CliSmoke, FlowEvents). |
| 8 | `flow start` unlocked isRunning+spawn | todo | Reuse DaemonBackgroundSpawner (lock). |
| 9 | Dashboard widget at 2 cells breaks; logs-page dock covers 1/3 of the viewport | todo | Min width 3 declared; improve dock/legibility. |
| 10 | Remaining cleanups | todo | `isRecord` triple duplication (flow-engine), CopyButton duplicate, WebSocketServer-like fixed-port tests audit, snapshot pruning, subflow support in the daemon, stale `.claude/temp` scratch files. |
| 11 | Purge of old temp dirs | blocked | User runs the purge command given in the chat (>24h, five prefixes). |

## Done (pushed, CI green)

Secrets, step I/O, versions, queue events, waves + transitive settling + restart reset, engine-origin failures, stall message with in-flight tool, end-of-turn handling for Claude, worker disconnect diagnostics, cold-start double daemon fix (4da6bb8e), listener fallback + close on every stop path (498e6dc0), temp dir leaks (createTempDirectory), shared ReleaseVersion guard (4c88b406), WebSocketServer EACCES (d3703c19), logs page A/B (dedeaa7e), widget RunBars (6d063ec2), flow skill docs.

## Running agents

(none recorded; add id, goal, files owned)

## Log

- 2026-10-25: file created after user request to track progress.
