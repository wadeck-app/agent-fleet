# Project integration (provider route and filter)

## Provider route

`GET /api/modules/flow/related/project/:projectId` (`ProjectRelatedRoutes.ts`). Read-only; the registry is read per request.

```
{ title: 'Flow executions', count, items: [{ label, subtitle, url }], moreUrl, project: { name, removed, virtual } }
```

- `count`: runs of the project with status `running`, `queued` (shown as "waiting") or `re-queued`. There is no approval status in executions.
- `items`: 10 latest runs. `label` = flow id, `subtitle` = `<status> - <startedAt ISO>`, `url` = `/modules/flow/executions/<id>`.
- `moreUrl`: `/modules/flow/executions?project=<projectId>`. The executions page filters on `?project=` (route param `projectId`).
- `project` is an addition to the requested contract: registry name, `removed` (soft-deleted, still answered), `virtual` (no path, answered like any other).

| Case | Answer |
| --- | --- |
| id not 8 lowercase hex | 400, says what an id looks like |
| id absent from registry | 404, `project list` hint, no project listed |
| registry unreadable | 502, directory and cause |
| other failure | error reply (500), never a throw |

Cost: one scan of the executions directory (same loader as the executions page), no cap on the scan.

## Slots for the project module

Both slots accept built-in DSL types only: `ButtonLink`, `IconButton`, `Badge`, `Link` (flow-core `FLOW_PROJECT_SLOTS`). A namespaced type would make the contributor fail to load without its provider, so flow has no `requires` and no dependency on the project module (pinned by `manifest.test.ts`). Only the root `$type` is checked, not its props.

| Slot | Where | Host context |
| --- | --- | --- |
| `flow:execution-project-header` | execution detail, next to the badges | `$route.id`, `$sources.execution.projectId`, `$sources.execution.projectLabel` (absent on runs recorded before project ids) |
| `flow:executions-project-header` | executions page, filter row | URL param `project` (the filter, 8 hex chars) |

The action slots (`execution-links`, `execution-actions`, `executions-actions`, `execution-row-links`, `execution-row-actions`) still accept `flow-chart:FlowChartLink` only.
