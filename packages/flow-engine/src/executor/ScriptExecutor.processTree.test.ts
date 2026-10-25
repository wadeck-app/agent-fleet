/**
 * Real child processes: a script that starts a grandchild (a test server, a browser) must not leave it
 * behind when the step times out or the worker shuts down, and must not wait on pipes the grandchild
 * keeps open once the script itself has ended. No mocks: the point is what the operating system does.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScriptExecutor, killAllRunningScripts } from './ScriptExecutor';

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/** Polls the operating system state (a real process dying) until the condition holds, or fails naming `what`. */
async function waitFor(condition: () => boolean, timeoutMs: number, what: string): Promise<void> {
	await vi.waitFor(() => expect(condition(), `waiting for ${what}`).toBe(true), { timeout: timeoutMs, interval: 50 });
}

describe('ScriptExecutor -- process tree', () => {
	let dir: string;
	let pidFile: string;
	let parentScript: string;
	const executor = new ScriptExecutor();

	/** Writes a node script that starts a long-lived grandchild, records its pid, then runs `afterSpawn`. */
	function writeParent(grandchildStdio: string, afterSpawn: string): void {
		fs.writeFileSync(
			parentScript,
			[
				"const { spawn } = require('node:child_process');",
				"const fs = require('node:fs');",
				`const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 25000)'], { cwd: ${JSON.stringify(os.tmpdir())}, stdio: ${grandchildStdio} });`,
				`fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
				afterSpawn,
			].join('\n')
		);
	}

	function grandchildPid(): number {
		return Number(fs.readFileSync(pidFile, 'utf8'));
	}

	function pidFileReady(): boolean {
		return fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8') !== '';
	}

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'script-tree-'));
		pidFile = path.join(dir, 'grandchild.pid');
		parentScript = path.join(dir, 'parent.js');
	});

	afterEach(() => {
		// Safety net by literal pid: never leave the 25 s grandchild behind, whatever the test did.
		if (pidFileReady()) {
			const pid = grandchildPid();
			if (isAlive(pid)) {
				process.kill(pid, 'SIGKILL');
			}
		}
		// Retries: the killed grandchild may still hold the directory as its cwd for a moment (Windows).
		fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
	});

	it('kills the grandchild and fails with timedOut when the timeout elapses (generic shell)', async () => {
		writeParent("'ignore'", 'setInterval(() => {}, 1000);');

		const result = await executor.execute({
			script: `node "${parentScript}"`,
			workingDir: dir,
			timeout: 1500,
		});

		expect(result.timedOut).toBe(true);
		expect(result.success).toBe(false);
		await waitFor(() => !isAlive(grandchildPid()), 5000, 'the grandchild to be killed');
	}, 20000);

	it('kills the grandchild when the timeout elapses (explicit bash shell)', async () => {
		writeParent("'ignore'", 'setInterval(() => {}, 1000);');
		const posixPath = parentScript.replace(/\\/g, '/');

		const result = await executor.execute({
			script: `node "${posixPath}"`,
			workingDir: dir,
			timeout: 1500,
			shellKind: 'bash',
		});

		expect(result.timedOut).toBe(true);
		await waitFor(() => !isAlive(grandchildPid()), 5000, 'the grandchild to be killed');
	}, 20000);

	it('resolves when the script ends even though a grandchild keeps stdout open', async () => {
		// detached + inherited stdio: the grandchild holds the script's stdout/stderr pipes (plain 'inherit'
		// is not enough on Windows, where Node does not pass the pipe on).
		writeParent("'inherit', detached: true", 'process.exit(0);');
		const started = Date.now();

		const result = await executor.execute({ script: `node "${parentScript}"`, workingDir: dir });

		expect(result.exitCode).toBe(0);
		expect(result.success).toBe(true);
		// The grandchild lives 25 s: waiting for its pipes would take that long.
		expect(Date.now() - started).toBeLessThan(15000);
	}, 20000);

	it('reports output as activity and stays quiet for a silent script', async () => {
		let activity = 0;
		await executor.execute({
			script: 'node -e "console.log(1)"',
			workingDir: dir,
			onActivity: () => {
				activity++;
			},
		});
		expect(activity).toBeGreaterThan(0);

		activity = 0;
		await executor.execute({
			script: 'node -e "0"',
			workingDir: dir,
			onActivity: () => {
				activity++;
			},
		});
		expect(activity).toBe(0);
	}, 20000);

	it('kills every running script tree on worker shutdown', async () => {
		writeParent("'ignore'", 'setInterval(() => {}, 1000);');

		const running = executor.execute({ script: `node "${parentScript}"`, workingDir: dir });
		await waitFor(pidFileReady, 10000, 'the pid file');
		const pid = grandchildPid();
		expect(isAlive(pid)).toBe(true);

		killAllRunningScripts();

		const result = await running;
		expect(result.success).toBe(false);
		await waitFor(() => !isAlive(pid), 5000, 'the grandchild to be killed');
	}, 20000);
});
