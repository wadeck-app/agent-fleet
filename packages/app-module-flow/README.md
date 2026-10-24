# app-module-flow

app-core module exposing flow state (executions, workers, logs, plugins) as read-only HTTP routes and DSL pages. All logic comes from `flow-core`; this package only validates query parameters, maps errors to HTTP status and projects records (no step `meta`).

Routes (`/api/modules/flow/...`): `GET /executions`, `/executions/:id`, `/executions/:id/logs`, `/flows`, `/widgets/executions`, `/workers`, `/logs`, `/plugins`, `/plugins/:id`. Registered in `src/backend/*Routes.ts`.

Pages: `src/dsl-views/*.yaml`, referenced by `manifest.json`. `views.test.ts` checks that every `$sources` url has a route and every link lands on a manifest page.

Slots other modules fill: `flow:execution-links` / `flow:execution-actions` (detail header, before / after Logs), `flow:execution-row-links` / `flow:execution-row-actions` (row panel, before / after Logs), `flow:executions-actions` (list page). See `FlowModuleContract` in flow-core.

Details: [.docs/pages-and-variants.md](.docs/pages-and-variants.md) covers the executions page, execution logs, times and columns, and the dashboard widget (no A/B experiment is left: every view has one design).

Served text (run output, errors, log lines) is ANSI-stripped only: no secret detection, what is stored is what is served. Declared secrets (`type: password` inputs) are masked by the daemon at write time; records written before that, and undeclared secrets, may contain secrets. Grep recipe: [.docs/served-text.md](.docs/served-text.md).

```
npm test            # builds flow-core first
npm run bundle      # dist-module/, what flow-cli registers with app-core
```

The flow-cli daemon registers `dist-module/manifest.json` on start; do not register it by hand on a shared app-core.
