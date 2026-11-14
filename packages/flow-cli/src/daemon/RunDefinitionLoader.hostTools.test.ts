import type { FlowDefinitionResolver, ResolvedDefinition } from 'flow-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LogWriter } from '../storage/LogWriter.js';
import { RunDefinitionLoader } from './RunDefinitionLoader.js';

const WARN = { mode: 'warn', description: 'warning (validation.hostToolsUnderConfinedProfile=warn, default)' } as const;
const ERROR = { mode: 'error', description: 'error (validation.hostToolsUnderConfinedProfile=error)' } as const;

/** `hostTools` under a confined profile: a warning or a refusal at run start, as the user's setting says (O3). */
describe('RunDefinitionLoader - hostTools under a confined profile', () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-def-hosttools-'));
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	function flowFile(profile: string | undefined): string {
		const file = path.join(dir, 'flow.yml');
		fs.writeFileSync(
			file,
			[
				'id: tools',
				'name: Tools',
				'version: 1.0.0',
				'description: a model step with a host tool',
				...(profile === undefined ? [] : [`profile: ${profile}`]),
				'workspace: in-place',
				'steps:',
				'  - id: ask',
				'    name: Ask',
				'    type: model',
				'    model: sonnet',
				'    prompt: hello',
				'    hostTools:',
				'      - id: show-version',
				'        description: Prints the git version.',
				'        sideEffect: read',
				'        command: [git, --version]',
				'',
			].join('\n')
		);
		return file;
	}

	function loader(policy: typeof WARN | typeof ERROR | undefined) {
		const resolver = {
			forFile: (request: { flow: unknown }): ResolvedDefinition =>
				({ flow: request.flow }) as unknown as ResolvedDefinition,
		} as unknown as FlowDefinitionResolver;
		return new RunDefinitionLoader(
			resolver,
			{ writeExecution: () => undefined } as unknown as LogWriter,
			{ entries: () => ['env=clean', 'fs=confined'], unread: () => [] as string[] },
			policy
		);
	}

	const load = (target: RunDefinitionLoader, file: string) =>
		target.load({ type: 'run', flowFile: file } as never, file);

	it('warns and runs in warn mode, naming the setting that applied', () => {
		const loaded = load(loader(WARN), flowFile('agent'));

		expect(loaded.ok).toBe(true);
		expect(loaded.ok ? JSON.stringify(loaded.warnings) : '').toContain(WARN.description);
	});

	it('refuses at run start in error mode, naming the setting that applied', () => {
		const loaded = load(loader(ERROR), flowFile('agent'));

		expect(loaded.ok).toBe(false);
		expect(loaded.ok ? undefined : loaded.response).toMatchObject({ type: 'error', code: 'VALIDATION_FAILED' });
		expect(JSON.stringify(loaded.ok ? undefined : loaded.response)).toContain(ERROR.description);
	});

	// The daemon adds the implicit `agent` set to every model step when a source serving the project declares it: a flow with no
	// profile of its own is then confined too (ImplicitConfinement.implicitSetFor, decided by the caller with the run's project).
	describe('with the implicit set of the project', () => {
		const IMPLICIT = ['env=clean', 'fs=confined'];

		it('reports the finding for a flow with no profile when a source serves the project', () => {
			const file = flowFile(undefined);
			const loaded = loader(WARN).load({ type: 'run', flowFile: file } as never, file, IMPLICIT);

			expect(loaded.ok).toBe(true);
			expect(loaded.ok ? JSON.stringify(loaded.warnings) : '').toContain(WARN.description);
		});

		it('refuses in error mode', () => {
			const file = flowFile(undefined);
			const loaded = loader(ERROR).load({ type: 'run', flowFile: file } as never, file, IMPLICIT);

			expect(loaded.ok).toBe(false);
			expect(JSON.stringify(loaded.ok ? undefined : loaded.response)).toContain(ERROR.description);
		});

		it('reports nothing when the project is not served (empty implicit set)', () => {
			const file = flowFile(undefined);
			const loaded = loader(ERROR).load({ type: 'run', flowFile: file } as never, file, []);

			expect(loaded.ok).toBe(true);
		});
	});

	it('reports nothing for a flow without a confined profile, in either mode', () => {
		for (const policy of [WARN, ERROR]) {
			const loaded = load(loader(policy), flowFile(undefined));
			expect(loaded.ok).toBe(true);
			expect(loaded.ok ? JSON.stringify(loaded.warnings) : '').not.toContain(
				'validation.hostToolsUnderConfinedProfile'
			);
		}
	});
});
