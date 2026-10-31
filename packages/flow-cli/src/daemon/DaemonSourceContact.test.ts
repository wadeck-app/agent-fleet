import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PluginLoader } from '../config/PluginLoader.js';
import {
	FIXTURE_PLUGINS_DIR,
	type WorkerTypeFixtureState,
	resetWorkerTypeFixture,
} from '../test-utils/WorkerTypeFixture.js';
import { DaemonSourceContact } from './DaemonSourceContact.js';
import { LaunchTokenIssuer } from './LaunchTokenIssuer.js';
import { RelayRegistry } from './RelayRegistry.js';
import { WorkerSourceRegistry } from './WorkerSourceRegistry.js';
import { WorkerTypeInstances } from './WorkerTypeInstances.js';

let dir: string;
let fixture: WorkerTypeFixtureState;
let registry: WorkerSourceRegistry;
let contact: DaemonSourceContact;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'daemon-source-contact-'));
	fixture = resetWorkerTypeFixture();
	registry = new WorkerSourceRegistry(dir);
	contact = new DaemonSourceContact(
		join(dir, 'logs'),
		registry,
		new RelayRegistry(registry),
		new LaunchTokenIssuer(),
		new WorkerTypeInstances(new PluginLoader(), () => {})
	);
	vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
	vi.restoreAllMocks();
	rmSync(dir, { recursive: true, force: true });
});

const declarePlugin = (sourceId: string): void => {
	registry.declare({
		sourceId,
		provider: 'fixture',
		plugin: 'fixture-sandbox.sandbox',
		pluginsDir: FIXTURE_PLUGINS_DIR,
		labels: [],
		maxWorkers: 1,
	});
};

/** The daemon endpoint each obtained worker was asked to register with, in the order they were obtained. */
const endpointsObtained = (): string[] =>
	fixture.obtained.map(entry => (entry.request as { daemonEndpoint: string }).daemonEndpoint);

describe('DaemonSourceContact - plugin sources', () => {
	it('serves a plugin source through one instance, however many times demand arrives', async () => {
		declarePlugin('sandbox');

		contact.contactSources(4101);
		await vi.waitFor(() => expect(fixture.obtained).toHaveLength(1));
		contact.contactSources(4101);
		await vi.waitFor(() => expect(fixture.obtained).toHaveLength(2));

		expect(fixture.created).toHaveLength(1);
		expect(fixture.obtained[0]?.request).toMatchObject({ daemonEndpoint: 'ws://127.0.0.1:4101' });
	});

	// `flow worker source remove` runs in another process, so the daemon learns of it from the registry file.
	it('disposes the instance of a source removed since the last contact, at the next one', async () => {
		declarePlugin('sandbox');
		declarePlugin('kept');
		contact.contactSources(4101);
		await vi.waitFor(() => expect(fixture.obtained).toHaveLength(2));

		new WorkerSourceRegistry(dir).remove('sandbox');
		contact.contactSources(4101);

		await vi.waitFor(() => expect(fixture.disposed).toEqual(['sandbox']));
	});
});

describe('DaemonSourceContact - asking only the sources of some worker types', () => {
	it('contacts a plugin source whose type is wanted', async () => {
		declarePlugin('sandbox');

		contact.contactSources(4101, new Set(['fixture-sandbox']));

		await vi.waitFor(() => expect(fixture.obtained).toHaveLength(1));
	});

	// The two contacts use different ports, so a worker request says which contact produced it. The later contact for
	// the wanted type is a marker: contacts are handled in order, so by the time it has produced a worker anything the
	// earlier one would have produced is there too. Counting workers alone would pass with a broken filter, as soon as
	// the first one obtained satisfied the wait.
	it('does not contact a source of another type', async () => {
		declarePlugin('sandbox');

		contact.contactSources(4101, new Set(['gpu']));
		contact.contactSources(4102, new Set(['fixture-sandbox']));
		await vi.waitFor(() => expect(endpointsObtained()).toContain('ws://127.0.0.1:4102'));

		expect(endpointsObtained()).toEqual(['ws://127.0.0.1:4102']);
	});

	it('contacts every source when no type is given', async () => {
		declarePlugin('sandbox');

		contact.contactSources(4101);

		await vi.waitFor(() => expect(fixture.obtained).toHaveLength(1));
	});

	// Dropping a source from the list asked is not removing it: its instance must stay.
	it('does not dispose the instance of a source that was merely not asked', async () => {
		declarePlugin('sandbox');
		contact.contactSources(4101);
		await vi.waitFor(() => expect(fixture.obtained).toHaveLength(1));

		contact.contactSources(4101, new Set(['gpu']));
		contact.contactSources(4101, new Set(['fixture-sandbox']));
		await vi.waitFor(() => expect(fixture.obtained).toHaveLength(2));

		expect(fixture.disposed).toEqual([]);
	});
});
