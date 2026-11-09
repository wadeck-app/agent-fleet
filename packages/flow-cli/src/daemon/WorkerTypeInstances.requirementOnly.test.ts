import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowPlugin } from '../config/FlowPlugin.js';
import { PluginLoader } from '../config/PluginLoader.js';
import { FIXTURE_PLUGINS_DIR, resetWorkerTypeFixture } from '../test-utils/WorkerTypeFixture.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';
import { WorkerTypeInstances } from './WorkerTypeInstances.js';

let instances: WorkerTypeInstances;
let logged: { level: string; message: string }[];

beforeEach(() => {
	resetWorkerTypeFixture();
	logged = [];
	instances = new WorkerTypeInstances(
		new PluginLoader(),
		(level, message) => logged.push({ level, message }),
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
		createdAt: '2026-11-09T00:00:00.000Z',
		...overrides,
	};
}

describe('WorkerTypeInstances - a source that declares guarantees is requirement-only', () => {
	it('is requirement-only once built with guarantees, although it never said exclusive', async () => {
		await instances.get(entry('confined'));

		expect(instances.isRequirementOnly(entry('confined'))).toBe(true);
	});

	it('stays requirement-only when it also says exclusive: true, and says exclusive is deprecated', async () => {
		await instances.get(entry('exclusiveconfined'));

		expect(instances.isRequirementOnly(entry('exclusiveconfined'))).toBe(true);
		expect(logged.filter(line => /deprecated/.test(line.message)).map(line => line.message)).toEqual([
			expect.stringMatching(/sbx.*exclusive.*deprecated.*guarantees/s),
		]);
	});

	it('is not requirement-only when it declares no guarantees and no exclusive', async () => {
		await instances.get(entry('sandbox'));

		expect(instances.isRequirementOnly(entry('sandbox'))).toBe(false);
		expect(logged.filter(line => line.level === 'error')).toEqual([]);
	});
});

describe('WorkerTypeInstances - exclusive: true without guarantees', () => {
	it('stays requirement-only and warns the source can never receive work, naming what to declare', async () => {
		await instances.get(entry('exclusive'));

		expect(instances.isRequirementOnly(entry('exclusive'))).toBe(true);
		const warnings = logged.filter(line => line.level === 'error').map(line => line.message);
		expect(warnings).toEqual([expect.stringMatching(/sbx.*never receive.*guarantees/s)]);
	});
});
