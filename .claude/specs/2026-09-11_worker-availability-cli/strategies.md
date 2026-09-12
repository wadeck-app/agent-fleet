# Strategies -- Worker Availability CLI

**Version:** v0.1
**Last updated:** 2026-09-11
**Status:** Draft

## The concept

Every policy is an extension point with a shipped default implementation. Flow core knows only the interfaces, never a concrete mechanism. Adding a behaviour means writing a plugin, not modifying the engine.

Per Decision #11: v1 ships the interfaces plus built-in in-process defaults, and declares the extension point without requiring an external plugin.

## Inventory

| # | Strategy | Question it answers | Origin |
|---|---|---|---|
| S1 | Worker creation (a source's internal strategy) | How does a worker come into existence for this source? | User |
| S2 | On-the-fly creation | Built-in default implementation of S1 | User |
| S3 | Distribution / assignment | Which eligible worker receives this ready step? Examples given: priority, load | User |
| S4 | Worker-side acceptance | Is this worker willing to take this step? | User |
| S5 | Project root resolution | Which directory is "the project" for a given starting directory? | User |
| S6 | Retention | When is an idle worker torn down? | **Claude**, imported from Jenkins. Never requested -- confirm or drop |
| S7 | Authentication | How does a party prove who it is on registration? Shared token, public/private keypair, ... | User |
| S8 | Provisioning | *When* and *how much* capacity to add, as distinct from S1's *how* | **Claude** -- mentioned early, then dropped from this inventory in error. Second omission found |
| S9 | Interactivity policy | What happens to an interactive step when no worker has a user interface attached -- disable it, queue it, fail it? | User |

## Note on S9 and existing machinery

An `approval` extension point already exists and is **stable v1**: `ApprovalProvider` with `requestInput` / `requestChoice` / `requestApproval` (`packages/extension-points/src/approval/v1.ts`), implemented by `plugin-cli-approval`. S9 must be reconciled with it rather than duplicating it -- how interactivity currently reaches the user is under verification.

**Key design distinction (Claude's analysis, needs confirmation):** an interactivity requirement must be **derived from the step**, not declared by the flow author. Labels are author-declared, so relying on them means an author who forgets `labels: [interactive]` gets a step that lands on a headless worker and hangs -- a silent failure forbidden by P-4. The engine knows a step is interactive (user-intervention step, or model step in interactive mode) and must require the capability automatically.

## Meta-rule

When a mechanism has more than one valid implementation, it is an extension point. This has now been the correction three times (S5, S7, and the S1 kinds), so treat it as the default assumption rather than something to be argued for case by case.

## S1 implementations (source kinds)

The kinds the user enumerated:

| Kind | Behaviour | Status |
|---|---|---|
| Local on-the-fly | Fork a child process on the daemon host, up to a concurrency limit. Today's `spawnWorker()` | Built-in default (S2) |
| Inbound worker | The worker dials the daemon itself and waits to be contacted | In scope, primary feature |
| Registered command | The daemon runs a stored command line to create a worker on demand | In scope (Decision #5) |
| **Inbound host provider** | A machine dials the daemon and offers the *ability to create* workers; the daemon asks it to spawn N on demand | **In scope** -- Decision #17 |
| Other, plugin-supplied | "des pool geres d'autres facon" | Open by construction |

## Corrections found by auditing this inventory

### C1: `Launcher` and S1 are the same concept under two names

Decision #6 introduced a `Launcher` axis (`inbound` / `command`). That is exactly the user's "stratégie interne du pool" (S1). Two vocabularies were layered without flagging the overlap.

**Resolution:** keep the user's framing. S1 is the creation strategy; `inbound` and `command` are two *implementations* of S1, not a separate axis. Decision #6's three-concept model (`Worker` / `WorkerSource` / elastic pool) stands; only the naming collapses.

### C2: the inbound host provider was silently dropped -- RESOLVED

The user asked for "une machine (cloud, pc, laptop) qui se connecte pour fournir la possibilité de créer des worker". This is neither an inbound worker nor a local command: it is a **source that connects**, which the daemon then asks to manufacture workers.

Decision #12 restricted launchers to `inbound` + `command` and eliminated this case without saying so. **Reinstated by Decision #17.** Elastic remote capacity is in scope; see `threat-model.md` for the resulting security workload (network-reachable port, remote credential, bidirectional trust).

### C3: Question #5 was closed having answered only half

Question #5 asked where labels are declared *and* the matching syntax. Decision #7 answered only the step-side syntax (list, AND). **Where labels are declared is undecided.** The user's phrasing -- "il a accès à des pool/generateur, avec des labels" -- points to declaration on the source, with workers inheriting. Reopened.

## Interfaces

*Pending -- to be drafted once C2 is resolved, since it determines whether a source can itself be remote.*
