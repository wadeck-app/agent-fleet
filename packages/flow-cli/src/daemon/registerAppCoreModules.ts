import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import { registerWithAppCore } from './AppCoreRegistration.js';
import { writeDaemonLog } from './DaemonLog.js';

/**
 * Registers the modules with app-core, one after the other, in the given order (flow-chart requires
 * flow, so flow first). A failure on one never prevents the next from being tried: app-core states
 * its own reason if a requirement is missing.
 */
export async function registerAppCoreModules(
	modules: { id: string; manifestPath: string }[],
	logsDir: string
): Promise<void> {
	for (const appModule of modules) {
		try {
			await registerWithAppCore(
				appModule.manifestPath,
				entry => writeDaemonLog(logsDir, entry.level, `[${entry.source}] ${entry.message}`),
				appModule.id
			);
		} catch (err) {
			writeDaemonLog(
				logsDir,
				'error',
				`[AppCoreRegistration] unexpected failure registering module "${appModule.id}" with app-core: ${getErrorMessage(err)}`
			);
		}
	}
}
