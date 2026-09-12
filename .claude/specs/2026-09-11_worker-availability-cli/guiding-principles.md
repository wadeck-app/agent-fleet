# Guiding Principles -- Worker Availability CLI

These principles take priority in every design decision.
Any option that conflicts with a principle must be raised as an open question -- never silently accepted.

## Principles

### P-1: The flow engine never creates workers
The engine requests capacity matching a label expression; a pool decides how that capacity materializes.

**Why:** Today `WorkerPool.spawnWorker()` hardcodes `fork` of a local child process. Any new worker source (inbound terminal, remote host, container) would otherwise become a second hardcoded branch next to it, and then a third.

### P-2: Every allocation policy is a pluggable strategy with a built-in default
Provisioning, assignment, and retention are separate extension points. Flow ships a working default for each so nothing needs configuring to run.

**Why:** These are the policies that differ per environment. Baking one answer in forces a fork of the engine to change it. The default must exist so the feature stays zero-config for the common case.

### P-3: Labels are the only coupling between a step and a worker
A step declares what it needs as a label expression. It never names a pool, a host, or a process.

**Why:** Naming a pool in a flow file makes the flow non-portable -- it stops running the moment the topology changes.

### P-5: Nothing crossing the LAN is ever in cleartext
Every byte exchanged with a non-loopback peer is encrypted -- credentials, step payloads, labels, logs, metadata. No exceptions, no opt-out.

**Why:** The daemon became network-reachable when inbound host providers were accepted (D#17). A stolen credential on this channel does not merely impersonate a worker, it lets an attacker register as a *manufacturer of capacity*. The project already refuses literal credentials in configuration (`validateNoLiteralCredentials`), so cleartext payloads on a network would contradict a posture it already holds elsewhere.

**Enforcement:** the daemon **refuses** an unencrypted non-loopback connection rather than accepting it with a warning. Fail closed.

### P-4: Absent or unmatched capacity fails loudly
If no pool can satisfy a step's label expression, the run fails with a message naming the unmatched expression and the labels that were available. It never silently falls back to a default pool.

**Why:** Project rule -- no silent fallback for an unrecognized value. A step that quietly runs on the wrong worker produces results the user cannot trust.
