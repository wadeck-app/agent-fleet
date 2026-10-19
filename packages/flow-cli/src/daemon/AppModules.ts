import { FLOW_APP_MODULE_ID, FLOW_CHART_APP_MODULE_ID } from 'flow-core';

// Imported by the updater entry: its bundle has a size limit (ci/scripts/bundle.ts), so import only constants.

/** One app-module shipped with flow-cli and registered with app-core. */
export interface AppModuleDescriptor {
	/** Must equal the `id` of the module's manifest.json: app-core refuses a registration under another id. */
	id: string;
	/** Folder next to the CLI bundle (flow.cjs) that holds the packaged module, see ci/scripts/bundle.ts. */
	bundleDir: string;
	/** Package under packages/ that builds the module (`npm run bundle` there), used in a source checkout. */
	sourcePackage: string;
}

/**
 * Registration order matters: flow-chart `requires` flow, so flow goes first. `app-module/` keeps its historical
 * name so that an updater from an older install still finds flow's module.
 */
export const APP_MODULES: readonly AppModuleDescriptor[] = [
	{ id: FLOW_APP_MODULE_ID, bundleDir: 'app-module', sourcePackage: 'app-module-flow' },
	{ id: FLOW_CHART_APP_MODULE_ID, bundleDir: 'app-module-flow-chart', sourcePackage: 'app-module-flow-chart' },
];
