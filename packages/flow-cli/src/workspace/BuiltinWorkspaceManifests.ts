import type { PluginManifest } from 'extension-points';

import { PoolWorkspaceProvider } from './PoolWorkspaceProvider';
import { SharedFolderWorkspaceProvider } from './SharedFolderWorkspaceProvider';

/** `plugins.in-place.default`: the project folder, shared. */
export const IN_PLACE_MANIFEST: PluginManifest = {
	pluginId: 'in-place',
	manifestVersion: '1',
	implementations: {
		workspace: {
			default: { version: 1, provider: options => new SharedFolderWorkspaceProvider('in-place', options) },
		},
	},
};

/** `plugins.readonly.default`: the project folder, shared and flagged read-only (advisory). */
export const READONLY_MANIFEST: PluginManifest = {
	pluginId: 'readonly',
	manifestVersion: '1',
	implementations: {
		workspace: {
			default: { version: 1, provider: options => new SharedFolderWorkspaceProvider('readonly', options) },
		},
	},
};

/** `plugins.pool.default`: one free slot of a pool of prepared folders; a run waits when none is free. */
export const POOL_MANIFEST: PluginManifest = {
	pluginId: 'pool',
	manifestVersion: '1',
	implementations: {
		workspace: { default: { version: 1, provider: options => new PoolWorkspaceProvider(options) } },
	},
};
