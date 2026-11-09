import { WorkerSourceRegistry } from 'flow-cli/src/daemon/WorkerSourceRegistry';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { eachRow } from '../testing/EachRow';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { FlowSourceLookup } from './FlowSourceLookup';
import { RoutingPreflight } from './RoutingPreflight';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('RoutingPreflight (what the wrapper can know about how it was declared)', () => {
	// The wrapper cannot see the flow, so it can never promise isolation; it can only say what the source gives it.
	it('states what the source gives the wrapper: info with a plugin ref, ONE warning otherwise (each case)', () =>
		eachRow(
			[
				{
					label: 'a source declared with a plugin ref: requirement-only routing, steps arrive only with requires (info, no warning)',
					lookup: () => ({ plugin: 'sandbox.exec' }),
					level: 'info',
					fragments: ['plugin sandbox.exec', 'requires: [sandbox]', 'injected steps'],
				},
				{
					label: 'a source of another plugin id: named as declared (info)',
					lookup: () => ({ plugin: 'gpubox.exec' }),
					level: 'info',
					fragments: ['plugin gpubox.exec', 'requires:'],
				},
				{
					label: 'a source without a plugin ref (built-in:command): no guarantees, label routing only (warning)',
					lookup: () => ({}),
					level: 'warn',
					fragments: [
						'has no plugin ref',
						'NOT isolating',
						'--plugin sandbox.<implementation>',
						'requires: [sandbox]',
					],
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
			],
			({ lookup, level, fragments }) => {
				const log = new RecordingSandboxLog();

				new RoutingPreflight({ sourceId: 'sbx-exec', lookup, log }).run();

				expect(log.lines).toHaveLength(1);
				expect(log.lines[0]).toMatch(new RegExp(`^${level}:`));
				for (const fragment of fragments) expect(log.lines[0]).toContain(fragment);
				expect(log.lines[0]).toContain('sbx-exec');
			}
		));
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
