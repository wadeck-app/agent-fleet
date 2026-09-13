import type { PluginManifest } from 'extension-points';

import { createFileApprovalProvider } from './src/FileApprovalProvider.js';

export const manifest: PluginManifest = {
	pluginId: 'file-approval',
	manifestVersion: '1',
	implementations: {
		approval: {
			default: {
				version: 1,
				provider: () => createFileApprovalProvider(),
			},
		},
	},
};
