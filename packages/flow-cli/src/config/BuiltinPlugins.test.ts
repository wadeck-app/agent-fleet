import { describe, expect, it } from 'vitest';

import { BUILTIN_PLUGIN_MANIFESTS } from './BuiltinPlugins';

describe('BUILTIN_PLUGIN_MANIFESTS', () => {
	// These are the plugins the CLI is useless without: `none` is the default workspace provider,
	// and `cli-approval` is the only thing that makes a worker interactive.
	it('carries the plugins the CLI cannot function without', () => {
		expect(Object.keys(BUILTIN_PLUGIN_MANIFESTS).sort()).toEqual([
			'cli-approval',
			'file-approval',
			'none',
			'worktree',
		]);
	});

	// Imported statically so the bundler inlines them. A manifest reached through the filesystem
	// is exactly what the published single-file bundle cannot do: it has no node_modules, and the
	// plugin's own entry point imports TypeScript sources.
	it('declares the pluginId each manifest claims', () => {
		for (const [pluginId, manifest] of Object.entries(BUILTIN_PLUGIN_MANIFESTS)) {
			expect(manifest.pluginId).toBe(pluginId);
		}
	});

	it('exposes a provider factory rather than an entrypoint path', () => {
		// A path would have to be resolved on disk, which defeats the point of bundling them.
		for (const manifest of Object.values(BUILTIN_PLUGIN_MANIFESTS)) {
			for (const implementations of Object.values(manifest.implementations)) {
				for (const implementation of Object.values(implementations)) {
					expect(typeof implementation.provider).toBe('function');
					expect(implementation.entrypoint).toBeUndefined();
				}
			}
		}
	});

	it('provides the workspace point from none and the approval point from cli-approval', () => {
		expect(BUILTIN_PLUGIN_MANIFESTS['none']?.implementations['workspace']?.['default']).toBeDefined();
		expect(BUILTIN_PLUGIN_MANIFESTS['cli-approval']?.implementations['approval']?.['default']).toBeDefined();
	});

	// The TTY-free counterpart: without it a user_intervention step can only be answered by a human
	// sitting at a terminal.
	it('provides the approval point from file-approval too', () => {
		expect(BUILTIN_PLUGIN_MANIFESTS['file-approval']?.implementations['approval']?.['default']).toBeDefined();
	});
});
