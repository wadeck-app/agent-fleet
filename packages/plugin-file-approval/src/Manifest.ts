import type { PluginManifest } from 'extension-points';

import { createFileApprovalProvider, parseFileApprovalOptions } from './FileApprovalProvider.js';

/**
 * The manifest itself, kept inside src so it is type-checked and testable.
 *
 * `plugin.config.ts` and `plugin.config.js` are the entry points the loader resolves; both are
 * one-line re-exports of this, so the two cannot drift apart -- which they already did once, the
 * .js twin silently dropping the configured options while the .ts one honoured them.
 */
export const manifest: PluginManifest = {
	pluginId: 'file-approval',
	manifestVersion: '1',
	implementations: {
		approval: {
			default: {
				// The loader hands over whatever `options:` the config declared. Dropping the
				// argument here made every configured dir/timeout silently ineffective.
				version: 1,
				provider: options => createFileApprovalProvider(parseFileApprovalOptions(options)),
			},
		},
	},
};
