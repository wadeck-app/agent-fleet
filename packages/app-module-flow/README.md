# app-module-flow

app-core module exposing flow state (executions, workers, logs, plugins) as read-only HTTP routes and DSL pages. All logic comes from `flow-core`; this package only validates query parameters, maps errors to HTTP status and projects records (no step `meta`).

Routes (`/api/modules/flow/...`): `GET /executions`, `/executions/:id`, `/flows`, `/workers`, `/logs`, `/plugins`, `/plugins/:id`. Registered in `src/backend/*Routes.ts`.

Pages: `src/dsl-views/*.yaml`, referenced by `manifest.json`. `views.test.ts` checks that every `$sources` url has a route and every link lands on a manifest page.

Known limit: the executions flow filter is set by clicking a row of the flows table (`?flow=`). A text/select bound to a URL parameter needs a dsl-ui change (only `Pagination` and `PageSizeSelect` take `urlParam`).

```
npm test            # builds flow-core first
npm run bundle      # dist-module/, what flow-cli registers with app-core
```

The flow-cli daemon registers `dist-module/manifest.json` on start; do not register it by hand on a shared app-core.
