import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import type { PluginLoader } from '../config/PluginLoader.js';
import { raceWithTimeout } from './BoundedWait.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';
import { WORKER_TYPE_POINT, noDirectory, wiringMistake } from './WorkerTypeFailures.js';
import { describeDuration } from './WorkerTypeOptions.js';

/** Reads the option names the manifest of a (non built-in) plugin source declares (`options`), see `WorkerTypeWorkspaces.readDeclared`. */
export class WorkerTypeDeclaredOptions {
	/**
	 * @returns the accepted option names; undefined when the manifest declares none (names are not checked)
	 * @throws an error naming the source and the plugin, with the fix, when the manifest cannot be read in time or declares a malformed list
	 */
	static async readDeclared(
		loader: Pick<PluginLoader, 'readDeclaredOptions'>,
		entry: Pick<WorkerSourceEntry, 'sourceId' | 'plugin' | 'pluginsDir'>,
		timeoutMs: number
	): Promise<string[] | undefined> {
		const { plugin, pluginsDir, sourceId } = entry;
		if (plugin === undefined) {
			throw wiringMistake(sourceId, 'has no plugin, so there is no manifest to read option names from');
		}
		if (pluginsDir === undefined) {
			throw noDirectory(sourceId, plugin);
		}
		try {
			let declared: { names: string[] | undefined } | undefined;
			const reading = loader
				.readDeclaredOptions(`plugins.${plugin}`, WORKER_TYPE_POINT, pluginsDir)
				.then(names => {
					declared = { names };
				});
			if ((await raceWithTimeout(reading, timeoutMs)) === 'timeout' || declared === undefined) {
				throw new Error(`reading the manifest did not finish within ${describeDuration(timeoutMs)}`);
			}
			return declared.names;
		} catch (err) {
			throw new Error(
				`worker source "${sourceId}": cannot read the option names declared by plugin "${plugin}" in "${pluginsDir}": ${getErrorMessage(err)}. ` +
					`Fix: correct the "options" of this implementation in plugin-${plugin.split('.')[0] ?? plugin}/plugin.config.js (a list of option names), or remove it.`,
				{ cause: err }
			);
		}
	}
}
