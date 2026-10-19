// Imported by the updater entry: must stay free of flow runtime imports (the updater bundle has a size limit).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type AppModuleVersion = { version: string } | { absent: true } | { error: string };

export interface RegisterAfterUpdateDeps {
	/** manifest.json of the app-module inside the installed package. */
	manifestPath: string;
	/** What `readAppModuleVersion` returned BEFORE the updater ran. */
	before: AppModuleVersion;
	register: (
		manifestPath: string,
		log: (entry: { level: string; source: string; message: string }) => void
	) => Promise<void>;
	log: (line: string) => void;
}

/** The version of the installed app-module, "absent" when the package ships none, or why it cannot be read. */
export function readAppModuleVersion(manifestPath: string): AppModuleVersion {
	if (!existsSync(manifestPath)) return { absent: true };
	try {
		// violations-suppress: ts/no-unsafe-type-cast a JSON file is untyped at the boundary, the field is checked below
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: unknown };
		if (typeof manifest.version !== 'string') return { error: `${manifestPath} has no "version" string` };
		return { version: manifest.version };
	} catch (err) {
		return { error: `cannot read ${manifestPath} (${String(err)})` };
	}
}

/**
 * After `flow cli update`, a running app-core still holds the previous app-module in memory (it reads the
 * manifest only when told to). The daemon re-registers on its own start, but an update does not restart it,
 * so the updater tells app-core itself, when the installed app-module actually changed. Comparing the manifest
 * version before and after depends on nothing but the files: "already up to date" and a failed or rolled-back
 * update leave it unchanged, and nothing is printed for them.
 */
export async function registerAfterUpdate(deps: RegisterAfterUpdateDeps): Promise<void> {
	const after = readAppModuleVersion(deps.manifestPath);

	if ('error' in after) {
		deps.log(`app-core: not re-registering the app-module, ${after.error}`);
		return;
	}
	if ('absent' in after) {
		if (!('absent' in deps.before)) {
			deps.log(
				`app-core: the installed package no longer ships an app-module (${deps.manifestPath}), nothing to register`
			);
		}
		return;
	}
	if ('version' in deps.before && deps.before.version === after.version) return;
	await deps.register(deps.manifestPath, entry => deps.log(entry.message));
}

export interface TrackAppModuleUpdateDeps {
	/** Output of `npm root -g`, undefined when that command failed. */
	npmRoot: string | undefined;
	pkgName: string;
	register: RegisterAfterUpdateDeps['register'];
	/** Progress and diagnostics of the registration (stdout). */
	log: (line: string) => void;
	/** Reasons why nothing was registered (stderr). */
	warn: (line: string) => void;
}

/**
 * Wiring of {@link registerAfterUpdate} for the updater entry: locates the app-module manifest in the global
 * install and reads its version NOW, so call it before the install replaces the files. The returned function
 * is to run once the update is over; it never throws (a failed registration must not fail an update that
 * succeeded), every reason for not registering is reported through `warn`.
 */
export function trackAppModuleUpdate(deps: TrackAppModuleUpdateDeps): () => Promise<void> {
	if (deps.npmRoot === undefined) {
		return async () => {
			deps.warn('app-core: not re-registering the app-module, "npm root -g" failed earlier');
		};
	}
	const manifestPath = join(deps.npmRoot, deps.pkgName, 'app-module', 'manifest.json');
	const before = readAppModuleVersion(manifestPath);
	return async () => {
		try {
			await registerAfterUpdate({ manifestPath, before, register: deps.register, log: deps.log });
		} catch (err) {
			deps.warn(
				`app-core: re-registering the app-module failed (${String(err)}). Run \`flow cli update\` again or restart the flow daemon to register it`
			);
		}
	};
}
