import { DefinitionSnapshotStore, FlowDefinitionResolver, hashDefinition } from 'flow-core';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LogWriter } from '../storage/LogWriter.js';
import { RunDefinitionLoader } from './RunDefinitionLoader.js';

/**
 * The hash, the snapshot and the definition that runs must describe the SAME object. The validator adds
 * `_autoDiscoveredInputs` to the flow it validates: if that happened before hashing, the stored hash covered a field the
 * snapshot text does not hold, and every later read of the snapshot (a waiting run started again after a restart,
 * `flow run <id>@<version>`) failed with "no longer matches its hash".
 */
describe('RunDefinitionLoader -- hash, snapshot and running definition agree', () => {
	let dir: string;
	let flowFile: string;
	let resolver: FlowDefinitionResolver;
	let loader: RunDefinitionLoader;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-def-snapshot-'));
		flowFile = path.join(dir, 'flow.yml');
		fs.writeFileSync(
			flowFile,
			[
				'id: snap',
				'name: Snap',
				'version: 1.0.0',
				'workspace: in-place',
				'steps:',
				'  - id: s',
				'    name: S',
				'    type: script',
				'    script: echo ${{ inputs.who }}',
				'',
			].join('\n')
		);
		resolver = new FlowDefinitionResolver(new DefinitionSnapshotStore(path.join(dir, 'definitions')));
		loader = new RunDefinitionLoader(resolver, { writeExecution: () => undefined } as unknown as LogWriter);
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	function loadFile() {
		const loaded = loader.load({ type: 'run', flowFile, cwd: dir } as never, flowFile);
		if (!loaded.ok) {
			throw new Error(`refused: ${JSON.stringify(loaded.response)}`);
		}
		return loaded.resolved;
	}

	it('hashes the file as written, not as the validator leaves it', () => {
		const resolved = loadFile();

		const asWritten = yaml.load(fs.readFileSync(flowFile, 'utf8'), { schema: yaml.JSON_SCHEMA });
		expect(resolved.hash).toBe(hashDefinition(asWritten));
		expect(resolved.flow).not.toHaveProperty('_autoDiscoveredInputs');
	});

	it('reads back the snapshot of a file run (what a restart does)', () => {
		const resolved = loadFile();
		resolved.commit();

		const again = resolver.forSnapshotRef(resolved.definitionSnapshot, 'file');

		expect(again.hash).toBe(resolved.hash);
	});

	it('also keeps a registered run consistent: the snapshot of a file run can be run again by version', () => {
		const resolved = loadFile();
		resolved.commit();
		const registry = path.join(dir, 'flows.yml');
		fs.writeFileSync(registry, '{}');

		const loaded = loader.load(
			{
				type: 'run',
				flowFile: registry,
				flowId: 'snap',
				flowVersion: '1.0.0',
				registered: true,
				cwd: dir,
			} as never,
			registry
		);

		expect(loaded.ok).toBe(true);
	});
});
