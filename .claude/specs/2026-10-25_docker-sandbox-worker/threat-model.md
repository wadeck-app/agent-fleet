# Threat Model -- Docker Sandbox Worker

**Version:** 1.1
**Date:** 2026-10-26
**Methodology:** STRIDE

## Scope

The sandbox worker, the sandbox it owns, the host services it exposes to it (credential endpoint, bridge) and the data shared through the mount. Daemon-to-worker transport is covered by `2026-09-11_worker-availability-cli/threat-model.md`.

## Assets

| Asset | Sensitivity | Owner |
|---|---|---|
| Host files outside the run's mounts | High | User |
| Daemon credentials | High | Daemon |
| Step secrets | High | Flow author |
| Model credentials (short-lived) | High | User |
| Repository content in the workspace | Medium-High | Project |
| Session stores and diagnostics under the run's `.meta` | Medium | Project |

## Threat actors

| Actor | Motivation | Capability |
|---|---|---|
| Compromised or prompt-injected agent in the sandbox | Exfiltrate data, escape, abuse the host services | Arbitrary code in the VM, sudo, whatever egress the machine policy allows |
| Malicious dependency or script in the workspace | Same | Runs through hooks, build scripts |
| Another local process | Obtain credentials or impersonate the inner worker | Can connect to loopback ports |
| Another sandbox on the same machine | Same | Same network path to the host services |

## STRIDE analysis

### Spoofing
Forged messages through the bridge (T-01); impersonating the inner worker or calling the credential endpoint from another process or sandbox (T-10, T-11).

### Tampering
Writable workspace and `.meta` mounts (T-04, T-09); host-side reads of files the agent controls (T-12); MCP channel in the exec variant (T-08).

### Repudiation
The worker writes to the daemon log: sandbox create, stop and removal; credential issuance (alias, time); network rule changes; every dropped message.

### Information Disclosure
Raw-socket egress by IP is not filtered (T-15). Step secrets and model credentials usable inside the VM during the run (T-02, T-07); egress allowed by the machine-wide policy (T-05); SSH agent forwarding (T-14).

### Denial of Service
Orphaned sandboxes (T-03); resource exhaustion by many sandboxes (T-13).

### Elevation of Privilege
A forged or privileged message driving the daemon (T-01); the MCP channel (T-08).

## Mitigations

| ID | Category | Threat | Mitigation | Status | Decision |
|---|---|---|---|---|---|
| T-01 | Spoofing / EoP | Inside code sends forged or privileged messages | Closed allow-list of message types, anything else dropped and logged; the exact list is in the plan | Planned (M6, M7) | #21 |
| T-02 | Info disclosure | Step secrets are plaintext in the VM | The daemon already sends only the secrets a step references; residual: the agent can read them during that step | Accepted residual | #24 |
| T-03 | DoS | A crash leaves sandboxes behind | Report leftovers at start-up; removal only by explicit command, refused for live runs or workers; a wrapper that exits or restarts stops its sandboxes but never removes them | Planned (M3) | #16, #26 |
| T-04 | Tampering | Writable mounts: hooks and scripts in the workspace later run on the host | Mount only the run's workspace and `.meta`; warn when the workspace is the user's project directory; git inside a worktree workspace does not work in the VM (documented by Docker, untested) | Accepted residual | #19 |
| T-05 | Info disclosure | Egress is whatever the machine-wide policy allows (`balanced`: about 195 hosts including github.com and package registries). A per-sandbox deny-all cannot be combined with allows (deny wins, measured) | The prerequisite check reports the active mode and warns; per-sandbox allows only for the host services and model hosts; the operator may set the machine policy to deny-all; Codex adds github.com and the Bedrock mantle host | Accepted residual -- needs user confirmation | #23, #24 |
| T-15 | Info disclosure | Raw sockets. sbx 0.51.0 (measured 2026-11-08, `RawTcpLiveCheck.mjs`): the VM completes the handshake with any address (an egress gateway accepts all), but nothing reached a ruleless host port (127.0.0.1, 0.0.0.0, LAN) or `1.1.1.1:443`; with a sandbox rule `localhost:<port>` only that port passed. The 0.49.2 note (raw client "reaches arbitrary hosts by IP") most likely counted handshakes and was not re-run | Per-destination filtering by the gateway, raw TCP included. Still allowed: everything the machine policy allows (about 195 hosts on balanced). Not tested: data to a public IP that is allowed. Wording in docs: "outbound traffic is filtered per destination", never "network isolated" | Mitigated on 0.51.0 for ruleless destinations; re-measure at every sbx upgrade | #23, #24 |
| T-06 | Supply chain | The sandbox tool is proprietary and 0.x | Pinned version, single runtime interface, fail on mismatch | Planned (M1) | #20 |
| T-07 | Info disclosure | Model credentials reach the VM on demand | Short-lived credentials, loopback endpoint, per-sandbox secret injected by the proxy, per-sandbox alias restriction, actionable error when SSO expired (no automatic login); residual: the agent can request and use them during the run | Planned (M2) + accepted residual | #12 |
| T-08 | Tampering / EoP | Exec variant: the MCP bridge is an agent-controllable channel and needs a per-step allow rule | Same tool surface as a local model today; rule scoped to the sandbox and removed with it; the "cannot add steps" invariant is tested | Planned (M7) | #21 |
| T-09 | Info disclosure / Tampering | Session stores (prompts, code) sit on a writable mount; `.meta` of plugin-provided workspaces is never pruned today | Keep them under that run's `.meta` only; treat a resumed session as untrusted input; add pruning of `<meta>/sessions` (plan item P1) | Open | #18 |
| T-10 | Spoofing | Another process or sandbox calls the credential endpoint or the bridge; the injected secret goes to every request to host `localhost` | One secret per sandbox, loopback binding, only wrapper-owned services listen on the allowed ports. Measured (sbx 0.51.0): a sandbox rule `localhost:<port>` opens that host loopback port to ANY process in that VM, raw TCP included, and no other host port; the rule is per sandbox, not per process | Planned (M2); residual risk accepted for the rule scope | #12 |
| T-11 | Spoofing | Authentication of the inner worker to the bridge (token on the WebSocket upgrade through the proxy placeholder is unverified) | Per-sandbox bridge token; verifying it is a gate before M6 | Open (gate) | #14 |
| T-12 | Tampering | The host reads files the agent controls (outputs, transcripts, SQLite stores, returned paths) | Canonical-path containment in the run's two mounts, no symlink following, size caps | Planned (M3, M6) | #19 |
| T-13 | DoS | Defaults are 20 CPU and half the host RAM per sandbox | Explicit limits per sandbox and a cap on concurrent sandboxes | Planned (M1, M3) | #30 |
| T-14 | Info disclosure | SSH agent forwarding is on by default | Must be off or explicitly accepted; checked by the prerequisite check | Planned (M1) | #30 |
| T-16 | Info disclosure / Tampering | The workspace handed to the sandbox exposes more than the run: `in-place` and `readonly` give the whole project (`<project>/.flow` with flow definitions and the outputs of other runs, `.git/hooks` that later run on the host) | A sandboxed worker accepts only `workspace: pool`; the wrapper refuses a run whose `.meta` lies inside its workspace (links and junctions resolved) and a git worktree (`SandboxableWorkspace`). A pool slot is a clone: set `core.hooksPath` to an empty folder (flow schema reference, "pool") | Mitigated (wrapper check, unit-tested) | - |
| T-17 | Tampering | Links planted in a mount to make the host follow them out of the run | sbx 0.51.0 refuses symlink creation on a mount for the agent and for root (measured); `RunMounts` still rejects links under both mounts (`lstat`, never followed) | Mitigated; also measured: a `:ro` mount is enforced by the host side (virtiofs), root could not defeat it | - |
