export interface PluginManifest {
	pluginId: string;
	manifestVersion: '1';
	implementations: {
		[extensionPoint: string]: {
			[implName: string]: PluginImplementation;
		};
	};
}

export interface PluginImplementation {
	version: number;
	provider?: (options: unknown) => unknown;
	entrypoint?: string;
	export?: string;
	/**
	 * @deprecated NOT applied: nothing reads it except the loader, which warns when it is declared. Only the built-in
	 * `SENSITIVE_FIELDS` list is enforced (literal credentials refused), and a manifest can neither extend nor weaken it.
	 * Remove it; users pass secret options as `${ENV_VAR}`. To make a new name refused, add it to `SENSITIVE_FIELDS`.
	 */
	sensitiveFields?: string[];
	/**
	 * `worker-type` only: the guarantees (`key=value` or keyword entries) the workers of this implementation MAY enforce,
	 * declared statically so the daemon knows which source to ask for a worker before any instance is built, and which
	 * requirements a flow may name. It is the upper bound of the built instance's `guarantees`: an instance listing an
	 * entry that is not declared here fails to build. Absent: the implementation provides none.
	 */
	guarantees?: string[];
	/**
	 * `worker-type` only: the workspace provider kinds (as written in a flow's `workspace:`: `in-place`, `readonly`,
	 * `worktree`, `pool`) the workers of this implementation accept, declared statically so the daemon refuses at run
	 * start, before any workspace is allocated, a run that requires something only this implementation provides but uses
	 * another kind. It is the upper bound of the built instance's `workspaces`. An unknown kind makes the manifest fail
	 * to load. Absent: no restriction.
	 */
	workspaces?: string[];
	/**
	 * `worker-type` only: the NAMES of the options this implementation accepts (the `--option name=value` of `flow worker
	 * source add`), declared statically so flow refuses an unknown name when the source is declared, before any instance is
	 * built, with the nearest accepted name as a hint. Without it a misspelt `projects` would be stored and read by the core
	 * as a source that serves every project. A source already stored with an unknown name is reported by a warning in
	 * `flow worker source list` and in the daemon log; routing does not change. Names only: values stay the plugin's to
	 * validate at build time. Case sensitive, each a non-empty string without spaces or "=". `[]`: the implementation takes
	 * no option. Absent: no check (older plugins).
	 */
	options?: string[];
}
