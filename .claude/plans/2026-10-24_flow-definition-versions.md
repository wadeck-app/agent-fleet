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

## Design (implementing agent, 2026-10-24)

### Evidence

| Fact | Where |
| --- | --- |
| A flow file is ONE `FlowDefinition` (`id`, `version: '1.0.0'`, `steps`...); flow-cli never uses `FlowRegistry` (legacy orchestrator). | `CommandHandler.handleRun` parses the file; `FlowDefinitionLoader` |
| `flow run <id>` sends `flowFile=<project>/.flow/flows.yml` + `flowId`; the daemon parses that multi-flow map as one definition, so registered ids cannot run today (to be proven by a red test). | `RunCommand.resolveFlowFile` |
| `flow resume` never reloads the definition: scheduler state is in memory and resume only works while the same daemon lives. | `CommandHandler.handleResume` |
| `subflow` steps are refused by the daemon ("not supported in v1"); the engine executor resolves them with `FlowRegistry.getFlow(id)` (no version). | `handleRun`, `SubflowStepExecutor` |
| The chart re-reads `record.flowFile` and infers edges + warns "flow file changed since this run" when steps vanished. | `FlowGraphQuery`, `FlowGraphBuilder` |
| `version` is not validated by the engine today. `semver` is a dependency of the two app modules only (root has a transitive 6.3.1); flow-core must not import flow-engine at runtime (bundle weight, cycle). | package.json files |

### Decisions

| Topic | Decision |
| --- | --- |
| Version | The definition's `version` field, strict semver 2.0 (no build metadata). Compared by a small strict parser in flow-core (`SemanticVersion`), not by mtime. No new dependency: avoids a lockfile change and a second semver major. |
| Missing version | Treated as `0.0.0` ("unversioned") with a validation WARNING ("add `version: '1.0.0'`"). `0.0.0` never triggers the conflict rule. Non-string / non-semver version: ERROR from `flow validate` and a refused run. |
| Snapshot | `definitions/<flowId>/<version>-<hash12>.yml` under the flow config dir; the path is built ONLY by `FlowConfigLayout` (`definitionsDirOf`, `definitionSnapshotPathOf`). `flowId` must match `[A-Za-z0-9._-]+` (path safety). |
| Hash | sha256 of the canonical JSON (sorted keys) of the parsed definition: comments / key order / whitespace do not change identity. Snapshot text = the file text (file runs) or `yaml.dump` (registry entry). Written once (`wx`); same version+hash = no-op. |
| Latest | Highest semver among {registry entry's current version, snapshots}. Resolved once at run start, stored on the record, never recomputed (resume included). A lower file version than a snapshot does NOT win (warned by `validate`/`show`). |
| Pinned | `flow run <id>@<semver>`; also IPC `run.flowVersion`. Only syntax (no extra flag). `@` is split off only when the ref is not an existing file. Pinning with a file path is refused. Unknown version: error listing known versions. |
| File path | Runs the file as is; version choice `file`; snapshotted. |
| Registered id | IPC `run.registered=true`: `flowFile` = registry file (`.flow/flows.yml`, `includes:` supported, `source:` refused), entry `flowId`. If the registry is absent, snapshots alone can satisfy the id. |
| Conflict | Same flowId + same explicit version (not 0.0.0) + different hash => run refused: "same version X but different content than snapshot <hash12>: bump the version in <file>". Two different contents tied at the highest version (only possible at 0.0.0) => "ambiguous" error. |
| Resume | Uses the in-memory definition resolved at start; the record's version fields never change. Test pins this. |
| Sub-flows | Rule (documented, not coded): all `subflow` targets are resolved at the time the PARENT starts (same algorithm), pinned for the whole tree; each sub-execution records its own `flowVersion` with choice `pinned`. Nothing to implement while the daemon refuses `subflow`; the refusal test stays. |
| Record (additive) | `flowVersion`, `definitionHash` (full sha256), `definitionSnapshot` (relative ref `<flowId>/<file>`), `versionChoice` (`latest`/`pinned`/`file`). Old records: absent => "version not recorded". |
| Chart | `queryFlowGraph` takes the recorded snapshot when present (`definitionsDir` option), else the old file path + inference. |
| CLI | `flow versions <flowId>` (version, hash12, first seen = snapshot mtime, written once). `flow history` VERSION column, `flow show` Version line, `flow validate`/`flow show <file>` version status + warnings. |
| Retention | Not implemented (snapshots are a few KB; sizes measured below). Follow-up. |

### Implementation notes (2026-10-24)

- Deviation from the evidence table: a registered id with a `source:` entry is refused (not resolved); only inline entries and `includes:` (one level) are read.
- Snapshot is written by `ResolvedDefinition.commit()` only after validation and before the record: a refused run never freezes its version.
- Storage measured on this repo: 43 registry flows, 361 B to 8.4 KB, average 1.7 KB (total 70 KB). Retention/pruning: not implemented.
- Follow-ups: pruning of old snapshots; `flow run <id>` outside a project (snapshots only); `subflow` support in the daemon (rule above); showing the version in the executions widget and in `flow-cli` events/hooks payloads; a lint that flags a version bump missing in a PR.
