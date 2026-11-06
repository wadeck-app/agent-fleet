import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isProcessAlive } from './ProcessLiveness';
import { WrapperLog } from './WrapperLog';
import { eachRow } from './testing/EachRow';

const directories: string[] = [];

afterEach(() => {
	vi.restoreAllMocks();
	for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('small wrapper helpers', () => {
	it('WrapperLog writes tagged lines to stderr and to the log file when asked', () => {
		const written: string[] = [];
		vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
			written.push(String(chunk));
			return true;
		}) as typeof process.stderr.write);
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-wrapper-log-'));
		directories.push(directory);
		const file = path.join(directory, 'wrapper.log');

		new WrapperLog('exec', file).info('hello');
		new WrapperLog('exec', undefined).warn('careful');

		expect(written.join('')).toMatch(/\[exec\] info: hello\n[\s\S]*\[exec\] warn: careful\n/);
		expect(fs.readFileSync(file, 'utf8')).toMatch(/\[exec\] info: hello\n$/);
	});

	it('isProcessAlive knows this process, and a pid that does not exist', () => {
		expect(isProcessAlive(process.pid)).toBe(true);
		expect(isProcessAlive(2 ** 31 - 2)).toBe(false);
	});

	it('eachRow runs every row and names the failing one', async () => {
		const seen: unknown[] = [];

		await eachRow([['one', 1] as const, ['two', 2] as const], (name, value) => void seen.push([name, value]));
		const failure = await eachRow([{ label: 'fine' }, { label: 'the bad one' }], row => {
			if (row.label === 'the bad one') throw new Error('boom');
		}).catch((error: Error) => error);

		expect(seen).toEqual([
			['one', 1],
			['two', 2],
		]);
		expect(failure).toBeInstanceOf(Error);
		expect((failure as Error).message).toBe('[row "the bad one"] boom');
	});
});
