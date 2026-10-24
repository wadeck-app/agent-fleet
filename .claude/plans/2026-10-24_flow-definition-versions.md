# Flow definition versions (TODO, user requirement 2026-10-24)

## Requirement (user, verbatim intent)

- A flow definition has a version.
- An execution follows the version that was the latest at execution time, unless a version is specified.
- The information is stored with the execution.

## What to design (decisions belong to the implementing agent, evidence first)

- Where versions live: flow files already carry `version: 'x.y.z'`; registry (`.flow/flows.yml`) resolves ids to files. Decide whether a version is the file's `version` field, whether older versions are kept (immutable snapshots, e.g. content-addressed under the flow config dir) and how "latest" is chosen (highest semver, not file mtime).
- Selecting a version at run time: syntax for `flow run <id>[@version]` and the daemon `run` command; default = latest at the moment of the run (resolved once, then fixed for the whole execution, including `flow resume`).
- Stored per execution: flowId, resolved version, the source (file path or registry entry), and a hash or snapshot of the exact definition that ran, so a later edit of the file cannot change what a past run means.
- Readers: `flow show <execution>`, `flow history`, flow-core `ExecutionState` (additive field, old records say "version not recorded"), the executions pages and the run chart, which today needs a "flow file changed since this run" warning and infers edges when the file changed: with the recorded definition the chart can draw the real structure.
- Validation: a version lower than or equal to an existing one with different content is refused (or warned), with an actionable message.
- Docs for flow-authoring agents (`flow docs`, flow skill): how versions work and how to bump.

## Constraints

- Backward compatible: records and flows without versions keep working.
- No heuristic: version comparison is semver; "latest" is decided by the registry, not by guessing.
- Touches flow-engine (loader, types), flow-cli (run, daemon, store, show/history), flow-core (record types, readers), app-module-flow and app-module-flow-chart (display, chart). Starts after the step I/O recording work lands (same files).
