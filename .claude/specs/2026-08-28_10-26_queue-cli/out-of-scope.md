# Out of Scope -- Queue CLI

Items listed here are **explicitly excluded**.
Raising an excluded item as a requirement is a change-of-scope conversation, not a design question.

## Excluded items

### Queue -> Orchestrator trigger direction

**Reason:** `@wadeck/orchestrator` is a cron scheduler. Triggering a job on-demand from an event is done by calling the command directly as a queue subscriber -- routing via the orchestrator adds no value.
**Decision:** D-4

### External message brokers (Redis, BullMQ, RabbitMQ)

**Reason:** Out of scope for v1. The system is designed to be a simple local in-process queue with file-based WAL. The architecture must allow future migration to an external broker without breaking producers/subscribers.
**Covered by:** future v2 spec if needed.

### violations-framework as a `beforeXxx` subscriber

**Reason:** violations-framework does not listen to `beforeStepEnd` directly. That is the policy-engine's role -- it decides whether to inject a violations-check step. violations-framework is a tool that runs when invoked, not a queue subscriber.
**Decision:** Clarified during inventory session 2026-08-28.

### Web UI for hook/subscription management

**Reason:** Out of scope for v1. Subscriptions are configured via config files, not a UI.
**Covered by:** meta-hooks-flow-cli OQ-6 (superseded).

## How to challenge scope

If you believe an item should be in scope, open a new discussion with the rationale.
Do not modify this file silently -- scope changes must be acknowledged as a versioned decision.
