import type { PluginManifest } from 'extension-points';

import { createWorktreeProvider } from './src/WorktreeWorkspaceProvider.js';

export const manifest: PluginManifest = {
	pluginId: 'worktree',
	manifestVersion: '1',
	implementations: {
		workspace: {
			default: {
				version: 1,
				provider: (options: unknown) => createWorktreeProvider(options as { baseDir: string; prefix?: string }),
			},
		},
	},
};
