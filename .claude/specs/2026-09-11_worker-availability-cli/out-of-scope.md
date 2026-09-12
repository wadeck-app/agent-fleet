# Out of Scope -- Worker Availability CLI

Items listed here are **explicitly excluded**.

## Excluded items

### Worker fleet shared across multiple flow daemons
A pool of workers serving several flow daemons at once (multiple projects, multiple users, or a dedicated machine lending capacity to several workstations).

**Reason:** Decision #3 places pool management inside the flow daemon, which is per-user and per-machine (`~/.config/flow/`). A shared fleet requires a separate broker service, which was rejected as a process the user would have to install and operate.

**Revisit if:** sharing capacity across daemons becomes a real requirement. The pool provider abstraction (Decision #2) leaves room for a broker-backed pool plugin later without changing the engine.

**Not the same thing as multi-project support.** Decision #10 puts the worker registry in the global flow config so one worker can serve several projects and active projects can be listed. That is *multi-project within one daemon*, which is in scope. What is excluded here is *multi-daemon* -- several daemon processes sharing one fleet.

### Cloud pool providers (provision a VM or container per worker)
**Reason:** Not needed for the target use case; adds credential management and billing concerns.
**Covered by:** Nothing yet -- future work.

## How to challenge scope
Open a new discussion with the rationale. Do not modify this file silently -- scope changes must be acknowledged as a versioned decision.
