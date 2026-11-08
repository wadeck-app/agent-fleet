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
}
