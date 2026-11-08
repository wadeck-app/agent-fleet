import type { WorkerTypeInstance } from 'extension-points';
import { RequirementSyntax } from 'flow-engine';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import type { PluginLoader } from '../config/PluginLoader.js';
import { raceWithTimeout } from './BoundedWait.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';
import { WORKER_TYPE_POINT, noDirectory, wiringMistake } from './WorkerTypeFailures.js';
import { describeDuration } from './WorkerTypeOptions.js';

/**
 * What the BUILT instances of the declared sources guarantee: the only source of truth for routing a step that
 * `requires` something.
 *
 * Authority: an instance is built by the daemon from the plugin the source was declared with, so its guarantees belong
 * to the authenticated source of a worker. A worker's own labels never count, because a worker declares them itself.
 *
 * Fail-closed: a source whose instance is not built (startup, build failed or timed out, disposed, declared again with
 * another plugin) guarantees nothing.
 */
export class WorkerTypeGuarantees {
	private readonly built = new Map<string, { key: string; guarantees: string[] }>();

	/**
	 * Checks the guarantees of an instance that was just built against the static declaration of its manifest.
	 *
	 * @param declared what the manifest of the implementation declares (its upper bound)
	 * @returns the guarantees, normalised
	 * @throws when they are not a list of valid entries, or list one the manifest does not declare. Both are the plugin
	 *         author's to fix, and a source that overclaims must not be routed to.
	 */
	static check(instance: Pick<WorkerTypeInstance, 'guarantees'>, declared: readonly string[]): string[] {
		let guarantees: string[];
		try {
			guarantees = RequirementSyntax.normalise(instance.guarantees, 'its instance guarantees');
		} catch (err) {
			throw new Error(
				`${(err as Error).message} Fix: return guarantees as a list of "key=value" or keyword strings, or remove the field.`,
				{ cause: err }
			);
		}
		const undeclared = guarantees.filter(entry => !declared.includes(entry));
		if (undeclared.length > 0) {
			throw new Error(
				`its instance guarantees ${undeclared.map(entry => JSON.stringify(entry)).join(', ')}, which the manifest does not declare ` +
					`(declared: ${declared.length === 0 ? 'none' : declared.join(', ')}). ` +
					`Fix: add the entry to the "guarantees" of this implementation in plugin.config.js, or stop advertising it.`
			);
		}
		return guarantees;
	}

	/**
	 * Reads the guarantees the manifest of a (non built-in) plugin source declares, bounded by `timeoutMs`.
	 *
	 * @throws an error naming the source and the plugin, with the fix, when the manifest cannot be read in time or declares malformed entries
	 */
	static async readDeclared(
		loader: Pick<PluginLoader, 'readDeclaredGuarantees'>,
		entry: WorkerSourceEntry,
		timeoutMs: number
	): Promise<string[]> {
		const { plugin, pluginsDir, sourceId } = entry;
		if (plugin === undefined) {
			throw wiringMistake(sourceId, 'has no plugin, so there is no manifest to read guarantees from');
		}
		if (pluginsDir === undefined) {
			throw noDirectory(sourceId, plugin);
		}
		try {
			let declared: string[] | undefined;
			const reading = loader
				.readDeclaredGuarantees(`plugins.${plugin}`, WORKER_TYPE_POINT, pluginsDir)
				.then(read => {
					declared = read;
				});
			if ((await raceWithTimeout(reading, timeoutMs)) === 'timeout' || declared === undefined) {
				throw new Error(`reading the manifest did not finish within ${describeDuration(timeoutMs)}`);
			}
			return declared;
		} catch (err) {
			throw new Error(
				`worker source "${sourceId}": cannot read the guarantees declared by plugin "${plugin}" in "${pluginsDir}": ${getErrorMessage(err)}. ` +
					`Fix: correct the "guarantees" of this implementation in plugin-${plugin.split('.')[0] ?? plugin}/plugin.config.js (a list of "key=value" or keyword strings).`,
				{ cause: err }
			);
		}
	}

	/** Records the guarantees of a built instance, with the plugin it was built from (see {@link of}). */
	record(sourceId: string, key: string, guarantees: string[]): void {
		this.built.set(sourceId, { key, guarantees });
	}

	forget(sourceId: string): void {
		this.built.delete(sourceId);
	}

	/** The guarantees of the instance built for this source from this plugin; none when there is no such instance. */
	of(sourceId: string, key: string): string[] {
		const known = this.built.get(sourceId);
		return known?.key === key ? [...known.guarantees] : [];
	}
}
