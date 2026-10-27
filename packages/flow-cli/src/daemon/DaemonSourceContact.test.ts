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
