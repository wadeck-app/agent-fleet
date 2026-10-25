/**
 * The `result` stream event ends the turn: a claude process that outlives it (the real CLI waits for
 * background tasks after the final answer) is terminated after a grace period instead of keeping the step
 * running until the daemon's silence watchdog kills it.
 *
 * Runs the real launcher against src/testing/claude-mock.mjs (real child processes, real pipes).
 * Only verified against the mock, never against a real claude.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ClaudeLaunchOptions, ClaudeLauncher, DEFAULT_RESULT_GRACE_MS } from './ClaudeLauncher';
import type { StreamJsonEvent } from './StreamJsonParser';

const MOCK_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'testing', 'claude-mock.mjs');

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

describe('ClaudeLauncher -- end of turn on the result event', () => {
	let tempDir: string;
	let pidFile: string;
	let warnings: string[];

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-eot-'));
		pidFile = path.join(tempDir, 'grandchild.pid');
		warnings = [];
		vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
			warnings.push(String(message));
		});
		// Launcher chatter, irrelevant here
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		if (fs.existsSync(pidFile)) {
			const pid = Number(fs.readFileSync(pidFile, 'utf8'));
			if (isAlive(pid)) {
				process.kill(pid);
			}
		}
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	async function launch(mockEnv: Record<string, string>, extra: Partial<ClaudeLaunchOptions> = {}) {
		const events: StreamJsonEvent[] = [];
		const startedAt = Date.now();
		const result = await new ClaudeLauncher().launchBackground({
			workingDir: tempDir,
			prompt: 'Hello',
			stepId: 'step',
			streamJson: true,
			verbose: true,
			env: { CLAUDE_MOCK_PATH: MOCK_PATH, CLAUDE_MOCK_PIDFILE: pidFile, ...mockEnv },
			onStreamEvent: event => events.push(event),
			...extra,
		});
		return { result, events, elapsedMs: Date.now() - startedAt };
	}

	const results = (events: StreamJsonEvent[]) => events.filter(e => e.type === 'result');

	it('has a documented default grace period of 30 seconds', () => {
		expect(DEFAULT_RESULT_GRACE_MS).toBe(30_000);
	});

	it('terminates a process that keeps running after the result and reports it ended after the final result', async () => {
		const { result, events } = await launch({ CLAUDE_MOCK_AFTER_RESULT: 'hang' }, { resultGraceMs: 400 });

		expect(result.exitCode).toBe(0);
		expect(result.endedAfterResult).toEqual({ graceMs: 400 });
		expect(results(events)).toHaveLength(1);
		expect(warnings.join('\n')).toMatch(
			/ended after the final result.*400 ms|400 ms.*ended after the final result/s
		);
	});

	it('leaves no orphan: the grandchild holding the stdio pipes is killed with the tree', async () => {
		await launch({ CLAUDE_MOCK_AFTER_RESULT: 'hang' }, { resultGraceMs: 400 });

		const grandchildPid = Number(fs.readFileSync(pidFile, 'utf8'));
		expect(Number.isInteger(grandchildPid)).toBe(true);
		// taskkill / SIGKILL are asynchronous for the OS: allow a short moment for the pid to disappear
		await vi.waitFor(() => expect(isAlive(grandchildPid)).toBe(false), { timeout: 5000, interval: 100 });
	});

	it('consumes a follow-up turn arriving within the grace period; its result replaces the earlier one', async () => {
		const { result, events } = await launch(
			{
				CLAUDE_MOCK_AFTER_RESULT: 'followup',
				CLAUDE_MOCK_FOLLOWUP_DELAY_MS: '150',
				CLAUDE_MOCK_RESPONSE: 'first',
			},
			{ resultGraceMs: 2000 }
		);

		const all = results(events);
		expect(all).toHaveLength(2);
		expect(all[1]?.data.result).toBe('first (follow-up)');
		// The process exited by itself: nothing was terminated
		expect(result.endedAfterResult).toBeUndefined();
		expect(result.exitCode).toBe(0);
	});

	it('restarts the wait on the follow-up result: a process hanging after it is terminated one grace period after that result', async () => {
		const { result, events, elapsedMs } = await launch(
			{
				CLAUDE_MOCK_AFTER_RESULT: 'followup',
				CLAUDE_MOCK_FOLLOWUP_DELAY_MS: '300',
				CLAUDE_MOCK_AFTER_FOLLOWUP: 'hang',
			},
			{ resultGraceMs: 600 }
		);

		expect(results(events)).toHaveLength(2);
		expect(result.endedAfterResult).toEqual({ graceMs: 600 });
		// 300 ms before the follow-up + 600 ms grace after it (not 600 ms after the first result)
		expect(elapsedMs).toBeGreaterThanOrEqual(850);
	});

	it('does not terminate a process that exits by itself right after the result', async () => {
		const { result, events, elapsedMs } = await launch({}, { resultGraceMs: 5000 });

		expect(results(events)).toHaveLength(1);
		expect(result.endedAfterResult).toBeUndefined();
		expect(result.exitCode).toBe(0);
		expect(elapsedMs).toBeLessThan(4000);
	});

	it('is unchanged without any result event: a slow process is never terminated by the grace period', async () => {
		const { result, events } = await launch({ CLAUDE_MOCK_NO_RESULT_DELAY_MS: '900' }, { resultGraceMs: 200 });

		expect(results(events)).toHaveLength(0);
		expect(result.endedAfterResult).toBeUndefined();
		expect(result.exitCode).toBe(0);
	});

	it('keeps the failure exit code of a process that exits with an error', async () => {
		const { result } = await launch({ CLAUDE_MOCK_EXIT_CODE: '3' }, { resultGraceMs: 5000 });

		expect(result.exitCode).toBe(3);
		expect(result.endedAfterResult).toBeUndefined();
	});

	it('rejects a non-positive grace period with an actionable message', async () => {
		await expect(launch({}, { resultGraceMs: 0 })).rejects.toThrow(/resultGraceMs/);
	});
});
