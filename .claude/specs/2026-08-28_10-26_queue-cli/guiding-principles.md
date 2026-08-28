# Guiding Principles -- Queue CLI

These principles take priority in every design decision.
Any option that conflicts with a principle must be raised as an open question -- never silently accepted.

## Principles

### P-1: Producer decides blocking semantics

The producer call site (e.g. `queue push --wait`) decides whether dispatch is blocking or fire-and-forget -- never the subscriber config.
**Why:** The producer knows its execution context: `onStepEnd` in flow-cli must block for policy-engine to gate the flow; `onTaskCreated` in task-cli does not need to block. Putting this decision on the subscriber side would create an architectural inversion -- the subscriber would control the producer's execution flow.

### P-2: Replace D32 -- no silent failure swallowing

Hook/dispatch failures must be observable: logged with full context, retried if configured, and surfaced to the producer when blocking mode is used.
**Why:** D32 ("on-failure default is ignore") was a pragmatic shortcut in HookDispatcher. The policy-engine spec (OQ-2) explicitly identified this as unacceptable for blocking/gating use cases. The queue CLI is the formal replacement.

### P-4: `onXxx` = async, `beforeXxx` = blocking

Events named `onXxx` are fire-and-forget (async, no return expected). Events named `beforeXxx` are blocking -- the producer waits for all subscribers to respond before continuing.
**Why:** The name alone communicates the contract without requiring doc lookup. `before` is a temporal prefix used by Fastify, NestJS and others -- it implies "runs before the action is considered complete". A `beforeXxx` subscriber must return `{action: 'continue', payload?: {...}}` or `{action: 'abort', reason: string}`.

### P-3: One centralized system, not a fourth

The queue CLI must replace the existing 3 systems (task-cli hooks, flow-cli hooks, web-backend EventBus external dispatch) -- not add a fourth alongside them.
**Why:** The root problem is fragmentation: 3 systems with different configs, different transports, different failure behaviors, zero cross-CLI routing. Adding a fourth system without migrating the others would worsen the problem.
