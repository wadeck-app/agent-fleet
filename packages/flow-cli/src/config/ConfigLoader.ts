import { SENSITIVE_FIELDS } from 'extension-points';
import { load as parseYaml } from 'js-yaml';
import { readFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

import { flowConfigDir } from './FlowConfigDir.js';
import { launchProjectConfig } from './LaunchProjectConfig.js';
import type {
	GlobalConfig,
	ProjectConfig,
	ProjectFeatureSection,
	ResolvedFeature,
	ResolvedPluginsConfig,
} from './PluginConfig.js';
import { validateGlobalConfigLayer, validateProjectConfigLayer } from './ProjectFlowConfig.js';

const SENSITIVE_FIELD_SET = new Set(SENSITIVE_FIELDS);

interface ConfigLoaderOptions {
	globalConfigPath?: string;
	projectConfigPath?: string;
}

function resolveEnvVars(options: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(options)) {
		if (typeof value === 'string') {
			const interpolated = value.replace(/\$\{([^}]+)\}/g, (_match, varName: string) => {
				const envValue = process.env[varName];
				if (envValue === undefined) {
					throw new Error(`Environment variable "${varName}" is not set (referenced as \${${varName}})`);
				}
				return envValue;
			});
			result[key] = interpolated;
		} else {
			result[key] = value;
		}
	}
	return result;
}

function validateNoLiteralCredentials(options: Record<string, unknown>, context: string): void {
	for (const [key, value] of Object.entries(options)) {
		if (SENSITIVE_FIELD_SET.has(key) && typeof value === 'string') {
			const isEnvVar = /^\$\{[^}]+\}$/.test(value);
			if (!isEnvVar) {
				throw new Error(
					`Literal credential value in ${context}: sensitive field "${key}" must use \${ENV_VAR} interpolation, not a literal value`
				);
			}
		}
	}
}

function loadYamlFile<T>(filePath: string): T | null {
	let content: string;
	try {
		content = readFileSync(filePath, 'utf8');
	} catch (err: unknown) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code === 'ENOENT' || code === 'ENOTDIR') {
			return null;
		}
		throw err;
	}
	try {
		return parseYaml(content) as T;
	} catch (err: unknown) {
		const message = normalizeError(err).message;
		throw new Error(`Failed to parse YAML config at "${filePath}": ${message}`);
	}
}

export class ConfigLoader {
	private globalConfigPath: string;
	private projectConfigPathOverride: string | undefined;
	private envVarOverride: string | undefined;

	constructor(options: ConfigLoaderOptions = {}) {
		this.envVarOverride = process.env['FLOW_CONFIG'];
		this.globalConfigPath = options.globalConfigPath ?? join(flowConfigDir(), 'config.yml');
		// Resolved lazily: the project comes from the registry, which must not be read (nor fail)
		// merely because a ConfigLoader was constructed.
		this.projectConfigPathOverride = options.projectConfigPath;
	}

	async load(): Promise<ResolvedPluginsConfig> {
		const globalConfig = await this.loadGlobalConfig();
		const projectConfig = this.loadProjectConfig();
		return this.merge(globalConfig, projectConfig);
	}

	private async loadGlobalConfig(): Promise<GlobalConfig> {
		// If FLOW_CONFIG is set, the file MUST exist - no fallback
		if (this.envVarOverride) {
			const exists = await access(this.envVarOverride)
				.then(() => true)
				.catch(() => false);
			if (!exists) {
				throw new Error(`FLOW_CONFIG is set to "${this.envVarOverride}" but the file was not found`);
			}
			const config = loadYamlFile<GlobalConfig>(this.envVarOverride);
			validateGlobalConfigLayer(this.envVarOverride, config ?? {});
			this.validateGlobalConfig(config ?? {});
			return config ?? {};
		}

		const config = loadYamlFile<GlobalConfig>(this.globalConfigPath);
		validateGlobalConfigLayer(this.globalConfigPath, config ?? {});
		this.validateGlobalConfig(config ?? {});
		return config ?? {};
	}

	private validateGlobalConfig(config: GlobalConfig): void {
		const instances = config.plugins?.instances ?? {};
		for (const [instanceName, instance] of Object.entries(instances)) {
			if (instance.options) {
				validateNoLiteralCredentials(instance.options, `global.instances.${instanceName}.options`);
			}
		}
	}

	/**
	 * The project config: the file given to the constructor, else the config of the registered project containing the
	 * working directory (`FLOW_PROJECT` > cwd), read from the project registry. Empty when the working directory belongs
	 * to no project (the reason is reported on stderr; a config that declares plugins in an unregistered folder is an
	 * error, see launchProjectConfig). Keys that are not allowed in a project config are errors naming the file.
	 */
	private loadProjectConfig(): ProjectConfig {
		if (this.projectConfigPathOverride !== undefined) {
			const config = loadYamlFile<ProjectConfig>(this.projectConfigPathOverride) ?? {};
			validateProjectConfigLayer(this.projectConfigPathOverride, config);
			return config;
		}
		return (launchProjectConfig(process.cwd())?.values ?? {}) as ProjectConfig;
	}

	private merge(global: GlobalConfig, project: ProjectConfig): ResolvedPluginsConfig {
		const result: ResolvedPluginsConfig = {};
		const projectPlugins = project.plugins ?? {};

		for (const [feature, projectSection] of Object.entries(projectPlugins)) {
			if (!projectSection) {
				continue;
			}
			const resolved = this.resolveFeature(feature, projectSection as ProjectFeatureSection, global);
			result[feature] = resolved;
		}

		return result;
	}

	/** Resolves a standalone feature section against the global config (for per-flow overrides). */
	async resolveStandaloneSection(featureName: string, section: ProjectFeatureSection): Promise<ResolvedFeature> {
		const globalConfig = await this.loadGlobalConfig();
		return this.resolveFeature(featureName, section, globalConfig);
	}

	private resolveFeature(featureName: string, section: ProjectFeatureSection, global: GlobalConfig): ResolvedFeature {
		const hasUse = section.use !== undefined;
		const hasInstance = section.instance !== undefined;

		if (hasUse && hasInstance) {
			throw new Error(
				`Plugin config error for "${featureName}": both "use" and "instance" are present - they are mutually exclusive`
			);
		}

		const sectionOptions = section.options ?? {};
		validateNoLiteralCredentials(sectionOptions, `${featureName}.options`);
		const resolvedSectionOptions = resolveEnvVars(sectionOptions);

		if (hasUse) {
			const instanceName = section.use!;
			const instances = global.plugins?.instances ?? {};
			const globalInstance = instances[instanceName];
			if (!globalInstance) {
				throw new Error(
					`Plugin config error for "${featureName}": instance "${instanceName}" not found in global config`
				);
			}

			const instanceOptions = globalInstance.options ?? {};
			validateNoLiteralCredentials(instanceOptions, `global.instances.${instanceName}.options`);
			const resolvedInstanceOptions = resolveEnvVars(instanceOptions);

			return {
				type: globalInstance.type,
				// Shallow merge: section-level options override instance options
				options: { ...resolvedInstanceOptions, ...resolvedSectionOptions },
				pluginsDir: globalInstance.pluginsDir,
			};
		}

		if (hasInstance) {
			const inlineInstance = section.instance!;
			const instanceOptions = inlineInstance.options ?? {};
			validateNoLiteralCredentials(instanceOptions, `${featureName}.instance.options`);
			const resolvedInstanceOptions = resolveEnvVars(instanceOptions);

			return {
				type: inlineInstance.type,
				options: { ...resolvedInstanceOptions, ...resolvedSectionOptions },
				pluginsDir: inlineInstance.pluginsDir,
			};
		}

		throw new Error(`Plugin config error for "${featureName}": neither "use" nor "instance" is present`);
	}
}
