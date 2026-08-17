# Spec: Meta Hooks for flow-cli

**Created:** 2026-08-17
**Version:** v0.1
**Status:** In Progress -- v0.1 -- 0/? questions resolved
**Iteration:** 1

## Summary

A hook system already exists in flow-cli (HookDispatcher, 8 events, cli + http transports, fire-and-forget semantics). This spec covers what "meta hooks" adds on top: the scope, the gaps (fail-task behavior, ordering, richer payloads), and any new hook points from the web UI or web-backend layer that are NOT yet wired.

## Decision Log

| #   | Decision     | Status | Date | Rationale |
| --- | ------------ | ------ | ---- | --------- |
| -   | _(none yet)_ | -      | -    | -         |

## Open Questions

| #   | Question                                                               | Priority | Status |
| --- | ---------------------------------------------------------------------- | -------- | ------ |
| 1   | What does "meta hooks" add beyond the existing HookDispatcher?         | Critical | Open   |
| 2   | Should hooks be able to block/fail-task (deferred D32 behavior)?       | High     | Open   |
| 3   | Are task events from web-backend (web UI task creation) also in scope? | High     | Open   |
| 4   | Hook ordering: concurrent (current) vs sequential?                     | Medium   | Open   |
| 5   | Payload enrichment: what extra fields are needed?                      | Medium   | Open   |
| 6   | Hook management UI (web interface to configure/test hooks)             | Medium   | Open   |

## Modules / Sub-files

| File                    | Contents                              |
| ----------------------- | ------------------------------------- |
| `guiding-principles.md` | Core principles driving all decisions |
| `out-of-scope.md`       | Explicitly excluded items             |
| `threat-model.md`       | Security threats and mitigations      |

## Changelog

| Version | Date       | Summary              |
| ------- | ---------- | -------------------- |
| v0.1    | 2026-08-17 | Initial spec created |
