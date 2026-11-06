import { describe, expect, it } from 'vitest';

import { RunSandboxName, SANDBOX_NAME_MAX_LENGTH } from './RunSandboxName';
import { failure } from './testing/ExpectedFailures';

describe('RunSandboxName', () => {
	it('formats the owner marker, wrapper id and execution id, and round-trips ids with hyphens (the wrapper id never has one)', () => {
		expect(RunSandboxName.format('w1', 'exec0001')).toBe('flow-sbx-w1-exec0001');

		const name = RunSandboxName.format('abc123', '0f8e-4c2d-9a1b');

		expect(name).toBe('flow-sbx-abc123-0f8e-4c2d-9a1b');
		expect(RunSandboxName.parse(name)).toEqual({ wrapperId: 'abc123', executionId: '0f8e-4c2d-9a1b' });
	});

	it('accepts a name of exactly the maximum length and refuses one character more', () => {
		const prefixAndWrapper = 'flow-sbx-w1-'.length;
		const fits = 'a'.repeat(SANDBOX_NAME_MAX_LENGTH - prefixAndWrapper);

		expect(RunSandboxName.format('w1', fits)).toHaveLength(SANDBOX_NAME_MAX_LENGTH);
		expect(failure(() => RunSandboxName.format('w1', `${fits}a`)).message).toContain(
			`the limit is ${SANDBOX_NAME_MAX_LENGTH}`
		);
	});

	it('refuses a hostile wrapper id', () => {
		const cases: [string, string][] = [
			['uppercase', 'W1'],
			['a hyphen', 'w-1'],
			['a path separator', 'w/1'],
			['a backslash', 'w\\1'],
			['a period', 'w.1'],
			['empty', ''],
			['more than 12 characters', 'a'.repeat(13)],
		];
		for (const [label, wrapperId] of cases) {
			const error = failure(() => RunSandboxName.format(wrapperId, 'exec1'), label);
			expect(error.kind, label).toBe('invalid-argument');
			expect(error.message, label).toContain('Wrapper id');
		}
	});

	it('refuses a hostile execution id', () => {
		const cases: [string, string][] = [
			['uppercase', 'Exec1'],
			['a forward slash', 'a/b'],
			['a backslash', 'a\\b'],
			['parent segment', '..'],
			['a period', 'a.b'],
			['a space', 'a b'],
			['a leading hyphen', '-a'],
			['a trailing hyphen', 'a-'],
			['empty', ''],
			['a drive colon', 'c:'],
			['a NUL', 'a\0b'],
		];
		for (const [label, executionId] of cases) {
			const error = failure(() => RunSandboxName.format('w1', executionId), label);
			expect(error.kind, label).toBe('invalid-argument');
			expect(error.message, label).toContain('Execution id');
		}
	});

	it('does not parse a name this plugin could not have created', () => {
		const cases: [string, string][] = [
			['a name without the marker', 'my-sandbox'],
			['the marker only', 'flow-sbx-'],
			['a wrapper id without an execution id', 'flow-sbx-w1'],
			['an empty wrapper id', 'flow-sbx--exec1'],
			['an uppercase marker', 'FLOW-SBX-w1-exec1'],
			['an uppercase execution id', 'flow-sbx-w1-Exec1'],
			['a path separator', 'flow-sbx-w1-a/b'],
			['a parent segment', 'flow-sbx-w1-..'],
			['a wrapper id that is too long', 'flow-sbx-aaaaaaaaaaaaa-exec1'],
			['a trailing hyphen', 'flow-sbx-w1-exec1-'],
			['a wildcard', 'flow-sbx-*'],
			['more than the maximum length', `flow-sbx-w1-${'a'.repeat(SANDBOX_NAME_MAX_LENGTH)}`],
			['a leading space', ' flow-sbx-w1-exec1'],
		];
		for (const [label, name] of cases) expect(RunSandboxName.parse(name), label).toBeUndefined();
	});

	it('recognises valid wrapper ids', () => {
		expect(RunSandboxName.isWrapperId('w1')).toBe(true);
		expect(RunSandboxName.isWrapperId('W1')).toBe(false);
	});
});
