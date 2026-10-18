import { describe, expect, it } from 'vitest';

import { BUILTIN_PLUGIN_CATALOG } from './BuiltinPluginCatalog.js';
import { PLUGIN_CONFIGS, describePlugin, listPlugins } from './PluginCatalog.js';

describe('BUILTIN_PLUGIN_CATALOG', () => {
	it('names the four plugins flow ships, keyed by their pluginId', () => {
		expect(Object.keys(BUILTIN_PLUGIN_CATALOG).sort()).toEqual([
			'cli-approval',
			'file-approval',
			'none',
			'worktree',
		]);
		for (const [key, entry] of Object.entries(BUILTIN_PLUGIN_CATALOG)) expect(entry.pluginId).toBe(key);
	});

	it('documents exactly the plugins PLUGIN_CONFIGS has a snippet for', () => {
		expect(Object.keys(BUILTIN_PLUGIN_CATALOG).sort()).toEqual(Object.keys(PLUGIN_CONFIGS).sort());
	});

	it('declares for each plugin the extension point its snippet documents', () => {
		for (const [pluginId, config] of Object.entries(PLUGIN_CONFIGS)) {
			expect(Object.keys(BUILTIN_PLUGIN_CATALOG[pluginId]!.implementations)).toEqual([config.extensionPoint]);
		}
	});

	it('lists and describes like manifests would (the catalog functions only read ids and implementation names)', () => {
		expect(listPlugins(BUILTIN_PLUGIN_CATALOG)).toContainEqual({
			id: 'worktree',
			extensionPoint: 'workspace',
			typeString: 'plugins.worktree.default',
		});
		expect(describePlugin('file-approval', BUILTIN_PLUGIN_CATALOG).typeString).toBe(
			'plugins.file-approval.default'
		);
	});
});
