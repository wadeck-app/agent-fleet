import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Where the packaged app-module is not to be found. The message says how to get it. */
export class AppModuleNotFoundError extends Error {
	constructor(readonly searched: string[]) {
		super(
			`flow app-module manifest not found (looked in ${searched.join(' and ')}). ` +
				'Build it with "npm run bundle" in packages/app-module-flow (a source checkout), or reinstall flow-cli (a published install ships it as app-module/).'
		);
		this.name = 'AppModuleNotFoundError';
	}
}

export interface AppModuleLocations {
	/** `app-module/manifest.json` next to the CLI bundle (see ci/scripts/bundle.ts). */
	bundled: string;
	/** `packages/app-module-flow/dist-module/manifest.json`, built by `npm run bundle` there, for a source checkout. */
	dev: string;
}

/**
 * What the daemon needs to register the module, or undefined after reporting why it cannot: a missing
 * app-module must not stop the daemon (it serves flows without it) but must not go unnoticed either.
 */
export function appCoreModuleOption(
	locations: AppModuleLocations,
	reportError: (message: string) => void
): { manifestPath: string } | undefined {
	try {
		return { manifestPath: locateAppModuleManifest(locations) };
	} catch (err) {
		if (!(err instanceof AppModuleNotFoundError)) throw err;
		reportError(`${err.message} The daemon starts without registering the flow module with app-core.`);
		return undefined;
	}
}

/** The two layouts, relative to the file of the running CLI (`import.meta.url`). */
export function defaultAppModuleLocations(cliModuleUrl: string): AppModuleLocations {
	return {
		bundled: fileURLToPath(new URL('./app-module/manifest.json', cliModuleUrl)),
		// packages/flow-cli/dist/cli/FlowIndex.js -> packages/app-module-flow/dist-module
		dev: fileURLToPath(new URL('../../../app-module-flow/dist-module/manifest.json', cliModuleUrl)),
	};
}

/**
 * The PACKAGED manifest of the app-module. The source `manifest.json` of packages/app-module-flow is not
 * registrable (no version, no backendEntryPath: app-core refuses it), so only dist-module counts.
 */
export function locateAppModuleManifest(locations: AppModuleLocations): string {
	for (const candidate of [locations.bundled, locations.dev]) {
		if (fs.existsSync(candidate)) return candidate;
	}
	throw new AppModuleNotFoundError([locations.bundled, locations.dev]);
}
