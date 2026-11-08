import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowPlugin } from '../config/FlowPlugin.js';
import { PluginLoader } from '../config/PluginLoader.js';
import { FIXTURE_PLUGINS_DIR, resetWorkerTypeFixture } from '../test-utils/WorkerTypeFixture.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';
import { WorkerTypeInstances } from './WorkerTypeInstances.js';

let instances: WorkerTypeInstances;

beforeEach(() => {
	resetWorkerTypeFixture();
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

describe('WorkerTypeInstances - declared guarantees (static, read from the manifest)', () => {
	it('reads them without building an instance', async () => {
		const declared = await instances.declaredGuarantees(entry('confined'));

		expect(declared).toEqual(['env=clean', 'fs=confined', 'sandbox']);
		expect(instances.guaranteesOf(entry('confined'))).toEqual([]);
	});

	it('is empty for an implementation that declares none', async () => {
		expect(await instances.declaredGuarantees(entry('sandbox'))).toEqual([]);
	});

	it('is empty for a built-in worker type and for a source with no plugin', async () => {
		expect(await instances.declaredGuarantees(entry('default', { plugin: 'stub.default' }))).toEqual([]);
		expect(await instances.declaredGuarantees(entry('x', { plugin: undefined }))).toEqual([]);
	});

	it('fails with the source, the implementation and the fix when the declaration is malformed', async () => {
		await expect(instances.declaredGuarantees(entry('badmanifestguarantees'))).rejects.toThrow(
			/sbx.*fixture-sandbox\.badmanifestguarantees.*guarantees.*Invalid requirement/s
		);
	});
});

describe('WorkerTypeInstances - guarantees of a built instance (what routing reads)', () => {
	it('is none before the instance is built (fail-closed)', () => {
		expect(instances.guaranteesOf(entry('confined'))).toEqual([]);
	});

	it('is what the built instance declared, not what the manifest allows', async () => {
		await instances.get(entry('confined'));

		expect(instances.guaranteesOf(entry('confined'))).toEqual(['env=clean', 'fs=confined']);
	});

	it('keeps them on the instance handed to the contact for a plugin loaded from a directory', async () => {
		const instance = await instances.get(entry('confined'));

		expect(instance.guarantees).toEqual(['fs=confined', 'env=clean']);
	});

	it('is none for an instance that declared none', async () => {
		await instances.get(entry('sandbox'));

		expect(instances.guaranteesOf(entry('sandbox'))).toEqual([]);
	});

	it('refuses to build an instance that claims a guarantee its manifest does not declare', async () => {
		await expect(instances.get(entry('overclaim'))).rejects.toThrow(/net=filtered.*manifest.*guarantees/s);
		expect(instances.guaranteesOf(entry('overclaim'))).toEqual([]);
	});

	it('refuses an instance with guarantees but a manifest declaring none', async () => {
		await expect(instances.get(entry('undeclaredguarantees'))).rejects.toThrow(/fs=confined.*manifest/s);
	});

	it('refuses guarantees that are not a list of valid entries', async () => {
		await expect(instances.get(entry('badguarantees'))).rejects.toThrow(/guarantees.*list/s);
	});

	it('forgets them when the instance is disposed', async () => {
		await instances.get(entry('confined'));
		await instances.dispose('sbx');

		expect(instances.guaranteesOf(entry('confined'))).toEqual([]);
	});

	it('gives nothing to a source now declared with another plugin', async () => {
		await instances.get(entry('confined'));

		expect(instances.guaranteesOf(entry('sandbox'))).toEqual([]);
	});
});
