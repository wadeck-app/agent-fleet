import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import { APP_MODULES, type AppModuleDescriptor } from './AppModules.js';

/** Where the packaged app-module is not to be found. The message says how to get it. */
export class AppModuleNotFoundError extends Error {
	constructor(
		readonly searched: string[],
		readonly module: AppModuleDescriptor
	) {
		super(
			`app-module "${module.id}" manifest not found (looked in ${searched.join(' and ')}). ` +
				`Build it with "npm run bundle" in packages/${module.sourcePackage} (a source checkout), or reinstall flow-cli (a published install ships it as ${module.bundleDir}/).`
		);
		this.name = 'AppModuleNotFoundError';
	}
}

export interface AppModuleLocations {
	/** `<bundleDir>/manifest.json` next to the CLI bundle (see ci/scripts/bundle.ts). */
	bundled: string;
	/** `packages/<sourcePackage>/dist-module/manifest.json`, built by `npm run bundle` there, for a source checkout. */
	dev: string;
}

/**
 * What the daemon needs to register the module, or undefined after reporting why it cannot: a missing
 * app-module must not stop the daemon (it serves flows without it) but must not go unnoticed either.
 */
export function appCoreModuleOption(
	locations: AppModuleLocations,
	module: AppModuleDescriptor,
	reportError: (message: string) => void
): { manifestPath: string } | undefined {
	try {
		return { manifestPath: locateAppModuleManifest(locations, module) };
	} catch (err) {
		if (!(err instanceof AppModuleNotFoundError)) {
			throw err;
		}
		reportError(
			`${getErrorMessage(err)} The daemon starts without registering the "${module.id}" module with app-core.`
		);
		return undefined;
	}
}

/** The two layouts, relative to the file of the running CLI (`import.meta.url`). */
export function defaultAppModuleLocations(cliModuleUrl: string, module: AppModuleDescriptor): AppModuleLocations {
	return {
		bundled: fileURLToPath(new URL(`./${module.bundleDir}/manifest.json`, cliModuleUrl)),
		// packages/flow-cli/dist/cli/FlowIndex.js -> packages/<sourcePackage>/dist-module
		dev: fileURLToPath(new URL(`../../../${module.sourcePackage}/dist-module/manifest.json`, cliModuleUrl)),
	};
}

/**
 * Every module of {@link APP_MODULES} that can be located, in registration order. One that cannot be found is
 * reported and left out, without hiding the others: if flow is missing, flow-chart is still returned and
 * app-core answers with its own reason (it may well hold flow from an earlier run).
 */
export function appCoreModuleOptions(
	cliModuleUrl: string,
	reportError: (message: string) => void
): { id: string; manifestPath: string }[] {
	const options: { id: string; manifestPath: string }[] = [];
	for (const module of APP_MODULES) {
		const option = appCoreModuleOption(defaultAppModuleLocations(cliModuleUrl, module), module, reportError);
		if (option) {
			options.push({ id: module.id, ...option });
		}
	}
	return options;
}

/**
 * The PACKAGED manifest of the app-module. The source `manifest.json` of packages/app-module-* is not
 * registrable (no version, no backendEntryPath: app-core refuses it), so only dist-module counts.
 */
export function locateAppModuleManifest(locations: AppModuleLocations, module: AppModuleDescriptor): string {
	for (const candidate of [locations.bundled, locations.dev]) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}
	throw new AppModuleNotFoundError([locations.bundled, locations.dev], module);
}
