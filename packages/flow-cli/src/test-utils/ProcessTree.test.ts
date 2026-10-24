import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

import { OWN_PROCESS_GROUP, killProcessTree } from './ProcessTree';
import { pollUntil } from './WaitHelpers';

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

// A parent that starts a long-lived grandchild and prints its pid, like a daemon starting a worker.
const PARENT_SCRIPT = `
const { spawn } = require('node:child_process');
const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
console.log('grandchild=' + grandchild.pid);
setInterval(() => {}, 1000);
`;

describe('killProcessTree', () => {
	const toClean: number[] = [];

	afterEach(() => {
		for (const pid of toClean.splice(0)) {
			if (isAlive(pid)) process.kill(pid, 'SIGKILL');
		}
	});

	it('kills the child and its grandchild, and returns only once the child is gone', async () => {
		const parent = spawn(process.execPath, ['-e', PARENT_SCRIPT], {
			stdio: ['ignore', 'pipe', 'ignore'],
			detached: OWN_PROCESS_GROUP,
		});
		let stdout = '';
		parent.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
		await pollUntil(() => stdout.includes('grandchild='), { timeoutMs: 15_000 });
		const grandchildPid = Number(/grandchild=(\d+)/.exec(stdout)?.[1]);
		expect(Number.isInteger(grandchildPid), `no grandchild pid in the parent output: "${stdout}"`).toBe(true);
		toClean.push(grandchildPid, parent.pid!);

		await killProcessTree(parent);

		expect(parent.exitCode !== null || parent.signalCode !== null).toBe(true);
		expect(await pollUntil(() => !isAlive(grandchildPid), { timeoutMs: 5_000 })).toBe(true);
	});

	it('does nothing for a child that already exited', async () => {
		const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
		await new Promise(resolve => child.once('exit', resolve));
		await expect(killProcessTree(child)).resolves.toBeUndefined();
	});
});
