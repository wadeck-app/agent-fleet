import { removeTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { observeFor } from '../test-utils/WaitHelpers';
import { ExclusiveFileLock } from './ExclusiveFileLock';

let dir: string;
let lockPath: string;

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-file-lock-'));
	lockPath = path.join(dir, 'x.lock');
});
afterEach(() => removeTempDirectory(dir));

describe('ExclusiveFileLock.acquire', () => {
	it('lets one holder in at a time and releases the file', async () => {
		const order: string[] = [];
		const run = async (name: string) => {
			const release = await ExclusiveFileLock.acquire(lockPath, { timeoutMs: 5000, purpose: 'test' });
			order.push(`${name}:in`);
			await observeFor(30);
			order.push(`${name}:out`);
			release();
		};
		await Promise.all([run('a'), run('b'), run('c')]);

		for (let i = 0; i < order.length; i += 2) {
			expect(order[i]!.endsWith(':in')).toBe(true);
			expect(order[i + 1]).toBe(order[i]!.replace(':in', ':out'));
		}
		expect(fs.existsSync(lockPath)).toBe(false);
	});

	it('takes over a lock whose owner process is dead', async () => {
		// A pid far above any real one.
		fs.writeFileSync(lockPath, JSON.stringify({ pid: 2_147_483_646, acquiredAt: new Date().toISOString() }));

		const release = await ExclusiveFileLock.acquire(lockPath, { timeoutMs: 2000, purpose: 'test' });

		expect(JSON.parse(fs.readFileSync(lockPath, 'utf8')).pid).toBe(process.pid);
		release();
	});

	it('names the holder, the file and the way out when the lock stays held', async () => {
		fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }));

		const failure = await ExclusiveFileLock.acquire(lockPath, {
			timeoutMs: 200,
			purpose: 'start the daemon',
		}).catch((e: unknown) => e as Error);

		expect(failure).toBeInstanceOf(Error);
		expect((failure as Error).message).toContain('start the daemon');
		expect((failure as Error).message).toContain(`pid ${String(process.pid)}`);
		expect((failure as Error).message).toContain(lockPath);
		expect((failure as Error).message).toContain('delete');
	});

	it('release leaves a lock that someone else took over untouched', async () => {
		const release = await ExclusiveFileLock.acquire(lockPath, { timeoutMs: 1000, purpose: 'test' });
		fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid + 1, acquiredAt: 'x' }));

		release();

		expect(fs.existsSync(lockPath)).toBe(true);
	});
});
