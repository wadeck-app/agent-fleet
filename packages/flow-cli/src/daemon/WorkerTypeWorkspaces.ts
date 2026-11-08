import type { WorkerTypeInstance } from 'extension-points';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import type { PluginLoader } from '../config/PluginLoader.js';
import { WorkspaceKindList } from '../config/WorkspaceKindList.js';
import { raceWithTimeout } from './BoundedWait.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';
import { WORKER_TYPE_POINT, noDirectory, wiringMistake } from './WorkerTypeFailures.js';
import { describeDuration } from './WorkerTypeOptions.js';

/**
 * The workspace provider kinds the BUILT instances of the declared sources accept, next to what their manifests declare
 * (see `WorkerTypeGuarantees`, whose shape this follows). `undefined` everywhere means "no restriction".
 *
 * Fail-closed: a source whose instance is not built (startup, failed build, disposed, declared again with another
 * plugin) accepts no kind.
 */
export class WorkerTypeWorkspaces {
	private readonly built = new Map<string, { key: string; kinds: string[] | undefined }>();

	/**
	 * Checks the kinds of an instance that was just built against the static declaration of its manifest.
	 *
	 * @param declared what the manifest of the implementation declares (its upper bound); undefined: no restriction
	 * @returns the kinds the instance accepts: its own (a subset of the manifest's), else the manifest's; undefined for no restriction
	 * @throws when they are not a list of known kinds, or list one the manifest does not declare (an instance may only narrow).
	 */
	static check(
		instance: Pick<WorkerTypeInstance, 'workspaces'>,
		declared: readonly string[] | undefined
	): string[] | undefined {
		let own: string[] | undefined;
		try {
			own = WorkspaceKindList.normalise(instance.workspaces, 'its instance workspaces');
		} catch (err) {
			throw new Error(
				`${(err as Error).message} Fix: return workspaces as a list of known kinds, or remove the field.`,
				{
					cause: err,
				}
			);
		}
		if (own === undefined || declared === undefined) {
			return own ?? (declared === undefined ? undefined : [...declared]);
		}
		const wider = own.filter(kind => !declared.includes(kind));
		if (wider.length > 0) {
			throw new Error(
				`its instance accepts the workspace kind(s) ${wider.map(kind => JSON.stringify(kind)).join(', ')}, which the manifest does not declare ` +
					`(declared: ${declared.join(', ')}). An instance may only narrow the manifest. ` +
					`Fix: add the kind to the "workspaces" of this implementation in plugin.config.js, or stop accepting it.`
			);
		}
		return own;
	}

	/**
	 * Reads the workspace kinds the manifest of a (non built-in) plugin source declares, bounded by `timeoutMs`.
	 *
	 * @throws an error naming the source and the plugin, with the fix, when the manifest cannot be read in time or declares unknown kinds
	 */
	static async readDeclared(
		loader: Pick<PluginLoader, 'readDeclaredWorkspaces'>,
		entry: WorkerSourceEntry,
		timeoutMs: number
	): Promise<string[] | undefined> {
		const { plugin, pluginsDir, sourceId } = entry;
		if (plugin === undefined) {
			throw wiringMistake(sourceId, 'has no plugin, so there is no manifest to read workspace kinds from');
		}
		if (pluginsDir === undefined) {
			throw noDirectory(sourceId, plugin);
		}
		try {
			let declared: { kinds: string[] | undefined } | undefined;
			const reading = loader
				.readDeclaredWorkspaces(`plugins.${plugin}`, WORKER_TYPE_POINT, pluginsDir)
				.then(kinds => {
					declared = { kinds };
				});
			if ((await raceWithTimeout(reading, timeoutMs)) === 'timeout' || declared === undefined) {
				throw new Error(`reading the manifest did not finish within ${describeDuration(timeoutMs)}`);
			}
			return declared.kinds;
		} catch (err) {
			throw new Error(
				`worker source "${sourceId}": cannot read the workspace kinds declared by plugin "${plugin}" in "${pluginsDir}": ${getErrorMessage(err)}. ` +
					`Fix: correct the "workspaces" of this implementation in plugin-${plugin.split('.')[0] ?? plugin}/plugin.config.js (a list of: ${WorkspaceKindList.KNOWN.join(', ')}), or remove it.`,
				{ cause: err }
			);
		}
	}

	/** Records the kinds of a built instance, with the plugin it was built from (see {@link of}). */
	record(sourceId: string, key: string, kinds: string[] | undefined): void {
		this.built.set(sourceId, { key, kinds });
	}

	forget(sourceId: string): void {
		this.built.delete(sourceId);
	}

	/** The kinds of the instance built for this source from this plugin (undefined: no restriction); none accepted when there is no such instance. */
	of(sourceId: string, key: string): string[] | undefined {
		const known = this.built.get(sourceId);
		return known?.key === key ? (known.kinds === undefined ? undefined : [...known.kinds]) : [];
	}
}
