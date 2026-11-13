// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { PluginLoader } from '../../config/PluginLoader.js';
import { SourceOptionNames } from '../../daemon/SourceOptionNames.js';
import { WorkerTypeInstances } from '../../daemon/WorkerTypeInstances.js';

// violations-suppress-end: ts/no-deep-relative

/**
 * Checks the `--option` names of `flow worker source add` against the names the plugin manifest declares (`options`), so a
 * misspelt `projects` is refused when the source is declared instead of being stored as a source that serves every project.
 * Nothing is built or contacted: only the manifest is read.
 */
export class WorkerSourceOptionCheck {
	/**
	 * @returns `refusal` when a name is not declared (the message names it, lists the accepted ones and the nearest);
	 *          `warning` when the manifest could not be read, so the names could not be checked; neither when they are fine,
	 *          the manifest declares no `options`, or the plugin is a built-in
	 */
	static async check(
		sourceId: string,
		plugin: string,
		pluginsDir: string,
		names: readonly string[]
	): Promise<{ refusal?: string; warning?: string }> {
		let accepted: string[] | undefined;
		try {
			accepted = await new WorkerTypeInstances(new PluginLoader(), () => {}).declaredOptions({
				sourceId,
				plugin,
				pluginsDir,
			});
		} catch (err) {
			return {
				warning: `Worker source "${sourceId}": the option names could not be checked: ${(err as Error).message}`,
			};
		}
		if (accepted === undefined) {
			return {};
		}
		const unknown = SourceOptionNames.unknown(names, accepted);
		if (unknown.length === 0) {
			return {};
		}
		return {
			refusal:
				`Worker source "${sourceId}" (plugin ${plugin}): ${SourceOptionNames.describe(unknown, accepted)} ` +
				`Fix: write --option <name>=<value> with one of the accepted names. Nothing was declared.`,
		};
	}
}
