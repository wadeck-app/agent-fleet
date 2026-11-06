# Architecture -- Docker Sandbox Worker

**Version:** v0.2
**Last updated:** 2026-10-26
**Status:** Draft

## Overview

A worker plugin registers with the daemon like any other worker. Each worker holds one sandbox at a time, created at the first assignment of a run and removed when the run ends or is cancelled. Scripts and the model tools (Claude, Codex, OpenCode) run inside it. The daemon sees an ordinary worker. This document is the high-level picture; mechanisms are in the plan.

## Decisions

See `_index.md` (decisions 1-30).

## Design

- The worker connects out to the daemon like every worker; the sandbox never talks to the daemon directly (P-1).
- Two variants are built and compared (decision 14): in the "relay" variant a flow worker runs inside the sandbox and the host wrapper only relays; in the "exec" variant the engine stays on the host and only the processes run in the sandbox.
- The sandbox sees exactly the run's workspace and its `.meta` directory (decision 19); tool sessions and diagnostics live there, so they outlive the sandbox (decisions 17, 18).
- Credentials are never stored in the sandbox; the host serves short-lived ones on demand (decision 12).
- Lifecycle: stopped when idle, removed only at the end of the run or on cancel, never for inactivity (decisions 5, 16). Leftovers are listed and removed only by explicit command (decision 26).
- Direction (user, not a numbered decision): a bridge launches an inner worker and relays, bridges can nest (remote wrapper over sandbox bridge), and each hop filters messages; the exec variant is not a bridge.

## Security considerations

See `threat-model.md` (T-01 to T-14).
