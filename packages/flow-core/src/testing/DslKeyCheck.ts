import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface DslDiagnostic {
	severity: string;
	nodePath: string;
	message: string;
}

interface UnknownKeysModule {
	findUnknownKeys: (document: Record<string, unknown>, manifest: Record<string, unknown>) => DslDiagnostic[];
}

/**
 * The dsl-renderer walker and the dsl-ui key list the dev shell validates views with, for a module's views test.
 * DSL_PACKAGES_DIR points at another node_modules/@wadeck-app (for example app-core's) when the repository still has
 * an older release installed. Both packages must be installed (devDependencies of the calling module).
 */
export async function loadDslKeyCheck(): Promise<{
	findUnknownKeys: UnknownKeysModule['findUnknownKeys'];
	knownKeys: Record<string, unknown>;
}> {
	const override = process.env['DSL_PACKAGES_DIR'];
	const walker =
		override === undefined
			? ((await import('@wadeck-app/dsl-renderer/build/unknownKeys')) as UnknownKeysModule)
			: ((await import(
					pathToFileURL(join(override, 'dsl-renderer/dist/build/unknownKeys.js')).href
				)) as UnknownKeysModule);
	const keysFile =
		override === undefined
			? createRequire(import.meta.url).resolve('@wadeck-app/dsl-ui/known-keys.json')
			: join(override, 'dsl-ui/src/known-keys.json');
	const knownKeys: Record<string, unknown> = JSON.parse(readFileSync(keysFile, 'utf8'));
	return { findUnknownKeys: walker.findUnknownKeys, knownKeys };
}
