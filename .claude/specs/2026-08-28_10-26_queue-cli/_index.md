# Spec: Queue CLI

**Created:** 2026-08-28
**Version:** v0.1
**Status:** In Progress -- v0.1 -- 6/? questions resolved
**Iteration:** 1

## Summary

A centralized `queue` CLI that replaces the 3 independent hook/webhook systems that exist today (task-cli CLI-only hooks, flow-cli CLI+HTTP hooks, web-backend internal EventBus). Producers push named events with a JSON payload; subscribers are configured per-project. The producer decides whether the dispatch is fire-and-forget (`onXxx`) or blocking (`beforeXxx`, waits for all subscriber responses with structured return). Supersedes the unresolved `meta-hooks-flow-cli` spec and formally replaces decision D32 ("hook failures silently ignored").

## Decision Log

| #   | Decision                                                                                                    | Status   | Date       | Rationale                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------- | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | `onXxx` = async (fire-and-forget), `beforeXxx` = blocking (waits for subscriber response)                   | Resolved | 2026-08-28 | P-1 + industry convention (Fastify, NestJS); producer decides blocking via event name prefix                                            |
| D-2 | `beforeXxx` return contract: `{action: 'continue', payload?: {...}}` or `{action: 'abort', reason: string}` | Resolved | 2026-08-28 | `reason` required on abort so the producer (e.g. flow-cli) can surface a meaningful error                                               |
| D-3 | meta-hooks-flow-cli spec (2026-08-17, 0/6 questions resolved) is superseded by this spec                    | Resolved | 2026-08-28 | queue CLI covers the same problem space (D32, ordering, richer payloads) with a broader scope                                           |
| D-4 | Queue -> Orchestrator direction is out of scope                                                             | Resolved | 2026-08-28 | Orchestrator (@wadeck/orchestrator) is a cron scheduler; on-demand triggers go directly to the command, no benefit in routing via queue |
| D-5 | Orchestrator -> Queue: orchestrator natively emits `onJobStart`, `onJobCompleted`, `onJobFailed` to queue   | Resolved | 2026-08-28 | 3 native queue push calls in scheduler.ts after exit code capture; no `&&` hacks                                                        |
| D-6 | Delivery guarantee: WAL (write before dispatch) + exponential backoff retry + dead letter queue after X failures; `beforeXxx` = immediate error if subscriber unavailable, no retry | Resolved | 2026-08-28 | `beforeXxx` is synchronous -- retrying a blocking gate makes no sense. `onXxx` needs guaranteed delivery for pipeline chains (Cluster 2) |

## Open Questions

| #   | Question     | Priority | Status |
| --- | ------------ | -------- | ------ |
| -   | _(none yet)_ | -        | -      |

## Modules / Sub-files

| File                     | Contents                                                  |
| ------------------------ | --------------------------------------------------------- |
| `guiding-principles.md`  | Core principles driving all decisions                     |
| `out-of-scope.md`        | Explicitly excluded items                                 |
| `threat-model.md`        | Security threats and mitigations                          |
| `producers-inventory.md` | All known producers, their events, and concrete use cases |

## Changelog

| Version | Date       | Summary                                                                |
| ------- | ---------- | ---------------------------------------------------------------------- |
| v0.1    | 2026-08-28 | Initial spec created                                                   |
| v0.1    | 2026-08-28 | Added D-1 through D-5, inventory, clusters, principles P-1 through P-4 |
