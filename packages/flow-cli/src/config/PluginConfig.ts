export interface GlobalPluginInstance {
	type: string;
	options?: Record<string, unknown>;
	pluginsDir?: string;
}

export interface GlobalPluginsConfig {
	instances?: Record<string, GlobalPluginInstance>;
}

export interface GlobalConfig {
	plugins?: GlobalPluginsConfig;
}

export interface ProjectFeatureSection {
	use?: string;
	instance?: {
		type: string;
		options?: Record<string, unknown>;
		pluginsDir?: string;
	};
	options?: Record<string, unknown>;
}

export interface ProjectPluginsConfig {
	workspace?: ProjectFeatureSection;
	tasks?: ProjectFeatureSection;
	secrets?: ProjectFeatureSection;
	approval?: ProjectFeatureSection;
	[key: string]: ProjectFeatureSection | undefined;
}

export interface ProjectConfig {
	plugins?: ProjectPluginsConfig;
}

export interface ResolvedFeature {
	type: string;
	options: Record<string, unknown>;
	pluginsDir?: string;
}

export interface ResolvedPluginsConfig {
	workspace?: ResolvedFeature;
	tasks?: ResolvedFeature;
	secrets?: ResolvedFeature;
	approval?: ResolvedFeature;
	[key: string]: ResolvedFeature | undefined;
}
