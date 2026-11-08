import { BUILTIN_WORKSPACE_PROVIDERS } from 'flow-engine';

/**
 * Reads a `workspaces` declaration of a worker-type plugin (manifest or instance): the workspace provider kinds its
 * workers accept, as written in a flow's `workspace:`.
 *
 * Only the built-in kinds can be named: a configured provider instance (`plugins.instances.<name>`) belongs to the
 * user's configuration, which a plugin manifest cannot know. Fail-closed: anything else is refused.
 */
export class WorkspaceKindList {
	/** The kinds a plugin may name. */
	static readonly KNOWN: readonly string[] = [...BUILTIN_WORKSPACE_PROVIDERS].sort();

	/**
	 * @param where the place for the message, for example `Plugin x: manifest workspaces`
	 * @returns the kinds, sorted, each once; undefined when nothing is declared (no restriction)
	 * @throws when it is not a non-empty list of known kinds. The message lists the known kinds and the fix.
	 */
	static normalise(value: unknown, where: string): string[] | undefined {
		if (value === undefined) {
			return undefined;
		}
		const known = WorkspaceKindList.KNOWN.join(', ');
		if (!Array.isArray(value)) {
			throw new Error(
				`${where} must be a list, got ${typeof value}: ${JSON.stringify(value)}. Write it as a list, for example workspaces: ["pool"]. Known kinds: ${known}.`
			);
		}
		if (value.length === 0) {
			throw new Error(
				`${where} is empty, which would accept no workspace at all. Fix: list the kinds the workers accept (${known}), or remove the field for no restriction.`
			);
		}
		for (const kind of value) {
			if (typeof kind !== 'string') {
				throw new Error(`${where} must contain only strings, got ${typeof kind}: ${JSON.stringify(kind)}.`);
			}
			if (!WorkspaceKindList.KNOWN.includes(kind)) {
				throw new Error(
					`${where} lists ${JSON.stringify(kind)}, which is not a known workspace kind. Known kinds: ${known}.`
				);
			}
		}
		return [...new Set(value as string[])].sort();
	}
}
