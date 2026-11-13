# Implicit confinement of model steps: per project

Status: implemented (uncommitted). Supersedes the machine-wide rule of f6c53f8d.

## Problem

One declared source guaranteeing `agent` made EVERY model step of EVERY project require it. A sandbox declared for one project would have refused or parked the model steps of the user's other projects (in-place workspaces).

## Decisions

| Rule | Why | What changes for the user |
| --- | --- | --- |
| A covering source (guarantees all of `agent`) covers a run only if it serves the run's project: its entry has no `projects` option, or lists the project id. | The sandbox plugin is declared for projects (`--option projects=<ids>`), so that is the scope it was given. | Sandbox declared for `test-tasks`; a flow of `test-flow` with a model step. Before: refused or waiting. After: routes as before, plus the per-step warning. A flow of `test-tasks`: confined, unchanged. |
| A covering source serving only other projects does not cover the run; the warning says so. | Fail visible, never silent. | `model step m runs unconfined: no worker source serving project test-flow guarantees env=clean and fs=confined (sbx does, but serves other projects); declare a sandbox source for this project (flow worker source list) or write profile: agent to require it` |
| No `projects` option: serves every project (as today). | Other plugins and hand-written entries keep working. | Nothing. |
| Run without a project id: covered only if no declared source on the machine restricts its projects; otherwise not covered, with the warning. | Without an id nothing can be said about a restricted source. | None in practice: `accept` always has a project id. |
| `projects` is read from the source ENTRY (`options.projects`: comma string as `--option` stores it, or a list), never by loading the plugin. Any other shape serves no project. | Declared data only; fail closed on a malformed value. | None. |
| The static manifest `guarantees` still decide the guarantee. | Unchanged. | None. |
| Resume uses the stored requirements. | Unchanged; the record is the truth. | None. |
| Routing (`StepRouter`) is not changed: a worker serving only project B never takes a step of project A. | Already the hard filter; now pinned by a test next to the requirements tests. | None. |

Code: `DeclaredGuarantees.providersOfAllForProject`, `ImplicitConfinement.resolve(flow, projectId)`, called from `RunRequestHandler.accept` with `project.project.id`.

## Not done

- Other plugins whose project option has another name are read as unrestricted (serve all): only the `projects` option is known.
- The per-project scope is not shown by `flow worker source list`.
- `packages/flow-sandbox/README.md` ("Model steps are confined implicitly") still describes the machine-wide rule: out of scope for this change, to update.
- A project-wide opt-in or opt-out (a `confine:` setting on the project) does not exist.

## Reopen

If a source should serve projects through a mechanism other than the `projects` option (a plugin manifest field, the registered workers), change `declaredProjects` in `DeclaredGuarantees.ts`; the rest does not depend on where the list comes from.
