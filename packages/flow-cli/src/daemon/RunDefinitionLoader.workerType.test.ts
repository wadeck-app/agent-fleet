import type { FlowDefinitionResolver, ResolvedDefinition } from 'flow-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LogWriter } from '../storage/LogWriter.js';
import { RunDefinitionLoader } from './RunDefinitionLoader.js';

/** A flow bound to a worker type is refused at run start when no declared source stands for that type. */
describe('RunDefinitionLoader - flow-level workerType', () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-def-worker-type-'));
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	function flowFile(workerTypeLine: string): string {
		const file = path.join(dir, 'flow.yml');
		fs.writeFileSync(
			file,
			[
				'id: bound',
				'name: Bound',
				'version: 1.0.0',
				'description: bound to a worker type',
				...(workerTypeLine === '' ? [] : [workerTypeLine]),
				'workspace: { mode: shared, gitStrategy: main-only, reusePolicy: never }',
				'steps:',
				'  - id: s',
				'    name: S',
				'    type: script',
				'    script: "true"',
				'',
			].join('\n')
		);
		return file;
	}

	function loaderKnowing(knownWorkerTypes: (() => string[]) | undefined) {
		const resolver = {
			forFile: (request: { flow: unknown }): ResolvedDefinition =>
				({ flow: request.flow }) as unknown as ResolvedDefinition,
		} as unknown as FlowDefinitionResolver;
		return new RunDefinitionLoader(
			resolver,
			{ writeExecution: () => undefined } as unknown as LogWriter,
			knownWorkerTypes
		);
	}

	function load(loader: RunDefinitionLoader, file: string) {
		return loader.load({ type: 'run', flowFile: file } as never, file);
	}

	it('runs a flow bound to a type some declared source stands for', () => {
		const loaded = load(
			loaderKnowing(() => ['gpu', 'sandbox']),
			flowFile('workerType: sandbox')
		);

		expect(loaded.ok).toBe(true);
	});

	it('refuses a flow bound to an unknown type with VALIDATION_FAILED, naming the known ones', () => {
		const loaded = load(
			loaderKnowing(() => ['gpu', 'sandbox']),
			flowFile('workerType: sandbx')
		);

		expect(loaded.ok).toBe(false);
		const response = loaded.ok ? undefined : loaded.response;
		expect(response).toMatchObject({ type: 'error', code: 'VALIDATION_FAILED' });
		expect(JSON.stringify(response)).toContain('Known worker types: gpu, sandbox');
	});

	it('reads the declared types at each run, so a source declared since is seen', () => {
		const declared: string[] = [];
		const loader = loaderKnowing(() => declared);
		const file = flowFile('workerType: sandbox');
		expect(load(loader, file).ok).toBe(false);

		declared.push('sandbox');

		expect(load(loader, file).ok).toBe(true);
	});

	it('refuses a bound flow when no type is known at all, saying how to declare one', () => {
		const loaded = load(
			loaderKnowing(() => []),
			flowFile('workerType: sandbox')
		);

		expect(loaded.ok).toBe(false);
		expect(JSON.stringify(loaded.ok ? undefined : loaded.response)).toContain('flow worker source add');
	});

	// Without the field nothing about the run changes, whatever the sources are.
	it('runs a flow without workerType when no type is known', () => {
		const loaded = load(
			loaderKnowing(() => []),
			flowFile('')
		);

		expect(loaded.ok).toBe(true);
	});

	it('does not look at the declared sources for a flow without workerType', () => {
		const loader = loaderKnowing(() => {
			throw new Error('the registry must not be read');
		});

		expect(load(loader, flowFile('')).ok).toBe(true);
	});
});

describe('RunDefinitionLoader - flow-level workerType when the declared sources cannot be read', () => {
	it('refuses the run and says what could not be read, instead of guessing the type is fine', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-def-worker-type-'));
		try {
			const file = path.join(dir, 'flow.yml');
			fs.writeFileSync(
				file,
				'id: b\nname: B\nversion: 1.0.0\ndescription: d\nworkerType: sandbox\nworkspace: { mode: shared, gitStrategy: main-only, reusePolicy: never }\nsteps:\n  - { id: s, name: S, type: script, script: "true" }\n'
			);
			const resolver = { forFile: () => ({}) } as unknown as FlowDefinitionResolver;
			const loader = new RunDefinitionLoader(
				resolver,
				{ writeExecution: () => undefined } as unknown as LogWriter,
				() => {
					throw new Error('worker-sources.json is corrupt');
				}
			);

			const loaded = loader.load({ type: 'run', flowFile: file } as never, file);

			expect(loaded.ok).toBe(false);
			expect(loaded.ok ? undefined : loaded.response).toMatchObject({
				type: 'error',
				code: 'WORKER_SOURCES_UNREADABLE',
			});
			expect(JSON.stringify(loaded.ok ? undefined : loaded.response)).toContain('worker-sources.json is corrupt');
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
