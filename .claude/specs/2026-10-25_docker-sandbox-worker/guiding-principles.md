# Guiding Principles -- Docker Sandbox Worker

These principles take priority in every design decision.
Any option that conflicts with a principle must be raised as an open question -- never silently accepted.

## Principles

### P-1: The wrapper is the only bridge
Nothing inside the sandbox talks to the daemon directly; all traffic in and out passes through the wrapper worker.
**Why:** Decision #3. The daemon credentials stay on the host, and the wrapper is the single place to validate and log what crosses the boundary.

### P-2: Nothing is destroyed automatically except at the end of its run
A sandbox is stopped when idle but removed only on the end-of-run or cancel event.
**Why:** Decision #16. The user judged inactivity-based removal too dangerous.

### P-3: Credentials are never stored in the sandbox
The host serves short-lived ones on demand. Residual: the agent can request and use them during the run.
**Why:** Decision #12. Cleaner and safer than environment variables.

### P-4: Diagnostics outlive the sandbox
What a run leaves behind with the other workers must also remain with this one.
**Why:** Decision #17.

### P-5: Workers compose
A bridge launches an inner worker and relays; bridges may nest (remote wrapper over sandbox bridge).
**Why:** Direction from the user, 2026-10-25 (not a numbered decision; to be confirmed).
