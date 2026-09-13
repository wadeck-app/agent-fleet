import { createFileApprovalProvider } from './src/FileApprovalProvider.js';

export const manifest = {
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
