import type { ApprovalProvider, WorkspaceProvider } from 'extension-points';

import { ConfigLoader } from './ConfigLoader.js';
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

export async function resolvePlugins(options: PluginResolverOptions = {}): Promise<ResolvedProviders> {
	const configLoader = new ConfigLoader({
		globalConfigPath: options.globalConfigPath,
		projectConfigPath: options.projectConfigPath,
	});
	const pluginLoader = new PluginLoader({
		pluginPackagesDir: options.pluginPackagesDir,
		registryPath: options.registryPath,
	});

	const config = await configLoader.load();
	const result: ResolvedProviders = {};

	// Workspace is required - no implicit fallback (spec P-4)
	if (!config.workspace) {
		throw new Error('No workspace provider configured. Add a plugins.workspace section to .flow/config.yml');
	}
	if (!config.workspace.type) {
		throw new Error('workspace.type is required in config. Expected format: plugins.<pluginId>.<implName>');
	}

	result.workspaceProvider = (await pluginLoader.loadProvider(
		config.workspace.type,
		'workspace',
		config.workspace.options ?? {}
	)) as WorkspaceProvider;

	if (config.approval) {
		result.approvalProvider = (await pluginLoader.loadProvider(
			config.approval.type,
			'approval',
			config.approval.options ?? {}
		)) as ApprovalProvider;
	}

	return result;
}
