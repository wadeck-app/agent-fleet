import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowPlugin } from '../config/FlowPlugin.js';
import { PluginLoader } from '../config/PluginLoader.js';
import {
	FIXTURE_PLUGINS_DIR,
	type WorkerTypeFixtureState,
	resetWorkerTypeFixture,
} from '../test-utils/WorkerTypeFixture.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';
import { WorkerTypeInstances } from './WorkerTypeInstances.js';

let fixture: WorkerTypeFixtureState;
let instances: WorkerTypeInstances;

beforeEach(() => {
	fixture = resetWorkerTypeFixture();
	// A built-in is only a name here: exclusivity is never asked of its code before its instance exists.
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
		createdAt: '2026-10-27T00:00:00.000Z',
		...overrides,
	};
}

describe('WorkerTypeInstances - exclusive worker types', () => {
	it('knows a type is exclusive once its instance declared exclusive: true', async () => {
		await instances.get(entry('exclusive'));

		expect(instances.isRequirementOnly(entry('exclusive'))).toBe(true);
	});

	it('knows a type is not exclusive once its instance omitted the flag', async () => {
		await instances.get(entry('sandbox'));

		expect(instances.isRequirementOnly(entry('sandbox'))).toBe(false);
	});

	it('keeps the flag on the instance handed to the contact for a plugin loaded from a directory', async () => {
		const instance = await instances.get(entry('exclusive'));

		expect(instance.exclusive).toBe(true);
	});

	// Fail-closed: not knowing is not a reason to let an unbound run reach a worker that may be sandboxed.
	it('treats a plugin from a directory as exclusive until its instance is built', () => {
		expect(instances.isRequirementOnly(entry('sandbox'))).toBe(true);
	});

	it('treats a plugin whose build failed as exclusive, and keeps doing so', async () => {
		await instances.get(entry('throws')).catch(() => undefined);

		expect(instances.isRequirementOnly(entry('throws'))).toBe(true);
	});

	it('refuses an instance whose exclusive flag is not a boolean, naming the source', async () => {
		await expect(instances.get(entry('badexclusive'))).rejects.toThrow(/sbx.*exclusive/s);
		expect(instances.isRequirementOnly(entry('badexclusive'))).toBe(true);
	});

	it('forgets what it knew when the instance is disposed: the type is unknown again, so exclusive', async () => {
		await instances.get(entry('sandbox'));
		await instances.dispose('sbx');

		expect(instances.isRequirementOnly(entry('sandbox'))).toBe(true);
	});

	it('does not carry the answer of one plugin over to the same source declared with another plugin', async () => {
		await instances.get(entry('sandbox'));

		expect(instances.isRequirementOnly(entry('exclusive'))).toBe(true);
	});

	it('answers per source: one exclusive source does not make its sibling exclusive', async () => {
		await instances.get(entry('exclusive', { sourceId: 'a' }));
		await instances.get(entry('sandbox', { sourceId: 'b' }));

		expect([
			instances.isRequirementOnly(entry('exclusive', { sourceId: 'a' })),
			instances.isRequirementOnly(entry('sandbox', { sourceId: 'b' })),
		]).toEqual([true, false]);
		expect(fixture.created).toHaveLength(2);
	});

	it('never makes a source without a plugin exclusive', () => {
		const { plugin: _plugin, pluginsDir: _pluginsDir, ...bare } = entry('sandbox');

		expect(instances.isRequirementOnly(bare)).toBe(false);
	});

	it('does not make a built-in exclusive just because its instance is not built yet', () => {
		expect(instances.isRequirementOnly(entry('default', { plugin: 'stub.default', pluginsDir: undefined }))).toBe(
			false
		);
	});
});
