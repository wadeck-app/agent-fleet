# Pool Architecture -- Worker Availability CLI

**Version:** v0.1
**Last updated:** 2026-09-11
**Status:** Draft

## Overview

Decouples the flow engine from worker creation. The engine knows only about **pools** that advertise **labels** and can supply workers; each pool owns the question of how a worker comes into existence.

Not responsible for: step execution semantics (`StepRunner`), flow DAG scheduling (`FlowScheduler`), worker transport framing (`shared-orch-worker`).

## Problem with the current design

`WorkerPool` (`packages/flow-cli/src/daemon/WorkerPool.ts`) hardcodes three separate responsibilities into one class:

| Responsibility | Current hardcoded behaviour |
|---|---|
| When to add capacity | `canSpawn()` -- `activeCount < concurrencyLimit` |
| How to create a worker | `spawnWorker()` -- `fork` a local child process |
| Which worker gets a step | `getIdleWorker()` -- first idle in a `Map` |
| When to remove a worker | Worker exits on `done` broadcast |

Each row is a policy that different environments answer differently. They must become extension points.

## Concepts

| Concept | Responsibility |
|---|---|
| `WorkerPool` (provider) | Advertises labels; supplies workers on request. Owns its own creation mechanism. |
| `Worker` | A connected execution slot, in state `idle` / `busy`. |
| `Label` | Free-form tag on a pool/worker. A step declares a label expression; only matching workers are eligible. |
| `ProvisioningStrategy` | Decides *when* and *how many* workers to request, given queue pressure. |
| `AssignmentStrategy` | Decides *which* eligible idle worker receives a given ready step. |
| `RetentionStrategy` | Decides when an idle worker is torn down. |

## Pool kinds (target set)

| Kind | Creation mechanism | Status |
|---|---|---|
| Local fork | `fork` child process on the daemon host (today's behaviour) | Built-in default |
| Inbound worker | User runs `flow worker` in a terminal; worker dials the daemon and registers | Primary new feature |
| Inbound host | A machine registers as a *provider*; daemon asks it to spawn N workers on demand | Aspirational |
| Cloud | Provision a VM/container per worker | Out of scope for v1 |

## Jenkins mapping (reference model)

The design borrows Jenkins' separation of concerns. Mapping for reviewers who know Jenkins:

| Jenkins | Here |
|---|---|
| `Node` / agent | `Worker` |
| `Cloud` (factory of nodes) | `WorkerPool` provider with `canProvision() == true` |
| Inbound (JNLP) agent | Inbound worker -- a static node with no cloud |
| `NodeProvisioner.Strategy` | `ProvisioningStrategy` |
| `LoadBalancer` | `AssignmentStrategy` |
| `RetentionStrategy` | `RetentionStrategy` |
| `Label` expression on a job | Label expression on a step |

Note: in Jenkins, `Node` and `Cloud` are **separate** concepts -- a Cloud produces Nodes, an inbound agent is a Node with no Cloud. Whether to unify them here is an open question (see below).

## Decisions

| # | Decision | Rationale | Date |
|---|---|---|---|
| 1 | Worker-initiated registration is supported: a worker may dial the daemon and join the pool rather than being forked by it | Enables execution in a different environment (WSL, container, other machine) and lets the user control concurrency by opening terminals | 2026-09-11 |
| 2 | Generalize to a pool/provider abstraction with pluggable strategies rather than special-casing the inbound worker | Avoids a second hardcoded path next to `spawnWorker()`; inbound worker becomes one provider among several | 2026-09-11 |

| 3 | Registry, strategies and the worker listener all live inside the flow daemon; no separate broker service | Daemon is already long-lived and already a WebSocket server; no new process to install or operate | 2026-09-11 |

## Blockers created by Decision #3

Both are code-verified, not hypothetical. Decision #3 keeps everything in the daemon, but the daemon's current lifecycle model assumes workers are ephemeral and subordinate to a run -- the opposite of an inbound worker.

### Daemon self-termination kills idle inbound workers

`Daemon.ts:250-257`:

```
checkShutdown() {
  if (queueEmpty && !hasActiveExecutions && !workerPool.hasActiveWorkers()) {
    workerPool.broadcastDone();   // tells EVERY worker to exit
    wsServer.close();
    daemonHandle.stop('idle');
  }
}
```

`hasActiveWorkers()` counts only `busy` workers (`WorkerPool.ts:162-164`), so an idle worker does not keep the daemon alive. `checkShutdown()` is also called from `handleWorkerClose` (`Daemon.ts:245-248`), so one worker disconnecting can trigger full shutdown.

Result: when the last flow finishes, the daemon broadcasts `done` to every connected worker and exits -- terminating a `flow worker` that was idling in a terminal. Tracked as Question #13.

### Concurrency accounting ignores inbound workers

`activeCount` is incremented in `spawnWorker()` (`WorkerPool.ts:62`) and decremented only in the child process `exit` handler (`:113-118`); `removeWorker()` deliberately does not touch it (`:141-145`).

An inbound worker has no child process and therefore no `exit` handler, so it is never counted. `canSpawn()` (`activeCount < concurrencyLimit`, `:57-59`) would let the daemon fork a full quota of workers *in addition to* the ones the user supplied. Tracked as Question #14.

## Persistent worker registry (proposed, Question #15)

A registry of workers that have announced themselves, persisted in the config dir and read by the daemon when it needs capacity.

**Correction 2026-09-12 -- an earlier version of this section was misleading.** It claimed the registry "largely dissolves the lifecycle blocker". It does not: the registry solves *rediscovery*, while the daemon's `broadcastDone()` still *kills* a live idle worker. A goldfish evaluation confirmed the damage -- a reader with no context concluded, from this file, that the registry was what protected a hand-launched worker. It never was.

**The actual resolution is D#51 to D#55:** nothing keeps the daemon alive. On startup the daemon reads the registry and asks each source's **S1 plugin** to produce a live worker -- either by using the contact method the entry advertises (worker already alive) or by running the entry's command (worker created on demand). The daemon pushes; the worker never polls. A worker launched in a terminal stays alive and advertises a contact method, so it keeps its TTY.

**What the registry buys:** a worker no longer depends on the daemon being alive to remain *reachable*. The daemon may idle-shutdown freely.

**Prior art, live:** `flow-cli` uses `@wadeck-app/singleton-daemon-kit`; `orch-cli` uses the same kit with `<configDir>/config.port` + `<configDir>/health_token` for file-based daemon discovery. A worker registry is the mirror image. Not verified: whether the kit already exposes a reusable file mechanism for this (the kit's internals were not read; `packages/flow-cli/src/daemon/` contains no port-file code of its own).

### These are not competing variants -- they are S1 implementations (D#52, D#55)

An earlier version of this section framed "worker listens" and "worker dials" as a global either/or. That was wrong: the transport is chosen **per source**, by that source's S1 plugin. Several can coexist in one registry.

| S1 implementation family | Registry entry carries | Notes |
|---|---|---|
| Contact method -- worker already alive | A way to reach it: URL, socket, file, anything | Each concrete mechanism is its own S1 implementation. Keeps the worker's TTY, so this is the family that serves interactive steps |
| Command -- worker created on demand | A command line the daemon runs | No TTY; suitable for headless capacity |

The daemon calls one method on S1 and receives a live worker. Contact-or-create is entirely the plugin's business, so the engine has no branch for it.

Per-transport security still applies: a networked contact method falls under P-5 (nothing in cleartext on the LAN); a local socket or file does not cross the network at all.

### The hazard: a registry can lie

A live WebSocket connection cannot be stale -- that is its entire virtue. A file can: worker SIGKILLed, machine slept, terminal closed abruptly. The daemon then believes it has capacity that does not exist, and steps wait on a phantom worker. This is the vicious form of a silent fallback: capacity that *appears* to exist.

**Proposed resolution:** the registry carries **intent and discovery**; the live connection carries **availability**. Dispatch never targets anything but a live connection. The registry is therefore never authoritative about capacity, so it cannot lie about what matters.

### Security

The registry file is a direct tampering target: whoever can write it can redirect steps to a worker they control -- no connection race needed, just a file edit. Requires user-only permissions like the token, and entries should ideally be bound to the token rather than freely appendable. Tracked as T-09 in `threat-model.md`.

## Core model (Decision #6)

Three concepts. The axis of variation between "a worker already alive" and "a command to launch one" is the **launcher**, not a pool-vs-worker distinction.

| Concept | What it is | Persisted |
|---|---|---|
| `Worker` | A live execution slot with runtime state (`idle` / `busy`) | No |
| `WorkerSource` | A registry entry: identity + labels + attached projects + **S1 configuration** | Yes |
| Elastic pool | No fixed identity; creates workers up to a concurrency limit. Today's `spawnWorker()` behaviour | No |

### Launchers

| Launcher | Behaviour | Jenkins equivalent |
|---|---|---|
| `inbound` | The worker dials the daemon itself and waits to be contacted | `JNLPLauncher` |
| `command` | The daemon runs a registered command line to create a worker on demand | `CommandLauncher` |
| `ssh` | Out of scope for v1 (Question #18) | `SSHLauncher` |

In Jenkins an inbound agent and a command-launched agent are both `Node`s differing only by `ComputerLauncher`; `Cloud` is the separate elastic no-identity case. The same split applies here, which is why a registry entry and a live worker must not be the same type: a registry entry exists before any worker does, and an elastically-forked worker exists with no registry entry.

**Why not one unified "pool" type:** an entry with a `command` and no connection, and a live worker with a connection and no command, are two shapes. A single type leaves half its fields permanently null and makes `provision()` a no-op on the inbound case.

## Label matching (Decision #7)

A step declares a list; a worker is eligible only if it carries **every** label in that list.

```yaml
steps:
  - id: build
    labels: [windows, gpu]
```

A string value where a list is expected must fail loudly, naming the unsupported form. Never interpret `"a || b"` as an AND of atoms -- that would silently mis-execute the user's intent.

Labels are **routing, not authorization** (T-07). Do not use them to keep a sensitive step away from an untrusted worker.

## Strategies (Decision #8)

Two independent pluggable strategies, on opposite sides of the dispatch:

| Strategy | Side | Answers |
|---|---|---|
| Acceptance | Worker | "Am I willing to take this step?" |
| Distribution | Flow / daemon | "Which eligible worker gets this ready step?" |

Keeping them separate means the worker owns its own admission policy and the flow owns placement. Conflating them would force one side to encode the other's intent.

**Undecided (Question #19):** the default acceptance mode. Does a labelled worker also take steps that declare no label, or only steps whose labels it matches? Jenkins offers exactly this choice per node ("use as much as possible" vs "only build jobs with matching label expressions"). The mode is configurable, but the default drives first-run behaviour and is not yet chosen.

## Project scoping (Decisions #9, #10)

A worker attaches to one or more projects; by default, the project it was launched in. The registry is global in the flow config, and each run registers itself so active projects can be listed.

**Open (Question #21):** is project attachment a distinct field, or a reserved label such as `project:foo`? A reserved label reuses the matching machinery for free, but conflates routing with scoping and makes the "attach to my launch directory" default awkward to express. Leaning toward a distinct field.

**Open (Question #20):** what identifies a project -- an absolute path, a declared name, or a generated id? Nothing in flow-cli carries a project identity today.

## Terminal display requirement (Question #16)

A worker running in the user's terminal should show the steps arriving and their progress -- this is the primary UX payoff of the feature, not incidental plumbing.

Net-new: forked workers run with `stdio: ['ignore', 'ignore', 'pipe']` (`WorkerPool.ts:89`), so stdout is discarded today and no display path exists. Open: whether the terminal renders locally from the messages it receives, or mirrors what the daemon's `LogWriter` records.

## Design

*Pending -- interface signatures to be drafted now that Decisions #4, #5 and #6 fix the model.*

## Open questions

- Unify `Pool` and `Worker` into a single "worker source" abstraction, or keep them separate as Jenkins does?
- Are labels declared per pool, per worker, or both?
- Local-only (loopback) or network-capable from v1? Determines whether authentication is required.
- Can strategies be real plugins with the current `extension-points` machinery, or do they need in-process registration first?
- What happens to a running step when its inbound worker's terminal is closed?

## Security considerations

Allowing inbound registration removes the daemon's guarantee that it created every worker. Two consequences:

- **Spoofing (T-01):** any local process can dial the WebSocket port and claim to be a worker, then receive step payloads. The existing PID validation in `registerWorker()` cannot apply to workers the daemon did not fork.
- **Network exposure (T-03):** if inbound registration is reachable beyond loopback, the daemon becomes a remotely-addressable code execution service.

Cross-reference `threat-model.md`.
