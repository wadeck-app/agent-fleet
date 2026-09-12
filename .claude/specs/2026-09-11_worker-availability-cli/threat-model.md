# Threat Model -- Worker Availability CLI

**Version:** 1.1
**Date:** 2026-09-11
**Methodology:** STRIDE

## Scope

The capacity-allocation path of the flow daemon: pool registration, worker registration, label matching, and step assignment. Covers workers the daemon forks itself and workers that dial in from elsewhere.

Out of threat-model scope: what a step does once running (covered by the project-level threat model and the sandboxing/worktree plugins).

## Assets

| Asset | Sensitivity | Owner |
|---|---|---|
| Step payload and execution context (prompts, repo paths, env) | High | Flow daemon |
| Flow output and results | High | User |
| Model provider credentials reachable from a worker | High | Worker host |
| Worker/pool identity | Medium | Daemon registry |
| Daemon WebSocket listener | High | Flow daemon |

## Threat actors

| Actor | Motivation | Capability |
|---|---|---|
| Rogue local process | Receive step payloads, exfiltrate prompts/credentials | Spawn a local process, connect to a loopback port |
| Network attacker | Reach the daemon as a fake worker or fake pool | Send traffic to a listening port |
| Malicious/buggy step | Escape the worker's isolation | Code execution inside a worker |
| Compromised remote worker host | Feed falsified step results back into the flow | Holds a valid registration |

## STRIDE analysis

### Spoofing
The daemon currently trusts a worker because it forked it and validated the PID on the `ready` message. Inbound registration removes that guarantee: identity must come from a credential rather than from provenance. See T-01, T-04.

### Tampering
A worker returns step results the daemon acts on to advance the DAG. A worker that is not who it claims can inject falsified `step_completed` payloads and steer the rest of the flow. See T-05.

### Repudiation
With multiple pools and hosts, execution history must record which worker and which pool ran each step, or a wrong result cannot be traced back to its origin. See T-06.

### Information Disclosure
Step assignment sends prompts, file paths and context to the worker. Any party that successfully registers receives this. Label matching is a routing mechanism, not a security boundary -- it must not be relied on to keep sensitive steps off untrusted workers unless that is explicitly designed. See T-02, T-07.

### Denial of Service
Unauthenticated inbound registration lets an attacker register many fake idle workers, absorb every dispatched step, and stall all flows. See T-03.

### Elevation of Privilege
An inbound worker runs with the launching user's shell environment -- potentially broader privileges than the daemon's forked workers. A step routed there gains those privileges. See T-08.

## Mitigations

| ID | Threat category | Threat description | Mitigation | Status | Decision # |
|---|---|---|---|---|---|
| T-01 | Spoofing | Local rogue process dials the WebSocket port and registers as a worker. Confirmed: today's auth is provenance-based -- the daemon matches the reported PID against `spawnedPids` (`WorkerPool.ts:98,125-127`), which cannot apply to a worker it did not fork | **Primitive already exists in-repo:** flow-cli already uses a `health_token` file in `~/.config/flow/` (`FlowIndex.ts:107`, `updater/entry.ts:90`). Reuse it for worker registration; reading it requires filesystem access as the same user. Residual same-user risk documented below | Candidate identified, low cost | - |
| T-02 | Information Disclosure | A registered impostor receives step payloads containing prompts, repo paths and env | TBD -- depends on T-01 | Open | - |
| T-03 | Denial of Service | Attacker registers many fake idle workers and absorbs all dispatched steps | TBD -- candidates: authenticated registration, per-pool worker caps | Open | - |
| T-04 | Spoofing | A fake *pool* registers and is asked to provision workers | TBD -- pool registration must be authenticated separately from worker registration | Open | - |
| T-05 | Tampering | A worker injects falsified `step_completed` / `inject_steps` results, steering the DAG | TBD -- bind result messages to the assignment that was issued | Open | - |
| T-06 | Repudiation | Execution history does not record which worker/pool ran a step, so a bad result cannot be traced | Record pool id and worker id per step in `ExecutionStore` | Open | - |
| T-07 | Information Disclosure | Labels used as if they were a security boundary to keep sensitive steps off untrusted workers | Document that labels are routing, not authorization; decide explicitly if a trust level is needed | Open | - |
| T-08 | Elevation of Privilege | Inbound worker runs with the launching user's shell environment, granting a step broader privileges than a daemon-forked worker | TBD -- may be acceptable and intentional; needs an explicit decision | Open | - |
| T-09 | Tampering | Worker registry file is writable by an attacker, who adds or rewrites an entry to redirect steps to a worker they control | Entries bound to the registration token; a registry entry alone never causes a dispatch (live authenticated connection required). **Downgraded 2026-09-12:** file-permission hardening is dropped. The registry lives in `~/.config/flow/`, where a same-user process already reads the config, the execution store and provider credentials -- protecting this one file moves no boundary. POSIX mode bits are also near-inert on Windows, the only supported platform | Accepted risk | 64 |
| T-10 | Denial of Service | Stale registry entries make the daemon believe capacity exists that does not; steps wait on phantom workers | Registry is not authoritative for availability -- dispatch only to live connections. See `pool-architecture.md` | Open | - |

## Impact of Decision #17 (inbound host provider)

Reinstating remote host providers changes the threat model materially. Three consequences:

- **The daemon port becomes network-reachable.** Loopback-only binding is no longer possible (Question #4 forced).
- **The file-token mitigation for T-01 no longer covers remote parties.** It works locally because reading `~/.config/flow/health_token` requires filesystem access as the same user. A remote host has no such filesystem, so it needs an out-of-band shared secret plus transport encryption -- otherwise the credential crosses the network in cleartext.
- **Trust becomes bidirectional.** The daemon instructs the host to create processes, so the host must authenticate the daemon as strictly as the daemon authenticates the host.

Mitigating factor from Decision #18: remote capacity is **inbound only**. The daemon never stores credentials for logging into remote machines, so there is no credential store to compromise -- strictly smaller surface than an outbound SSH launcher.

| ID | Threat category | Threat description | Mitigation | Status | Decision # |
|---|---|---|---|---|---|
| T-11 | Spoofing / Elevation of Privilege | A fake host provider registers and manufactures capacity wholesale, absorbing steps across projects. Far more damaging than a single fake worker | Authenticated source registration, distinct from worker registration | Open | 17 |
| T-12 | Information Disclosure | Registration credential and step payloads cross the network in cleartext | **Closed by P-5**: nothing crossing the LAN is ever in cleartext -- credentials, payloads, labels, logs, metadata. The daemon refuses an unencrypted non-loopback connection rather than warning (fail closed) | Mitigated | 17, 27, 29 |
| T-13 | Elevation of Privilege | A compromised daemon instructs every connected host to execute code, owning the whole fleet | **Largely eliminated by Decision #19**: the host is active, not reactive. The daemon never starts anything and never sends anything executable -- it publishes demand, and the host acts on recipes it holds locally. Residual: a compromised daemon can still inflate demand to make hosts spawn workers, bounded by each host's declared capacity | Mitigated by design | 19 |

## Residual risk of the file-token mitigation

A file-based token stops a rogue process running as a *different* user. It does **not** stop a rogue process running as the *same* user -- that process can read the token file exactly as a legitimate worker does. Same-user isolation would require an OS-level mechanism (peer credentials, per-worker nonce issued out-of-band) and is likely not worth it: a same-user process can already read the flow config, the execution store, and the model provider credentials directly, so the worker channel is not the weakest link. State this explicitly rather than implying the token closes T-01 completely.

## Open security questions

- Q: Is inbound registration reachable beyond loopback in v1? -> Open Questions #4 in `_index.md`
- Q: Are labels a routing hint only, or do they carry a trust level? -> T-07, feeds a future open question
- Q: Is the inbound worker's broader shell environment a feature or a risk to contain? -> T-08
