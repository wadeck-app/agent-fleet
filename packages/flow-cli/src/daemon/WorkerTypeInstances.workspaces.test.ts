import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowPlugin } from '../config/FlowPlugin.js';
import { PluginLoader } from '../config/PluginLoader.js';
import { FIXTURE_PLUGINS_DIR, resetWorkerTypeFixture } from '../test-utils/WorkerTypeFixture.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';
import { WorkerTypeInstances } from './WorkerTypeInstances.js';

let instances: WorkerTypeInstances;
let fixture: ReturnType<typeof resetWorkerTypeFixture>;

beforeEach(() => {
	fixture = resetWorkerTypeFixture();
	instances = new WorkerTypeInstances(
		new PluginLoader(),
		() => {},
		{},
		ref => (ref === 'plugins.stub.default' ? ({} as FlowPlugin) : undefined)
	);
});

function entry(implementation: string, overrides: Partial<WorkerSourceEntry> = {}): WorkerSourceEntry {
	return {
		sourceId: 'sbx',
		provider: 'fixture',
		plugin: `fixture-sandbox.${implementation}`,
		pluginsDir: FIXTURE_PLUGINS_DIR,
		labels: [],
		maxWorkers: 1,
		tokenHash: 'h',
		createdAt: '2026-11-08T00:00:00.000Z',
		...overrides,
	};
}

describe('WorkerTypeInstances - declared workspace kinds (static, read from the manifest)', () => {
	it('reads them without building an instance', async () => {
		expect(await instances.declaredWorkspaces(entry('poolonly'))).toEqual(['pool']);
		expect(fixture.created).toEqual([]);
	});

	it('is undefined (no restriction) for an implementation that declares none', async () => {
		expect(await instances.declaredWorkspaces(entry('confined'))).toBeUndefined();
	});

	it('is undefined for a built-in worker type and for a source with no plugin', async () => {
		expect(await instances.declaredWorkspaces(entry('default', { plugin: 'stub.default' }))).toBeUndefined();
		expect(await instances.declaredWorkspaces(entry('x', { plugin: undefined }))).toBeUndefined();
	});

	it('refuses an unknown kind when the manifest loads, naming the source, the plugin and the known kinds', async () => {
		await expect(instances.declaredWorkspaces(entry('badmanifestworkspace'))).rejects.toThrow(
			/sbx.*fixture-sandbox\.badmanifestworkspace.*"poool".*in-place, pool, readonly, worktree/s
		);
	});

	it('refuses an empty list', async () => {
		await expect(instances.declaredWorkspaces(entry('emptymanifestworkspaces'))).rejects.toThrow(/empty/);
	});
});

describe('WorkerTypeInstances - workspace kinds of a built instance (what routing reads)', () => {
	it('accepts nothing before the instance is built (fail-closed)', () => {
		expect(instances.workspacesOf(entry('poolonly'))).toEqual([]);
	});

	it('is the manifest list when the instance declares none of its own', async () => {
		await instances.get(entry('poolonly'));

		expect(instances.workspacesOf(entry('poolonly'))).toEqual(['pool']);
	});

	it('is undefined (no restriction) once built when neither the manifest nor the instance restricts', async () => {
		await instances.get(entry('confined'));

		expect(instances.workspacesOf(entry('confined'))).toBeUndefined();
	});

	it('is the narrower list of the instance', async () => {
		await instances.get(entry('poolnarrowed'));

		expect(instances.workspacesOf(entry('poolnarrowed'))).toEqual(['pool']);
	});

	it('lets an instance restrict itself when the manifest does not', async () => {
		await instances.get(entry('unrestrictednarrowed'));

		expect(instances.workspacesOf(entry('unrestrictednarrowed'))).toEqual(['readonly']);
	});

	it('keeps them on the instance handed to the contact for a plugin loaded from a directory', async () => {
		expect((await instances.get(entry('poolnarrowed'))).workspaces).toEqual(['pool']);
	});

	it('refuses to build an instance that accepts a kind its manifest does not list', async () => {
		await expect(instances.get(entry('workspaceoverclaim'))).rejects.toThrow(
			/"worktree".*manifest does not declare.*declared: pool/s
		);
		expect(instances.workspacesOf(entry('workspaceoverclaim'))).toEqual([]);
	});

	it('refuses an instance listing an unknown kind', async () => {
		await expect(instances.get(entry('badinstanceworkspace'))).rejects.toThrow(
			/"poool".*in-place, pool, readonly, worktree/s
		);
	});

	it('forgets them when the instance is disposed, and gives nothing to a source declared with another plugin', async () => {
		await instances.get(entry('poolonly'));
		expect(instances.workspacesOf(entry('confined'))).toEqual([]);

		await instances.dispose('sbx');
		expect(instances.workspacesOf(entry('poolonly'))).toEqual([]);
	});

	it('does not restrict a source with no plugin', () => {
		expect(instances.workspacesOf(entry('x', { plugin: undefined }))).toBeUndefined();
	});
});
