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
