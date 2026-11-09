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

describe('DaemonSourceContact - requirement-only sources (deprecated exclusive, or declared guarantees)', () => {
	const declareExclusive = (sourceId: string, implementation = 'exclusive'): void => {
		registry.declare({
			sourceId,
			provider: 'fixture',
			plugin: `fixture-sandbox.${implementation}`,
			pluginsDir: FIXTURE_PLUGINS_DIR,
			labels: [],
			maxWorkers: 1,
		});
	};

	// Same marker technique as above: a later contact on another port proves the earlier one has been handled.
	it('does not ask an exclusive source for a worker on behalf of demand that requires nothing, but builds its instance', async () => {
		declareExclusive('sbx');
		declarePlugin('plain');

		contact.contactSources(4101);
		await vi.waitFor(() => expect(fixture.obtained.map(entry => entry.sourceId)).toContain('plain'));
		contact.contactSources(4102, new Set(['plain']));
		await vi.waitFor(() => expect(endpointsObtained()).toContain('ws://127.0.0.1:4102'));

		expect(fixture.created.map(entry => entry.sourceId).sort()).toEqual(['plain', 'sbx']);
		const asked = fixture.obtained.map(
			entry => `${entry.sourceId}@${(entry.request as { daemonEndpoint: string }).daemonEndpoint}`
		);
		expect(asked).not.toContain('sbx@ws://127.0.0.1:4101');
	});

	// The rule that replaces `exclusive`: declaring guarantees is enough, the flag is not needed.
	it('does not ask a source that declares guarantees for a worker on behalf of demand that requires nothing, but builds its instance', async () => {
		declareExclusive('guarded', 'confined');
		declarePlugin('plain');

		contact.contactSources(4101);
		await vi.waitFor(() => expect(fixture.obtained.map(entry => entry.sourceId)).toContain('plain'));
		contact.contactSources(4102, new Set(['plain']));
		await vi.waitFor(() => expect(endpointsObtained()).toContain('ws://127.0.0.1:4102'));

		expect(fixture.created.map(entry => entry.sourceId).sort()).toEqual(['guarded', 'plain']);
		const asked = fixture.obtained.map(
			entry => `${entry.sourceId}@${(entry.request as { daemonEndpoint: string }).daemonEndpoint}`
		);
		expect(asked).not.toContain('guarded@ws://127.0.0.1:4101');
	});

	it('asks a source that declares guarantees for a worker when the demand names it by id', async () => {
		declareExclusive('guarded', 'confined');

		contact.contactSources(4101, new Set(['guarded']));

		await vi.waitFor(() => expect(fixture.obtained.map(entry => entry.sourceId)).toEqual(['guarded']));
	});

	it('asks an exclusive source for a worker when the demand names it by id (a step that requires what it guarantees)', async () => {
		declareExclusive('sbx');

		contact.contactSources(4101, new Set(['sbx']));

		await vi.waitFor(() => expect(fixture.obtained.map(entry => entry.sourceId)).toEqual(['sbx']));
	});
});

describe('DaemonSourceContact - asking only the sources named', () => {
	const sourcesObtained = (): string[] => fixture.obtained.map(entry => entry.sourceId);

	it('contacts only the sources named', async () => {
		declarePlugin('a');
		declarePlugin('b');

		contact.contactSources(4101, new Set(['b']));
		await vi.waitFor(() => expect(sourcesObtained()).toContain('b'));

		expect(sourcesObtained()).toEqual(['b']);
	});

	it('contacts nothing for a source id that is not declared', async () => {
		declarePlugin('a');

		contact.contactSources(4101, new Set(['ghost']));
		contact.contactSources(4102, new Set(['a']));
		await vi.waitFor(() => expect(endpointsObtained()).toContain('ws://127.0.0.1:4102'));

		expect(endpointsObtained()).toEqual(['ws://127.0.0.1:4102']);
	});

	it('does not dispose the instance of a source that was merely not asked', async () => {
		declarePlugin('a');
		declarePlugin('b');
		contact.contactSources(4101);
		await vi.waitFor(() => expect(fixture.obtained).toHaveLength(2));

		contact.contactSources(4101, new Set(['b']));
		await vi.waitFor(() => expect(fixture.obtained).toHaveLength(3));

		expect(fixture.disposed).toEqual([]);
	});
});
