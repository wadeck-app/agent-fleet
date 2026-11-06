import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SandboxError } from './SandboxError';
import { WrapperPresence } from './WrapperPresence';

let directory: string;
const alive = new Set<number>();

function presence(ownPid = 111): WrapperPresence {
	return new WrapperPresence(directory, pid => alive.has(pid), ownPid);
}

beforeEach(() => {
	directory = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-presence-')), 'presence');
	alive.clear();
});

afterEach(() => {
	fs.rmSync(path.dirname(directory), { recursive: true, force: true });
});

describe('WrapperPresence', () => {
	it('reports a wrapper and its run alive while its process lives; a crashed wrapper (process gone) and its run are not alive', () => {
		alive.add(111);
		presence(111).publish('w1', 'run1');

		expect(presence().isWrapperAlive('w1')).toBe(true);
		expect(presence().isRunAlive('run1')).toBe(true);
		expect(presence().isRunAlive('run2')).toBe(false);
		expect(presence().isWrapperAlive('w2')).toBe(false);

		alive.clear();

		expect(presence().isWrapperAlive('w1')).toBe(false);
		expect(presence().isRunAlive('run1')).toBe(false);
	});

	it('forgets the run when the wrapper publishes none (the wrapper stays alive), and withdraws the file, tolerating a second withdraw', () => {
		alive.add(111);
		const writer = presence(111);
		writer.publish('w1', 'run1');
		writer.publish('w1', undefined);

		expect(presence().isRunAlive('run1')).toBe(false);
		expect(presence().isWrapperAlive('w1')).toBe(true);

		writer.withdraw('w1');
		writer.withdraw('w1');

		expect(presence().isWrapperAlive('w1')).toBe(false);
		expect(fs.readdirSync(directory)).toEqual([]);
	});

	it('answers "not alive" when the directory does not exist yet, leaves no temporary file, and ignores files that are not wrapper presence files', () => {
		expect(presence().isRunAlive('run1')).toBe(false);
		expect(presence().isWrapperAlive('w1')).toBe(false);

		alive.add(111);
		presence(111).publish('w1', 'run1');
		expect(fs.readdirSync(directory)).toEqual(['w1.json']);

		fs.writeFileSync(path.join(directory, 'notes.txt'), 'hello');
		fs.writeFileSync(path.join(directory, 'Broken.json'), '{broken');
		expect(presence().isRunAlive('run1')).toBe(true);
	});

	it('refuses a hostile wrapper id that would escape the directory, and a relative directory', () => {
		for (const hostile of ['../evil', '..\\evil', 'a/b', 'W1', '', 'a'.repeat(13)]) {
			expect(() => presence().publish(hostile, 'run1'), hostile).toThrow(SandboxError);
			expect(() => presence().withdraw(hostile), hostile).toThrow('not valid');
			expect(() => presence().isWrapperAlive(hostile), hostile).toThrow('not valid');
		}
		expect(() => new WrapperPresence('relative/dir', () => true, 1)).toThrow('absolute path');
	});

	it('fails loudly, naming the file, on a corrupt presence file and on one of the wrong shape', () => {
		fs.mkdirSync(directory, { recursive: true });
		fs.writeFileSync(path.join(directory, 'w1.json'), '{not json');

		expect(() => presence().isWrapperAlive('w1')).toThrow(/w1\.json is not valid JSON/);

		fs.writeFileSync(path.join(directory, 'w1.json'), JSON.stringify({ wrapperId: 'w1', pid: 'x' }));

		expect(() => presence().isRunAlive('run1')).toThrow(/w1\.json has an unexpected shape/);
	});
});
