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
}
