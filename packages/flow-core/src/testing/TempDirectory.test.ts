import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { createTempDirectory, removeTempDirectory } from './TempDirectory';

function failingWith(code: string): () => void {
	return () => {
		throw Object.assign(new Error(`${code}: simulated`), { code });
	};
}

describe('removeTempDirectory', () => {
	it('removes a directory and its content', () => {
		const dir = mkdtempSync(join(tmpdir(), 'flow-core-tempdir-'));
		writeFileSync(join(dir, 'a.txt'), 'x');

		removeTempDirectory(dir);

		expect(existsSync(dir)).toBe(false);
	});

	it.each(['EPERM', 'EBUSY'])('warns naming the directory and the cause on %s instead of failing', code => {
		const warnings: string[] = [];

		removeTempDirectory('/some/dir', { remove: failingWith(code), warn: message => warnings.push(message) });

		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('/some/dir');
		expect(warnings[0]).toContain(code);
	});

	it('throws any other error', () => {
		expect(() => removeTempDirectory('/some/dir', { remove: failingWith('EACCES'), warn: () => {} })).toThrow(
			/EACCES/
		);
	});
});

describe('createTempDirectory', () => {
	let seenInBeforeEach = '';
	let createdByFailingTest = '';
	let createdByPassingTest = '';

	beforeEach(() => {
		seenInBeforeEach = createTempDirectory('flow-core-tempdir-hook-');
	});

	it('creates the directory under the OS temp dir with the prefix, and it exists during the test', () => {
		createdByPassingTest = seenInBeforeEach;

		expect(existsSync(seenInBeforeEach)).toBe(true);
		expect(seenInBeforeEach.startsWith(join(tmpdir(), 'flow-core-tempdir-hook-'))).toBe(true);
	});

	it('removed the directory of the previous test once it passed', () => {
		expect(createdByPassingTest).not.toBe('');
		expect(existsSync(createdByPassingTest)).toBe(false);
	});

	// it.fails passes only when the body throws: the directory must be created, then the assertion fails.
	it.fails('is exercised by a test that fails after creating a directory', () => {
		createdByFailingTest = createTempDirectory('flow-core-tempdir-fail-');
		writeFileSync(join(createdByFailingTest, 'a.txt'), 'x');
		expect(1).toBe(2);
	});

	it('removed the directory of the previous test although it failed', () => {
		expect(createdByFailingTest).not.toBe('');
		expect(existsSync(createdByFailingTest)).toBe(false);
	});

	it('removes the directory and explains how to fix the call when no cleanup can be registered', () => {
		let created = '';
		const registerCleanup = (): void => {
			throw new Error('no current test');
		};

		expect(() => {
			try {
				createTempDirectory('flow-core-tempdir-nohook-', { registerCleanup });
			} catch (error) {
				created = readdirSync(tmpdir()).find(name => name.startsWith('flow-core-tempdir-nohook-')) ?? '';
				throw error;
			}
		}).toThrow(/outside a test.*Call it inside the test.*no current test/s);
		expect(created).toBe('');
	});

	it('also removes the <directory>.meta sibling that the workspace code writes next to a workspace', () => {
		const removed: string[] = [];
		let cleanup: () => void = () => {};

		const dir = createTempDirectory('flow-core-tempdir-meta-', {
			registerCleanup: fn => {
				cleanup = fn;
			},
			remove: directory => removed.push(directory),
		});
		cleanup();

		expect(removed).toEqual([dir, `${dir}.meta`]);
		rmSync(dir, { recursive: true, force: true });
	});

	it('hands the created directory to the removal when the test ends', () => {
		const removed: string[] = [];
		let cleanup: () => void = () => {};

		const dir = createTempDirectory('flow-core-tempdir-deps-', {
			registerCleanup: fn => {
				cleanup = fn;
			},
			remove: directory => removed.push(directory),
		});
		expect(removed).toEqual([]);
		cleanup();

		expect(removed).toContain(dir);
		rmSync(dir, { recursive: true, force: true });
	});
});
