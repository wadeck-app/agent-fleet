import { spawn } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

import { killProcessTree } from './ProcessTreeKiller';

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

describe('killProcessTree', () => {
	it('kills the process and the grandchild it started', async () => {
		// The parent prints its grandchild pid, then idles.
		const parent = spawn(
			process.execPath,
			[
				'-e',
				"const c = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); console.log(c.pid); setInterval(() => {}, 1000);",
			],
			{ stdio: ['ignore', 'pipe', 'ignore'] }
		);
		const grandchildPid = await new Promise<number>(resolve => {
			parent.stdout?.once('data', data => resolve(Number(String(data).trim())));
		});
		expect(parent.pid).toBeDefined();
		const parentPid = parent.pid as number;
		expect(isAlive(grandchildPid)).toBe(true);

		killProcessTree(parentPid);

		await vi.waitFor(() => expect(isAlive(parentPid) || isAlive(grandchildPid)).toBe(false), {
			timeout: 5000,
			interval: 50,
		});
	});

	it('does not throw when the process is already gone', () => {
		expect(() => killProcessTree(2_147_483_000)).not.toThrow();
	});
});
