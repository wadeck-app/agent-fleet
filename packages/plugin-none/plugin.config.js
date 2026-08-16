import { noneWorkspaceProvider } from './src/NoneWorkspaceProvider.js';

export const manifest = {
	pluginId: 'none',
	manifestVersion: '1',
	implementations: {
		workspace: {
			default: {
				version: 1,
				provider: () => noneWorkspaceProvider,
			},
		},
	},
};
