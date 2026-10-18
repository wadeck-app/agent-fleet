import { describeRegistration, describeRegistrationFailure, registerModule } from '@wadeck-app/app-core-sdk/register';

/** Must equal the `id` of packages/app-module-flow/manifest.json: app-core refuses a registration under another id. */
export const APP_CORE_MODULE_ID = 'flow';

export interface AppCoreDiagnostic {
	level: 'info' | 'error';
	source: string;
	message: string;
}

/**
 * Tells a running app-core where flow's app-module lives (POST /api/modules/register, which also reloads a
 * module it already knows). Everything app-core answers is reported through `logDiagnostic`, a refusal with
 * its own reason at error level. app-core being absent is a normal state (the SDK answers `deferred` or
 * `skipped`), reported as information, not as an error. Best-effort: never throws, so neither the daemon
 * start nor an update can be broken by it.
 */
export async function registerWithAppCore(
	manifestPath: string,
	logDiagnostic: (entry: AppCoreDiagnostic) => void
): Promise<void> {
	const report = (entry: AppCoreDiagnostic): void => {
		try {
			logDiagnostic(entry);
		} catch (err) {
			// The sink failed (full disk...): the daemon must start anyway, so say it on stderr.
			process.stderr.write(`[flow] app-core registration: cannot record "${entry.message}": ${String(err)}\n`);
		}
	};
	try {
		const outcome = await registerModule({ id: APP_CORE_MODULE_ID, manifestPath });
		report({
			level: outcome.status === 'refused' ? 'error' : 'info',
			source: 'AppCoreRegistration',
			message: describeRegistration(outcome, APP_CORE_MODULE_ID),
		});
	} catch (err) {
		report({ level: 'error', source: 'AppCoreRegistration', message: describeRegistrationFailure(err) });
	}
}
