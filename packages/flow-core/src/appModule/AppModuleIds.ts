// Ids the flow app-modules are registered under with app-core. Single source: flow-cli registers them, each
// module's manifest.json must carry the same id (asserted by the module's own manifest test). Keep this file
// free of imports: flow-cli's updater bundle reads it and has a size limit.

/** `id` in the manifest.json of the flow module. */
export const FLOW_APP_MODULE_ID = 'flow';

/** `id` in the manifest.json of the flow-chart module; that module `requires` the flow module. */
export const FLOW_CHART_APP_MODULE_ID = 'flow-chart';
