import type { FlowDefinitionResolver, ResolvedDefinition } from 'flow-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LogWriter } from '../storage/LogWriter.js';
import { RunDefinitionLoader } from './RunDefinitionLoader.js';

/** `workerType` was removed: a flow that sets it, or a stored version that does, is refused with the migration message. */
describe('RunDefinitionLoader - the removed workerType', () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-def-worker-type-'));
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	const FLOW_LINES = (workerTypeLine: string): string[] => [
		'id: bound',
		'name: Bound',
		'version: 1.0.0',
		'description: used to be bound to a worker type',
		...(workerTypeLine === '' ? [] : [workerTypeLine]),
		'workspace: in-place',
		'steps:',
		'  - id: s',
		'    name: S',
		'    type: script',
		'    script: "true"',
		'',
	];

	function flowFile(workerTypeLine: string): string {
		const file = path.join(dir, 'flow.yml');
		fs.writeFileSync(file, FLOW_LINES(workerTypeLine).join('\n'));
		return file;
	}

	const storedFlow = { id: 'bound', name: 'Bound', version: '1.0.0', description: 'd', workspace: 'in-place' };

	function loader(): RunDefinitionLoader {
		const resolver = {
			forFile: (request: { flow: unknown }): ResolvedDefinition =>
				({ flow: request.flow }) as unknown as ResolvedDefinition,
			forSnapshotRef: (): ResolvedDefinition =>
				({
					flow: {
						...storedFlow,
						workerType: 'sandbox',
						steps: [{ id: 's', name: 'S', type: 'script', script: 'true' }],
					},
				}) as unknown as ResolvedDefinition,
		} as unknown as FlowDefinitionResolver;
		return new RunDefinitionLoader(resolver, { writeExecution: () => undefined } as unknown as LogWriter);
	}

	const load = (file: string) => loader().load({ type: 'run', flowFile: file } as never, file);
	const refusal = (loaded: ReturnType<typeof load>) => JSON.stringify(loaded.ok ? undefined : loaded.response);

	it('refuses a flow with workerType: sandbox with VALIDATION_FAILED and the migration message', () => {
		const loaded = load(flowFile('workerType: sandbox'));

		expect(loaded.ok).toBe(false);
		expect(loaded.ok ? undefined : loaded.response).toMatchObject({ type: 'error', code: 'VALIDATION_FAILED' });
		expect(refusal(loaded)).toContain('workerType was removed');
		expect(refusal(loaded)).toContain('requires: [sandbox]');
		expect(refusal(loaded)).toContain('flow worker source list');
	});

	it('refuses any other value too, without inventing a replacement', () => {
		const loaded = load(flowFile('workerType: gpu'));

		expect(loaded.ok).toBe(false);
		expect(refusal(loaded)).toContain('workerType was removed');
		expect(refusal(loaded)).not.toContain('requires: [sandbox]');
	});

	it('runs a flow without workerType', () => {
		expect(load(flowFile('')).ok).toBe(true);
	});

	// A version stored before the removal and run again by id@version, or a waiting run started again after a restart.
	it('refuses a stored definition snapshot that still has workerType, with the same message', () => {
		const loaded = loader().loadSnapshot('bound@1.0.0', {} as never);

		expect(loaded.ok).toBe(false);
		expect(refusal(loaded)).toContain('workerType was removed');
		expect(refusal(loaded)).toContain('requires: [sandbox]');
	});
});
