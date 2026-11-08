import type { FlowDefinitionResolver, ResolvedDefinition } from 'flow-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LogWriter } from '../storage/LogWriter.js';
import { RunDefinitionLoader } from './RunDefinitionLoader.js';

/**
 * `requires:` is checked exactly at run start, against what the declared sources may provide. Offline (`flow validate`)
 * the same flow is checked for syntax only, because only the daemon knows the sources.
 */
describe('RunDefinitionLoader - requires', () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-def-requires-'));
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	function flowFile(requires: string[] | undefined, stepRequires?: string[]): string {
		const file = path.join(dir, 'flow.yml');
		fs.writeFileSync(
			file,
			[
				'id: needs',
				'name: Needs',
				'version: 1.0.0',
				'description: needs guarantees',
				...(requires === undefined ? [] : [`requires: ${JSON.stringify(requires)}`]),
				'workspace: in-place',
				'steps:',
				'  - id: s',
				'    name: S',
				'    type: script',
				'    script: "true"',
				...(stepRequires === undefined ? [] : [`    requires: ${JSON.stringify(stepRequires)}`]),
				'',
			].join('\n')
		);
		return file;
	}

	function loaderKnowing(guarantees: { entries: () => string[]; unread: () => string[] } | undefined) {
		const resolver = {
			forFile: (request: { flow: unknown }): ResolvedDefinition =>
				({ flow: request.flow }) as unknown as ResolvedDefinition,
			forSnapshotRef: (): ResolvedDefinition => {
				throw new Error('not used');
			},
		} as unknown as FlowDefinitionResolver;
		return new RunDefinitionLoader(
			resolver,
			{ writeExecution: () => undefined } as unknown as LogWriter,
			undefined,
			guarantees
		);
	}

	const load = (loader: RunDefinitionLoader, file: string) =>
		loader.load({ type: 'run', flowFile: file } as never, file);
	const known = { entries: () => ['env=clean', 'fs=confined'], unread: () => [] as string[] };

	it('runs a flow whose requirements some declared source may provide, at flow and step level', () => {
		expect(load(loaderKnowing(known), flowFile(['fs=confined'], ['env=clean'])).ok).toBe(true);
	});

	it('refuses an unknown requirement with VALIDATION_FAILED and a did-you-mean', () => {
		const loaded = load(loaderKnowing(known), flowFile(['fs=confind']));

		expect(loaded.ok).toBe(false);
		const response = loaded.ok ? undefined : loaded.response;
		expect(response).toMatchObject({ type: 'error', code: 'VALIDATION_FAILED' });
		expect(JSON.stringify(response)).toMatch(/Did you mean .*fs=confined/);
	});

	it('refuses an unknown step-level requirement too', () => {
		const loaded = load(loaderKnowing(known), flowFile(undefined, ['gpu']));

		expect(loaded.ok).toBe(false);
		expect(JSON.stringify(loaded.ok ? undefined : loaded.response)).toContain('unknown requirement');
	});

	it('refuses a requirement when no declared source declares any guarantee', () => {
		const loaded = load(loaderKnowing({ entries: () => [], unread: () => [] }), flowFile(['fs=confined']));

		expect(loaded.ok).toBe(false);
		expect(JSON.stringify(loaded.ok ? undefined : loaded.response)).toContain(
			'no worker source declares any guarantee'
		);
	});

	it('checks the syntax only when it knows nothing about the sources (offline validation)', () => {
		expect(load(loaderKnowing(undefined), flowFile(['anything=goes'])).ok).toBe(true);
		expect(load(loaderKnowing(undefined), flowFile(['bad entry'])).ok).toBe(false);
	});

	// The flow is not validated yet when this is asked: a flow with no steps is refused by the validator, not by a crash.
	it('refuses a flow without steps with VALIDATION_FAILED instead of failing while it looks for requirements', () => {
		const file = path.join(dir, 'nosteps.yml');
		fs.writeFileSync(
			file,
			['id: x', 'name: X', 'version: 1.0.0', 'description: d', 'workspace: in-place', ''].join('\n')
		);

		const loaded = load(loaderKnowing(known), file);

		expect(loaded.ok).toBe(false);
		expect(loaded.ok ? undefined : loaded.response).toMatchObject({ type: 'error', code: 'VALIDATION_FAILED' });
	});

	it('does not ask the sources about a flow that requires nothing', () => {
		const loader = loaderKnowing({
			entries: () => {
				throw new Error('must not be read');
			},
			unread: () => ['sbx'],
		});

		expect(load(loader, flowFile(undefined)).ok).toBe(true);
	});

	it('says which sources could not be read when the requirements do not check out, instead of blaming the flow alone', () => {
		const loaded = load(
			loaderKnowing({ entries: () => [], unread: () => ['sbx', 'gpu'] }),
			flowFile(['fs=confined'])
		);

		expect(loaded.ok).toBe(false);
		const response = loaded.ok ? undefined : loaded.response;
		expect(response).toMatchObject({ type: 'error', code: 'REQUIREMENT_SOURCES_UNREADABLE' });
		const message = (response as { message: string }).message;
		expect(message).toContain('sbx, gpu');
		expect(message).toContain('unknown requirement');
	});
});
