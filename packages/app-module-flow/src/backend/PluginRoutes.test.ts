import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { BUILTIN_PLUGIN_CATALOG, FlowQueryService } from 'flow-core';
import { callRoute, collectRoutes } from 'flow-core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { registerPluginRoutes } from './PluginRoutes.js';

let routes: ReturnType<typeof collectRoutes>['routes'];

beforeEach(() => {
	const collected = collectRoutes<ModuleContext>();
	routes = collected.routes;
	registerPluginRoutes(collected.ctx, FlowQueryService.forConfigDir('/unused', BUILTIN_PLUGIN_CATALOG));
});

describe('built-in plugin catalog', () => {
	it('is the four plugins the flow CLI ships (flow-cli pins it to the real manifests)', () => {
		expect(Object.keys(BUILTIN_PLUGIN_CATALOG).sort()).toEqual([
			'cli-approval',
			'file-approval',
			'none',
			'worktree',
		]);
	});
});

describe('GET /plugins', () => {
	it('lists every implementation with its type string', async () => {
		const { status, body } = await callRoute(routes, 'GET /plugins');
		expect(status).toBe(200);
		expect((body as { plugins: unknown[] }).plugins).toEqual(
			expect.arrayContaining([
				{ id: 'none', extensionPoint: 'workspace', typeString: 'plugins.none.default' },
				{ id: 'worktree', extensionPoint: 'workspace', typeString: 'plugins.worktree.default' },
			])
		);
	});
});

describe('GET /plugins/:id', () => {
	it('describes the plugin with its config snippet and options', async () => {
		const { status, body } = await callRoute(routes, 'GET /plugins/:id', { params: { id: 'worktree' } });
		expect(status).toBe(200);
		expect(body).toMatchObject({
			id: 'worktree',
			extensionPoint: 'workspace',
			typeString: 'plugins.worktree.default',
		});
		expect((body as { options: Record<string, string> }).options).toHaveProperty('baseDir');
	});

	it('also lists the options as rows (name, description), because a DSL table renders arrays, not objects', async () => {
		const { body } = await callRoute(routes, 'GET /plugins/:id', { params: { id: 'worktree' } });
		const { options, optionRows } = body as { options: Record<string, string>; optionRows: unknown[] };
		expect(optionRows).toEqual(Object.entries(options).map(([name, description]) => ({ name, description })));
		expect(optionRows.length).toBeGreaterThan(0);
	});

	it('answers an empty optionRows for a plugin without options', async () => {
		const { body } = await callRoute(routes, 'GET /plugins/:id', { params: { id: 'none' } });
		expect((body as { optionRows: unknown[] }).optionRows).toEqual([]);
	});

	it('answers 404 with the CLI hint for an unknown plugin', async () => {
		const { status, body } = await callRoute(routes, 'GET /plugins/:id', { params: { id: 'nope' } });
		expect(status).toBe(404);
		expect((body as { error: string }).error).toContain("unknown plugin 'nope'");
	});

	it('answers 500 saying what is missing when the service has no manifests (configuration error, never an empty list)', async () => {
		const collected = collectRoutes<ModuleContext>();
		registerPluginRoutes(collected.ctx, FlowQueryService.forConfigDir('/unused'));
		const { status, body } = await callRoute(collected.routes, 'GET /plugins');
		expect(status).toBe(500);
		expect((body as { error: string }).error).toContain('No plugin manifests configured');
	});
});
