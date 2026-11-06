import { WorkerSourceRegistry } from 'flow-cli/src/daemon/WorkerSourceRegistry';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { FlowSourceLookup } from './FlowSourceLookup';
import { WorkerTypePreflight } from './WorkerTypePreflight';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('WorkerTypePreflight (what the wrapper can know about how it was declared)', () => {
	// The wrapper cannot see the flow, so it can never promise isolation; it can only say what the source gives it.
	it.each([
		{
			label: 'a source declared with a plugin ref: its workers have that type (info, no warning)',
			lookup: () => ({ plugin: 'sandbox.exec' }),
			level: 'info',
			fragments: ['worker type "sandbox"', 'workerType: sandbox'],
		},
		{
			label: 'a source of another plugin id: the flow must name that type (info)',
			lookup: () => ({ plugin: 'gpubox.exec' }),
			level: 'info',
			fragments: ['worker type "gpubox"', 'workerType: gpubox'],
		},
		{
			label: 'a source without a plugin ref (built-in:command): no worker type, label routing only (warning)',
			lookup: () => ({}),
			level: 'warn',
			fragments: ['has no plugin ref', 'NOT isolating', '--plugin sandbox.<implementation>'],
		},
		{
			label: 'a source that is not in the registry the wrapper can read (warning, says so)',
			lookup: () => undefined,
			level: 'warn',
			fragments: ['could not be verified', 'NOT isolating'],
		},
		{
			label: 'a registry that cannot be read (warning, with the cause)',
			lookup: () => {
				throw new Error('worker-sources.json is corrupt');
			},
			level: 'warn',
			fragments: ['could not be verified', 'worker-sources.json is corrupt'],
		},
	])('$label', ({ lookup, level, fragments }) => {
		const log = new RecordingSandboxLog();

		new WorkerTypePreflight({ sourceId: 'sbx-exec', lookup, log }).run();

		expect(log.lines).toHaveLength(1);
		expect(log.lines[0]).toMatch(new RegExp(`^${level}:`));
		for (const fragment of fragments) expect(log.lines[0]).toContain(fragment);
		expect(log.lines[0]).toContain('sbx-exec');
	});
});

describe('FlowSourceLookup (reads the registry flow itself writes)', () => {
	it('finds the plugin of a declared source and nothing for an unknown id', () => {
		const configDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-source-lookup-'));
		roots.push(configDirectory);
		new WorkerSourceRegistry(configDirectory).declare({
			sourceId: 'sbx-exec',
			provider: 'sandbox-exec',
			plugin: 'sandbox.exec',
			pluginsDir: path.join(configDirectory, 'plugins'),
			labels: ['sandbox'],
			maxWorkers: 1,
		});
		const lookup = new FlowSourceLookup(configDirectory);

		expect(lookup.find('sbx-exec')).toMatchObject({ plugin: 'sandbox.exec' });
		expect(lookup.find('other')).toBeUndefined();
	});
});
