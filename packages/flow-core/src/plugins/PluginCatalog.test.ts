import type { PluginManifest } from 'extension-points';
import { describe, expect, it } from 'vitest';

import { PLUGIN_CONFIGS, UnknownPluginError, describePlugin, formatPluginTable, listPlugins } from './PluginCatalog.js';

const manifest = (pluginId: string, implementations: Record<string, string[]>): PluginManifest =>
	({
		pluginId,
		manifestVersion: '1',
		implementations: Object.fromEntries(
			Object.entries(implementations).map(([point, names]) => [
				point,
				Object.fromEntries(names.map(name => [name, { version: 1 }])),
			])
		),
	}) as PluginManifest;

const manifests = {
	none: manifest('none', { workspace: ['default'] }),
	'file-approval': manifest('file-approval', { approval: ['default'] }),
};

describe('listPlugins', () => {
	it('lists one entry per extension point implementation with its type string', () => {
		expect(listPlugins(manifests)).toEqual([
			{ id: 'none', extensionPoint: 'workspace', typeString: 'plugins.none.default' },
			{ id: 'file-approval', extensionPoint: 'approval', typeString: 'plugins.file-approval.default' },
		]);
	});

	it('lists a plugin once per implementation', () => {
		const multi = { x: manifest('x', { workspace: ['a', 'b'] }) };
		expect(listPlugins(multi).map(e => e.typeString)).toEqual(['plugins.x.a', 'plugins.x.b']);
	});

	it('is empty without manifests', () => {
		expect(listPlugins({})).toEqual([]);
	});
});

describe('formatPluginTable', () => {
	it('renders an aligned header and one row per entry', () => {
		const lines = formatPluginTable(listPlugins(manifests)).split('\n');
		expect(lines[0]).toBe('ID'.padEnd(18) + 'EXTENSION'.padEnd(14) + 'TYPE STRING');
		expect(lines[1]).toBe('none'.padEnd(18) + 'workspace'.padEnd(14) + 'plugins.none.default');
		expect(lines).toHaveLength(3);
	});
});

describe('describePlugin', () => {
	it('returns the config snippet, options and type string of a known plugin', () => {
		const result = describePlugin('file-approval', manifests);
		expect(result.id).toBe('file-approval');
		expect(result.extensionPoint).toBe('approval');
		expect(result.typeString).toBe('plugins.file-approval.default');
		expect(result.snippet).toContain('request.json');
		expect(Object.keys(result.options).length).toBeGreaterThan(0);
	});

	it('falls back to the default type string when the plugin is not in the manifests', () => {
		expect(describePlugin('worktree', {}).typeString).toBe('plugins.worktree.default');
	});

	it('fails with the list command as the next step for an unknown plugin', () => {
		const error = (() => {
			try {
				describePlugin('nope', manifests);
			} catch (err) {
				return err;
			}
			throw new Error('expected a throw');
		})();
		expect(error).toBeInstanceOf(UnknownPluginError);
		expect(error).toMatchObject({ kind: 'unknown-plugin' });
		expect((error as Error).message).toContain("unknown plugin 'nope'");
		expect((error as Error).message).toContain('flow plugins list');
	});
});

describe('PLUGIN_CONFIGS', () => {
	it('documents the four built-in plugins', () => {
		expect(Object.keys(PLUGIN_CONFIGS).sort()).toEqual(['cli-approval', 'file-approval', 'none', 'worktree']);
	});
});
