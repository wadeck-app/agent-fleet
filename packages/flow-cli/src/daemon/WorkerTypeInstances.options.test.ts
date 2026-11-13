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
		createdAt: '2026-11-14T00:00:00.000Z',
		...overrides,
	};
}

describe('WorkerTypeInstances - declared option names (static, read from the manifest)', () => {
	it('reads them sorted, without building an instance', async () => {
		expect(await instances.declaredOptions(entry('scoped'))).toEqual(['image', 'projects', 'region']);
		expect(fixture.created).toEqual([]);
	});

	it('reads an empty list as "no option accepted"', async () => {
		expect(await instances.declaredOptions(entry('nooptions'))).toEqual([]);
	});

	it('is undefined (no check) for an implementation that declares none', async () => {
		expect(await instances.declaredOptions(entry('confined'))).toBeUndefined();
	});

	it('is undefined for a built-in worker type and for a source with no plugin', async () => {
		expect(await instances.declaredOptions(entry('default', { plugin: 'stub.default' }))).toBeUndefined();
		expect(await instances.declaredOptions(entry('x', { plugin: undefined }))).toBeUndefined();
	});

	it('refuses a malformed declaration, naming the source, the plugin and the fix', async () => {
		await expect(instances.declaredOptions(entry('badmanifestoptions'))).rejects.toThrow(
			/sbx.*fixture-sandbox\.badmanifestoptions.*options/s
		);
	});
});
