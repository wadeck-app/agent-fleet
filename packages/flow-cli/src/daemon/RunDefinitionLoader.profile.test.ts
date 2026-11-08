import type { FlowDefinitionResolver, ResolvedDefinition } from 'flow-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LogWriter } from '../storage/LogWriter.js';
import { RunDefinitionLoader } from './RunDefinitionLoader.js';

/**
 * `profile:` names are built in; the guarantees they expand to are checked at run start against what the declared sources
 * provide, exactly like `requires:`.
 */
describe('RunDefinitionLoader - profile', () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-def-profile-'));
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	function flowFile(profile: string | undefined, stepProfile?: string, workerType?: string): string {
		const file = path.join(dir, 'flow.yml');
		fs.writeFileSync(
			file,
			[
				'id: needs',
				'name: Needs',
				'version: 1.0.0',
				'description: needs a profile',
				...(profile === undefined ? [] : [`profile: ${profile}`]),
				...(workerType === undefined ? [] : [`workerType: ${workerType}`]),
				'workspace: in-place',
				'steps:',
				'  - id: s',
				'    name: S',
				'    type: script',
				'    script: "true"',
				...(stepProfile === undefined ? [] : [`    profile: ${stepProfile}`]),
				'',
			].join('\n')
		);
		return file;
	}

	function loaderKnowing(entries: string[]) {
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
			{ entries: () => entries, unread: () => [] as string[] }
		);
	}

	const load = (loader: RunDefinitionLoader, file: string) =>
		loader.load({ type: 'run', flowFile: file } as never, file);
	const refusal = (loaded: ReturnType<typeof load>) => JSON.stringify(loaded.ok ? undefined : loaded.response);

	it('runs a flow whose profile is fully declared by a source', () => {
		expect(load(loaderKnowing(['env=clean', 'fs=confined']), flowFile('agent')).ok).toBe(true);
	});

	// What the sandbox plugin declares today: every profile but inspect is meetable by it.
	const SANDBOX_TODAY = ['clean=run', 'env=clean', 'fs=confined', 'ports=private', 'sandbox'];

	it.each(['agent', 'untrusted-code', 'hermetic-test'])(
		'runs a flow with profile %s against the sandbox as it is today',
		name => {
			expect(load(loaderKnowing(SANDBOX_TODAY), flowFile(name)).ok).toBe(true);
		}
	);

	it('refuses inspect (nobody declares fs=readonly-enforced), naming the profile and the missing guarantee', () => {
		const loaded = load(loaderKnowing(SANDBOX_TODAY), flowFile('inspect'));

		expect(loaded.ok).toBe(false);
		expect(loaded.ok ? undefined : loaded.response).toMatchObject({ type: 'error', code: 'VALIDATION_FAILED' });
		expect(refusal(loaded)).toMatch(/profile .{1,6}inspect.{1,6} requires .{1,6}fs=readonly-enforced/);
	});

	it('checks a step-level profile too', () => {
		const loaded = load(loaderKnowing(['env=clean', 'fs=confined']), flowFile(undefined, 'hermetic-test'));

		expect(loaded.ok).toBe(false);
		expect(refusal(loaded)).toMatch(/clean=run/);
	});

	it('refuses an unknown profile with a did-you-mean, even when no source is known', () => {
		const loaded = load(loaderKnowing([]), flowFile('agnt'));

		expect(loaded.ok).toBe(false);
		expect(refusal(loaded)).toMatch(/Did you mean .{1,6}agent/);
	});

	it('does not refuse a flow only because workerType is deprecated: the warning informs, the field behaves as before', () => {
		expect(load(loaderKnowing([]), flowFile(undefined, undefined, 'sandbox')).ok).toBe(true);
	});
});
