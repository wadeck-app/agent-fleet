# Out of Scope — agent-fleet

## Plugin system (v1)
- Subprocess/process-level plugin isolation — plugins run in-process in v1 (developer-written only); isolation is v2.
- Remote config download — v3.
- CI global config file as a first-class feature — v2.
- Plugin input/placeholder schema — v3.

## CLI distribution (current scope)
- SDK `UpdateCmd` for wdrive Windows update — deferred (T8).
- wdrive npm migration — blocked on T5.
- npm distribution for scrapers — local automation only, intentionally not published.
- Linux/macOS support for scrapers — Windows-specific APIs used.
- Go launcher for violations-framework — violations is not a daemon; no launcher needed.

## Orchestrator / workers
- Orchestrator does not manage worker workspaces — workers are autonomous and report their own workspace path.
- Orchestrator does not spin up or tear down worker processes — it aggregates, never controls.

## Policy engine
- Policy engine is a separate autonomous CLI, not embedded in the orchestrator or flow steps; it communicates via HTTP only.
- MCP is not used for non-Claude callers (policy engine uses HTTP daemon API directly).
