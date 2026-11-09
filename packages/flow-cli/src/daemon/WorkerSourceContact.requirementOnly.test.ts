import { beforeEach, describe, expect, it } from 'vitest';

import { PluginLoader } from '../config/PluginLoader.js';
import {
	FIXTURE_PLUGINS_DIR,
	type WorkerTypeFixtureState,
	resetWorkerTypeFixture,
} from '../test-utils/WorkerTypeFixture.js';
import { contactDeclaredSources } from './WorkerSourceContact.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';
import { WorkerTypeInstances } from './WorkerTypeInstances.js';

let fixture: WorkerTypeFixtureState;
let workerTypes: WorkerTypeInstances;

beforeEach(() => {
	fixture = resetWorkerTypeFixture();
	workerTypes = new WorkerTypeInstances(new PluginLoader(), () => {});
});

const pluginEntry = (sourceId: string, implementation: string): WorkerSourceEntry => ({
	sourceId,
	provider: 'fixture',
	plugin: `fixture-sandbox.${implementation}`,
	pluginsDir: FIXTURE_PLUGINS_DIR,
	labels: [],
	maxWorkers: 1,
	tokenHash: 'x',
	createdAt: '2026-11-09T00:00:00.000Z',
});

describe('contactDeclaredSources - demand for no requirement', () => {
	it('builds a source that declares guarantees but does not ask it for a worker', async () => {
		await contactDeclaredSources([pluginEntry('guarded', 'confined')], 'ws://127.0.0.1:1', () => {}, {
			issueLaunchToken: () => 'minted',
			workerTypes,
			skipRequirementOnly: true,
		});

		expect(fixture.created.map(created => created.sourceId)).toEqual(['guarded']);
		expect(fixture.obtained).toEqual([]);
	});

	it('still asks a source that declares no guarantees', async () => {
		await contactDeclaredSources([pluginEntry('plain', 'sandbox')], 'ws://127.0.0.1:1', () => {}, {
			issueLaunchToken: () => 'minted',
			workerTypes,
			skipRequirementOnly: true,
		});

		expect(fixture.obtained.map(obtained => obtained.sourceId)).toEqual(['plain']);
	});

	it('asks a guarantee-declaring source when the demand is not "no requirement"', async () => {
		await contactDeclaredSources([pluginEntry('guarded', 'confined')], 'ws://127.0.0.1:1', () => {}, {
			issueLaunchToken: () => 'minted',
			workerTypes,
			skipRequirementOnly: false,
		});

		expect(fixture.obtained.map(obtained => obtained.sourceId)).toEqual(['guarded']);
	});
});
