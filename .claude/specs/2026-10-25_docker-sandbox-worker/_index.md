# Spec: Docker Sandbox Worker

**Created:** 2026-10-25
**Version:** v0.2
**Status:** In Review -- v0.2 -- goldfish review applied; 30 decisions, 11 taken under delegation (4 need the user's confirmation: #20, #21, #28 and threat T-05)
**Iteration:** 1 (local)

## Summary

Run flow steps (scripts and Claude, Codex, OpenCode) inside Docker Sandboxes (`sbx`), so an agent cannot damage or leak from the host. Sandboxes are provided by a worker plugin that behaves like any other worker. Iteration 1 is local. Iteration 2 uses the sandboxes of another machine (the Mac) to keep this one free. Builds on `2026-09-11_worker-availability-cli`.

## Business goals

- Isolate what an agent can touch: files, network and credentials.
- Start 0..n sandbox workers and use them like the existing workers.
- Never keep credentials in a sandbox; never destroy one automatically except at the end of its run.
- Keep the diagnostics of a run after the run, like with the other workers.
- Deliver it as plugins, which also makes the existing worker kinds pluggable.
- Technical details live in `research-findings.md` and the plan, not here.

## Decision Log

| # | Decision | Status | Date |
|---|---|---|---|
| 1 | Dedicated spec for the sandbox worker | Decided (user) | 2026-10-25 |
| 2 | A host-side wrapper process is the worker and owns the sandbox lifecycle | Decided (user) | 2026-10-25 |
| 3 | One worker = one sandbox; models and scripts run inside; all traffic in and out goes through the wrapper | Decided (user); lifetime clause superseded by #5 | 2026-10-25 |
| 4 | Scripts run inside the sandbox; host-only scripts go to a non-sandbox worker by label | Decided (user) | 2026-10-25 |
| 5 | One sandbox per run, never reused, destroyed deliberately at the end of the run | Decided (user) | 2026-10-25 |
| 6 | Delivered as a plugin, not in the daemon core | Decided (user) | 2026-10-25 |
| 7 | Delivered as sandbox worker plugins, together with the flow changes listed in the plan (plugin system, worker-type extension point, worker kinds as plugins) | Decided (user); wording corrected after review | 2026-10-25 |
| 8 | New extension point: a plugin provides a type of worker and the daemon can talk to its workers (`worker-type-extension-point.md`) | Decided (user) | 2026-10-25 |
| 9 | The existing worker kinds are extracted into plugins behind the same interface | Decided (user) | 2026-10-25 |
| 10 | Next iteration: a `worker-remote-wrapper` plugin runs a worker on another machine; the existing worker-availability rules (no daemon-held remote credentials) apply unless superseded then | Decided as direction (user); details deferred | 2026-10-25 |
| 11 | Plugin system: adopt queue's design adapted to flow, interim before a centralized system | Decided (user) | 2026-10-25 |
| 12 | Model credentials are never stored in the sandbox: the worker's host serves short-lived ones on demand (they are usable by the agent during the run); no guardrail header, no session-logging hook | Decided (user) | 2026-10-25 |
| 13 | The plugin-system replacement is complete: all existing plugins migrate in the same phase | Decided (user) | 2026-10-25 |
| 14 | Two variants built as separate plugins and compared in practice: "relay" (a flow worker inside the sandbox, bridged) and "exec" (engine on the host, processes run through `sbx`) | Decided (user) | 2026-10-25 |
| 15 | The daemon sends end-of-run and cancel events to all workers; a worker can declare it takes a whole run, and the router keeps the run on it | Decided (user) | 2026-10-25 |
| 16 | A sandbox is stopped (state kept) after 5 minutes idle, re-armed at each step end; removed only on the end-of-run or cancel event; never removed for inactivity | Decided (user) | 2026-10-25 |
| 17 | Diagnostic files of a run remain available after the run, like with the other workers | Decided (user) | 2026-10-25 |
| 18 | v1: each run's tool sessions and diagnostics stay on the host under the run's `.meta`, so a session can be resumed from a new sandbox; the inner worker's stderr goes to the daemon log; no copy-out before removal | Decided (user) | 2026-10-26 |
| 19 | v1 local: a sandbox mounts exactly its run's workspace and `.meta` directory | Decided (user) | 2026-10-26 |
| 20 | The worker and the three model tools come in one image versioned with flow; the sandbox tool's version is pinned and a mismatch fails clearly. Pinned version: sbx 0.49.2 exactly; image built locally and kept in the sandbox tool's local store. M0b measured two routes: a snapshot of a configured sandbox (not reproducible, 3.38 GB) and a Dockerfile built inside a builder sandbox then loaded (pinned base digest and tool versions, 1.33 GB); the Dockerfile route is the recommended build recipe (`packages/flow-sandbox/image/`); codex is pinned to 0.149.1 for now (0.164.0 cannot resume, see research-findings M2). A registry-published image is still open | Confirmed by the user (provisional, "for now") | 2026-10-26 |
| 21 | Only a closed, documented set of messages from the inside is accepted; anything else is dropped and logged; adding steps from the inside is accepted only where a step is already allowed to do so today. Confirmed: the exact list is in the plan; if no step may inject today, the rule becomes "no adding steps from the inside" | Confirmed by the user | 2026-10-26 |
| 22 | v1 has no attach to a running sandbox worker; approvals use the existing mechanisms; maintainers debug with `sbx` directly | Decided by Claude under delegation, revisable | 2026-10-26 |
| 23 | v1 targets this local machine (Windows, validated); macOS is expected to work but is unvalidated; the plugin checks its prerequisites (tool present, signed in, network policy initialized) and fails with an actionable message | Decided by Claude under delegation, revisable | 2026-10-26 |
| 24 | Claude, Codex and OpenCode must all run; each uses its own native credential path, Bedrock through #12 and API-key providers through `sbx` secrets; the exact wiring is an implementation detail | Decided by Claude under delegation, revisable; validated locally with real Bedrock calls for all three tools (see `research-findings.md`) | 2026-10-26 |
| 25 | Path translation between host and sandbox is an implementation detail of the bridge; surviving a daemon restart is an existing flow limitation, outside this spec | Decided by Claude under delegation, revisable | 2026-10-26 |
| 26 | v1 provides an explicit way to list and remove the plugin's leftover sandboxes, and reports leftovers at start-up; never automatic. Each sandbox carries an owner marker; removal refuses a sandbox whose run or worker is still alive and requires the sandbox's name | Decided by Claude under delegation, revisable | 2026-10-26 |
| 27 | Routing: a run's affinity to the sandbox worker is a preference for the steps it can run. A step that needs another worker (host-only script, `cmd` or `pwsh` shell, script calling the daemon API) is routed there by label and sees the same files through the mount. Reconciles #4 and #15 | Decided by Claude under delegation, revisable | 2026-10-26 |
| 28 | Who starts sandbox workers: the operator declares a worker source for local sandbox workers, as for existing sources, and the daemon starts the wrapper on the same machine from that declaration. Remote or cloud provisioning stays excluded. This narrows the exclusion of "a VM or container per worker" in the worker-availability spec for local sandboxes. NEEDS CONFIRMATION | Decided by Claude under delegation, revisable | 2026-10-26 |
| 29 | One worker holds one sandbox at a time and stays registered across runs: it creates a fresh sandbox at the first assignment of each run and removes it at that run's end. Concurrent runs or parallel steps need more workers | Decided by Claude under delegation, revisable | 2026-10-26 |
| 30 | Each sandbox gets explicit CPU and memory limits, the number of concurrent sandboxes is capped, and SSH agent forwarding must be off or knowingly accepted; defaults are plugin options | Decided by Claude under delegation, revisable | 2026-10-26 |

## Questions

| # | Topic | Status |
|---|---|---|
| 1 | How the wrapper talks to the inside | Resolved -- #14 |
| 2 | Sandbox lifetime | Resolved -- #5 |
| 3 | What a sandbox mounts | Resolved -- #19 |
| 4 | Image content and version pinning | Resolved -- #20 |
| 5 | Trust of messages from inside | Resolved -- #21 |
| 6 | Interaction with a running sandbox | Resolved -- #22 |
| 7 | Platform support | Resolved -- #23 |
| 8 | Run end and routing | Resolved -- #15 |
| 9 | Plugin packaging | Resolved -- #7 |
| 10 | Model credentials | Resolved -- #12, #24 |
| 11 | Session files | Resolved -- #18, #25 |
| 12 | Model-step plumbing (temp files, MCP bridge) | Moved to the plan (technical, exec variant) |
| 13 | Queue's plugin system | Resolved -- #11 |
| 14 | Scope of the plugin-system replacement | Resolved -- #13 |
| 15 | Remote wrapper vs the "no daemon-held remote credentials" rule | Deferred to iteration 2 (default: the machine's owner starts it, as today) |
| 16 | Idle policy | Resolved -- #16 |
| 17 | Diagnostics after the run | Resolved -- #17, #18 |
| 18 | Leftover sandboxes | Resolved -- #26 |

## Modules / Sub-files

| File | Contents |
|---|---|
| `guiding-principles.md` | Core principles |
| `out-of-scope.md` | Explicit exclusions |
| `threat-model.md` | Security threats and mitigations |
| `architecture.md` | High-level design |
| `worker-type-extension-point.md` | What the daemon needs for plugin-provided worker types (draft) |
| `research-findings.md` | Verified technical facts (reference, not requirements) |

## Changelog

| Version | Date | Summary |
|---|---|---|
| v0.1 | 2026-10-25 | Created; decisions 1-18 taken with the user; research, PoCs and colleagues' kits recorded |
| v0.2 | 2026-10-26 | Goldfish review (1 critical, 12 high, 11 medium): decisions 27-30 added, 7/12/18/20/21/23/26 reworded, threat model rewritten (T-01 to T-14), plan reordered with a gate and a review log |
| v0.2 | 2026-10-26 | PoCs validated decisions 12, 18 and 24 for Claude, OpenCode and Codex (real Bedrock calls, cross-sandbox resume); implementation plan designed |
| v0.2 | 2026-10-26 | Re-scoped to business level: goals added, decisions shortened, questions reviewed; decision 19 (mounts) from the user; decisions 20-26 taken by Claude under delegation (revisable); Q12 moved to the plan, Q15 deferred |
