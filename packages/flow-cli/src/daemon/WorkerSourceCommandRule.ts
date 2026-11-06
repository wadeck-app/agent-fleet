import type { WorkerSourcePluginReference } from './WorkerSourcePluginReference.js';
import type { WorkerSourceDeclaration } from './WorkerSourceRegistry.js';

const BUILT_IN_COMMAND = 'built-in:command';
const COMMAND_PLUGIN = 'command.default';

/**
 * Checks a command source can actually produce a worker, at declaration time.
 *
 * Without this the entry was accepted and only failed later, inside the daemon, when a step needed capacity --
 * reported on the daemon's stderr, where the person who declared the source is not looking. The reverse case is refused
 * for the same reason: a command attached to a source that never runs one is configuration that looks applied and is not.
 *
 * A source runs a command when its provider is `built-in:command` or its plugin is the built-in `command.default`.
 */
export class WorkerSourceCommandRule {
	constructor(private readonly pluginReference: WorkerSourcePluginReference) {}

	validate(declaration: WorkerSourceDeclaration): void {
		const command = declaration.options?.command;
		const kind = this.commandKindOf(declaration);

		if (kind !== undefined && (typeof command !== 'string' || command.trim() === '')) {
			throw new Error(
				`Worker source "${declaration.sourceId}" uses ${kind} but declares no command to run. ` +
					'Pass --command "<how to launch a worker>", e.g. --command "flow worker --source ' +
					`${declaration.sourceId} --token <worker token>".`
			);
		}
		if (kind === undefined && command !== undefined) {
			throw new Error(
				`Worker source "${declaration.sourceId}" declares a command, but provider "${declaration.provider}" never runs one. ` +
					'Use --provider built-in:command to have the daemon launch a worker itself.'
			);
		}
	}

	/** What the source is called in messages when it runs a command; undefined when it does not. */
	private commandKindOf(declaration: WorkerSourceDeclaration): string | undefined {
		if (declaration.provider === BUILT_IN_COMMAND) {
			return BUILT_IN_COMMAND;
		}
		const { plugin } = declaration;
		return plugin !== undefined && this.pluginReference.normalize(declaration).plugin === COMMAND_PLUGIN
			? COMMAND_PLUGIN
			: undefined;
	}
}
