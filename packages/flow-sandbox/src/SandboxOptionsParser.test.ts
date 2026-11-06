import { describe, expect, it } from 'vitest';

import { SandboxOptionsParser } from './SandboxOptionsParser';
import { failure as sandboxFailure } from './testing/ExpectedFailures';

const parser = new SandboxOptionsParser();

function failure(raw: unknown): ReturnType<typeof sandboxFailure> {
	return sandboxFailure(() => parser.parse(raw), JSON.stringify(raw));
}

describe('SandboxOptionsParser accepted options', () => {
	it('applies every default for an absent, null or empty block', () => {
		for (const raw of [undefined, null, {}]) {
			expect(parser.parse(raw), JSON.stringify(raw)).toEqual({
				cpus: 2,
				memory: '2g',
				maxConcurrentSandboxes: 4,
				idleStopMinutes: 5,
				profiles: {},
				extraAllowedHosts: [],
				image: undefined,
				acceptSshAgentForwarding: false,
			});
		}
	});

	it('keeps every explicit value, normalizes the memory unit to lowercase, and accepts the shortest and the longest idle delay', () => {
		const parsed = parser.parse({
			cpus: 4,
			memory: '8G',
			maxConcurrentSandboxes: 2,
			idleStopMinutes: 0.5,
			profiles: { claude: 'work-sso', codex: 'codex' },
			extraAllowedHosts: ['registry.example.org:443', '*.npmjs.org:443'],
			image: 'flow-sandbox:poc-m0',
			acceptSshAgentForwarding: true,
		});

		expect(parsed).toEqual({
			cpus: 4,
			memory: '8g',
			maxConcurrentSandboxes: 2,
			idleStopMinutes: 0.5,
			profiles: { claude: 'work-sso', codex: 'codex' },
			extraAllowedHosts: ['registry.example.org:443', '*.npmjs.org:443'],
			image: 'flow-sandbox:poc-m0',
			acceptSshAgentForwarding: true,
		});
		expect(parser.parse({ idleStopMinutes: 0.2 }).idleStopMinutes).toBe(0.2);
		expect(parser.parse({ idleStopMinutes: 1440 }).idleStopMinutes).toBe(1440);
	});
});

describe('SandboxOptionsParser refusals', () => {
	it('rejects an unknown key, lists the supported ones, and applies nothing of the rest', () => {
		const error = failure({ cpu: 2 });

		expect(error.kind).toBe('invalid-options');
		expect(error.message).toContain('[flow-sandbox] Unknown option "cpu"');
		expect(error.message).toContain(
			'cpus, memory, maxConcurrentSandboxes, idleStopMinutes, profiles, extraAllowedHosts, image, acceptSshAgentForwarding'
		);
		expect(error.message).toContain('fix the name');
		expect(failure({ cpus: 2, memroy: '2g' }).message).toContain('"memroy"');
	});

	it('rejects a block that is not an object', () => {
		for (const raw of ['text', 42, ['cpus'], true]) {
			expect(failure(raw).message, JSON.stringify(raw)).toContain('options must be an object');
		}
	});

	it('rejects every invalid value with the option name and the expected form', () => {
		const cases: [string, unknown, string][] = [
			['zero cpus', { cpus: 0 }, 'Option "cpus" must be a whole number of at least 1'],
			['fractional cpus', { cpus: 1.5 }, 'Option "cpus" must be a whole number of at least 1'],
			['text cpus', { cpus: '2' }, 'Option "cpus" must be a whole number of at least 1, found "2"'],
			['null cpus', { cpus: null }, 'Option "cpus"'],
			['zero concurrency', { maxConcurrentSandboxes: 0 }, 'Option "maxConcurrentSandboxes"'],
			['negative idle', { idleStopMinutes: -1 }, 'Option "idleStopMinutes" must be a positive number'],
			['infinite idle', { idleStopMinutes: Infinity }, 'Option "idleStopMinutes" must be a positive number'],
			['text idle', { idleStopMinutes: '5' }, 'Option "idleStopMinutes" must be a positive number'],
			[
				'idle longer than a day (a timer that long would fire at once)',
				{ idleStopMinutes: 1441 },
				'Option "idleStopMinutes" must be at most 1440 (24 hours), found 1441',
			],
			['NaN idle', { idleStopMinutes: NaN }, 'Option "idleStopMinutes" must be a positive number'],
			['zero idle', { idleStopMinutes: 0 }, 'Option "idleStopMinutes" must be a positive number'],
			[
				'fractional concurrency',
				{ maxConcurrentSandboxes: 2.5 },
				'Option "maxConcurrentSandboxes" must be a whole number',
			],
			['memory without unit', { memory: '2048' }, 'Option "memory" must look like'],
			['memory with kilobytes', { memory: '2048k' }, 'Option "memory" must look like'],
			['numeric memory', { memory: 2 }, 'Option "memory" must look like'],
			['memory below the minimum', { memory: '256m' }, 'at least 512m'],
			[
				'non-boolean ssh acceptance',
				{ acceptSshAgentForwarding: 'yes' },
				'Option "acceptSshAgentForwarding" must be true or false',
			],
			['profiles as an array', { profiles: ['a'] }, 'Option "profiles" must be an object'],
			['profiles as null', { profiles: null }, 'Option "profiles" must be an object'],
			['a profile alias with a space', { profiles: { 'a b': 'p' } }, 'Profile alias "a b" is not valid'],
			[
				'an empty host profile',
				{ profiles: { a: ' ' } },
				'Profile "a" must map to a non-empty host profile name',
			],
			['a numeric host profile', { profiles: { a: 1 } }, 'Profile "a" must map to a non-empty host profile name'],
			['hosts as a string', { extraAllowedHosts: 'a:443' }, 'must be an array'],
			['a host without port', { extraAllowedHosts: ['example.org'] }, 'invalid entry "example.org"'],
			['a catch-all host', { extraAllowedHosts: ['**:443'] }, 'catch-all patterns are refused'],
			['a non-string host', { extraAllowedHosts: [443] }, 'invalid entry 443: not a string'],
			[
				'an image with whitespace',
				{ image: 'a b' },
				'Option "image" must be an image reference without whitespace',
			],
			['an empty image', { image: '' }, 'Option "image"'],
		];
		for (const [label, raw, message] of cases) {
			const error = sandboxFailure(() => parser.parse(raw), label);
			expect(error.kind, label).toBe('invalid-options');
			expect(error.message, label).toContain(message);
		}
	});
});
