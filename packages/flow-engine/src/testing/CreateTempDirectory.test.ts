import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTempDirectory } from 'test-utils/helpers';
import { beforeEach, describe, expect, it } from 'vitest';

// The flow-engine package cannot use flow-core's helper (flow-core depends on flow-engine), so test-utils carries its own.
describe('createTempDirectory (test-utils)', () => {
	let fromHook = '';
	let afterPass = '';
	let afterFailure = '';

	beforeEach(() => {
		fromHook = createTempDirectory('flow-engine-tempdir-');
	});

	it('creates the directory under the OS temp dir with the prefix', () => {
		afterPass = fromHook;

		expect(existsSync(fromHook)).toBe(true);
		expect(fromHook.startsWith(join(tmpdir(), 'flow-engine-tempdir-'))).toBe(true);
	});

	it('removed the directory of the previous test once it passed', () => {
		expect(afterPass).not.toBe('');
		expect(existsSync(afterPass)).toBe(false);
	});

	// it.fails passes only when the body throws.
	it.fails('is exercised by a test that fails after creating a directory', () => {
		afterFailure = createTempDirectory('flow-engine-tempdir-fail-');
		writeFileSync(join(afterFailure, 'a.txt'), 'x');
		expect(1).toBe(2);
	});

	it('removed the directory of the previous test although it failed', () => {
		expect(afterFailure).not.toBe('');
		expect(existsSync(afterFailure)).toBe(false);
	});
});
