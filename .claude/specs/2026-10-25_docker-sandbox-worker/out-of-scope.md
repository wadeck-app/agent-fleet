# Out of Scope -- Docker Sandbox Worker

Items listed here are **explicitly excluded**.
Raising an excluded item as a requirement is a change-of-scope conversation, not a design question.

## Excluded items (v1)

- **Remote machines.** Iteration 2 (decision #10, question 15).
- **Attach to a running sandbox worker.** Decision #22.
- **Copy-out of diagnostics before removal.** Decision #18; reconsidered only if something else proves necessary.
- **Removal of a sandbox for inactivity.** Decision #16.
- **Bedrock guardrail header and session-logging hook.** Decision #12.
- **Surviving a daemon restart for session resume.** Existing flow limitation (decision #25).
- **Linux hosts and macOS validation.** Not validated in v1 (decision #23).
- **Git inside a worktree workspace.** Docker documents that git cannot resolve a worktree's pointer inside the sandbox (untested by us); unsupported in v1.
- **Unattended Codex OAuth.** It needs a browser on the host; API-key and Bedrock access are the supported paths.
- **A "deny everything except" network policy per sandbox.** Not achievable under the machine-wide policy (a deny always wins, measured); residual accepted, see threat T-05.

## Scope note

`2026-09-11_worker-availability-cli/out-of-scope.md` excludes "Cloud pool providers (provision a VM or container per worker)". This spec stays consistent with it only if the wrapper is started by the host operator and the daemon never provisions sandboxes itself. A daemon-driven launch would be a versioned scope change.

## How to challenge scope
If you believe an item should be in scope, open a new discussion with the rationale.
Do not modify this file silently -- scope changes must be acknowledged as a versioned decision.
