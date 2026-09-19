import type { ApprovalProvider, WorkspaceProvider } from 'extension-points';
import type { FlowPluginOverrides } from 'flow-engine';

import { ConfigLoader } from './ConfigLoader.js';
import type { ProjectFeatureSection } from './PluginConfig.js';
import { PluginLoader } from './PluginLoader.js';

export { releaseWorkspace } from 'extension-points';

interface PluginResolverOptions {
	globalConfigPath?: string;
	projectConfigPath?: string;
	pluginPackagesDir?: string;
	registryPath?: string;
}

export interface ResolvedProviders {
	workspaceProvider?: WorkspaceProvider;
	approvalProvider?: ApprovalProvider;
}

export class PluginResolver {
	private readonly configLoader: ConfigLoader;
	private readonly pluginLoader: PluginLoader;

	private constructor(options: PluginResolverOptions = {}) {
		this.configLoader = new ConfigLoader({
			globalConfigPath: options.globalConfigPath,
			projectConfigPath: options.projectConfigPath,
		});
		this.pluginLoader = new PluginLoader({
			pluginPackagesDir: options.pluginPackagesDir,
			registryPath: options.registryPath,
		});
	}

	static create(options: PluginResolverOptions = {}): PluginResolver {
		return new PluginResolver(options);
	}

	/**
	 * Creates a callback that resolves a per-flow workspace provider from a flow's plugins.workspace section.
	 * The callback validates credentials and loads the provider via PluginLoader.
	 */
	async createPerFlowWorkspaceResolver(): Promise<
		(section: NonNullable<FlowPluginOverrides['workspace']>) => Promise<WorkspaceProvider>
	> {
		const { configLoader, pluginLoader } = this;
		return async (section: NonNullable<FlowPluginOverrides['workspace']>) => {
			const resolved = await configLoader.resolveStandaloneSection('workspace', section as ProjectFeatureSection);
			return pluginLoader.loadProvider(
				resolved.type,
				'workspace',
				resolved.options ?? {},
				resolved.pluginsDir
			) as Promise<WorkspaceProvider>;
		};
	}

	/**
	 * Builds only the approval provider, for a worker (D#35).
	 *
	 * Separate from {@link resolveAll} because a worker must not need a workspace provider:
	 * allocating a workspace is the daemon's job, and requiring one here would stop a
	 * machine that only runs workers from running one at all.
	 *
	 * This exists because a provider object cannot cross a process boundary -- only its
	 * construction can be relocated. `plugin-cli-approval` reads its *own* `process.stdin`,
	 * so it has to be built in the process that has the human in front of it (D#34).
	 *
	 * @returns undefined when no approval plugin is configured, which is normal -- a worker
	 *          that serves no interactive step needs none.
	 * @throws when a plugin *is* configured and cannot be loaded. Continuing without it
	 *         would surface much later as a `user_intervention` step failing for a reason
	 *         unrelated to what actually broke.
	 */
	async resolveApproval(): Promise<ApprovalProvider | undefined> {
		const config = await this.configLoader.load();
		if (!config.approval) return undefined;
		if (!config.approval.type) {
			throw new Error('approval.type is required in config. Expected format: plugins.<pluginId>.<implName>');
		}

		return (await this.pluginLoader.loadProvider(
			config.approval.type,
			'approval',
			config.approval.options ?? {},
			config.approval.pluginsDir
		)) as ApprovalProvider;
	}

	/**
	 * Loads an approval provider by its type string, bypassing config.
	 *
	 * Used by `flow worker` to load the TTY fallback (`plugins.cli-approval.default`) when
	 * no approval plugin is configured and the worker is running in an interactive terminal.
	 */
	async resolveApprovalByType(type: string, options: Record<string, unknown> = {}): Promise<ApprovalProvider> {
		return (await this.pluginLoader.loadProvider(type, 'approval', options, undefined)) as ApprovalProvider;
	}

	async resolveAll(): Promise<ResolvedProviders> {
		const config = await this.configLoader.load();
		const result: ResolvedProviders = {};

		// Workspace is required - no implicit fallback (spec P-4)
		if (!config.workspace) {
			throw new Error('No workspace provider configured. Add a plugins.workspace section to .flow/config.yml');
		}
		if (!config.workspace.type) {
			throw new Error('workspace.type is required in config. Expected format: plugins.<pluginId>.<implName>');
		}

		result.workspaceProvider = (await this.pluginLoader.loadProvider(
			config.workspace.type,
			'workspace',
			config.workspace.options ?? {},
			config.workspace.pluginsDir
		)) as WorkspaceProvider;

		if (config.approval) {
			result.approvalProvider = (await this.pluginLoader.loadProvider(
				config.approval.type,
				'approval',
				config.approval.options ?? {},
				config.approval.pluginsDir
			)) as ApprovalProvider;
		}

		return result;
	}
}
