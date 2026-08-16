import { createCliApprovalProvider } from './src/CliApprovalProvider.js';

export const manifest = {
	pluginId: 'cli-approval',
	manifestVersion: '1',
	implementations: {
		approval: {
			default: {
				version: 1,
				provider: () => createCliApprovalProvider(),
			},
		},
	},
};
