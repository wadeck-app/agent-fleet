import type { WorkerSourcePluginReference } from './WorkerSourcePluginReference.js';
import type { WorkerSourceDeclaration } from './WorkerSourceRegistry.js';

const FORK_PLUGIN = 'fork.default';
const FORK_PROVIDER = 'built-in:fork';

/** For a source already stored with the provider `built-in:fork` (declare refuses it, but a file can be edited or older). */
export function storedForkProviderMessage(sourceId: string): string {
	return (
		"fork is the daemon's own fallback and cannot be a declared source (its stored provider is built-in:fork). " +
		`Fix: flow worker source remove ${sourceId}; to add capacity declare a built-in:command source that launches "flow worker", or a built-in:inbound source for a worker you start yourself.`
	);
}

export const FORK_PROVIDER_NAME = FORK_PROVIDER;

/**
 * Refuses a declaration of the fork worker type. Fork is the daemon's own fallback for a step nobody can run; it is
 * not a source a user adds, and a declared one would only fail when the daemon tried to build it.
 */
export class WorkerSourceForkRule {
	constructor(private readonly pluginReference: WorkerSourcePluginReference) {}

	validate(declaration: WorkerSourceDeclaration): void {
		const { sourceId, provider, plugin } = declaration;
		const namesFork =
			provider === FORK_PROVIDER ||
			(plugin !== undefined && this.pluginReference.normalize(declaration).plugin === FORK_PLUGIN);
		if (namesFork) {
			throw new Error(
				`Worker source "${sourceId}": fork is the daemon's own fallback and cannot be declared as a source. ` +
					'The daemon forks a worker itself when a step has nobody to run it. ' +
					'To add capacity, declare a built-in:command source that launches "flow worker", or a built-in:inbound source for a worker you start yourself.'
			);
		}
	}
}
