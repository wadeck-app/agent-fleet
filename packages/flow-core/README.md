# flow-core

Read-only logic shared by the `flow` CLI and the web side (app-module-flow). Both depend on this package, never on each other.

Rules:

- Everything flow-specific and host-independent lives here: no printing, no `process.exit`, no environment reads. Locations are injected.
- Errors extend `FlowCoreError` with an actionable message; hosts map them (CLI: exit code, HTTP: status).
- Writers of persisted data (executions, logs) stay in flow-cli; the record shapes live here (`ExecutionState`).

Entry point: `FlowQueryService` (`src/query/FlowQueryService.ts`), built with `FlowQueryService.forConfigDir(configDir)`. It covers executions, flows, logs, workers and plugins.

Other exports are in `src/index.ts`; `createRemoteDaemonClient` is the only way hosts should talk to the daemon (no in-process fallback).

```
npm test            # vitest
npm run build       # tsc; consumers read dist/
```

`flow-core/testing` (`src/testing/index.ts`): fixtures and route doubles shared by the tests of flow-cli and the app-modules. Imports vitest; never import it from production code.

flow-cli and the app-modules must not reference each other; `src/architecture/DependencyDirection.test.ts` enforces it.
